import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class RecordingService {
  private readonly logger = new Logger(RecordingService.name);
  private minioClient: Minio.Client;
  private activeRecordings = new Map<string, any>();

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    // Initialize MinIO client
    this.minioClient = new Minio.Client({
      endPoint: this.configService.get<string>('MINIO_ENDPOINT') || 'localhost',
      port: parseInt(this.configService.get<string>('MINIO_PORT') || '9000'),
      useSSL: false,
      accessKey: this.configService.get<string>('MINIO_ACCESS_KEY') || 'minioadmin',
      secretKey: this.configService.get<string>('MINIO_SECRET_KEY') || 'minioadmin123',
    });

    // Ensure bucket exists
    this.initializeBucket();
  }

  private async initializeBucket() {
    const bucket = this.configService.get<string>('MINIO_BUCKET') || 'surveillance-recordings';
    try {
      const exists = await this.minioClient.bucketExists(bucket);
      if (!exists) {
        await this.minioClient.makeBucket(bucket);
        this.logger.log(`Bucket ${bucket} created`);
      }
    } catch (error) {
      this.logger.error('MinIO bucket init error:', error);
    }
  }

  // Start recording a camera stream
  async startRecording(cameraId: string, rtspUrl: string) {
    if (this.activeRecordings.has(cameraId)) {
      this.logger.log(`Camera ${cameraId} already recording`);
      return;
    }

    const startTime = new Date();
    const fileName = `${cameraId}_${startTime.getTime()}.mp4`;
    const tempPath = `/tmp/${fileName}`;

    this.logger.log(`Starting recording for camera ${cameraId}`);

    // FFmpeg command to record stream
    const ffmpeg = spawn('ffmpeg', [
      '-i', rtspUrl,
      '-c', 'copy',
      '-t', '900', // 15 minutes per segment
      '-y',
      tempPath,
    ]);

    this.activeRecordings.set(cameraId, {
      process: ffmpeg,
      startTime,
      fileName,
      tempPath,
    });

    ffmpeg.on('close', async (code) => {
      this.logger.log(`FFmpeg closed for camera ${cameraId} with code ${code}`);
      await this.saveRecording(cameraId, tempPath, fileName, startTime);
      this.activeRecordings.delete(cameraId);
    });

    ffmpeg.stderr.on('data', (data) => {
      this.logger.debug(`FFmpeg: ${data}`);
    });
  }

  // Save recording to MinIO and database
  private async saveRecording(
    cameraId: string,
    tempPath: string,
    fileName: string,
    startTime: Date,
  ) {
    const bucket = this.configService.get<string>('MINIO_BUCKET') || 'surveillance-recordings';

    try {
      // Check if file exists
      if (!fs.existsSync(tempPath)) {
        this.logger.error(`File not found: ${tempPath}`);
        return;
      }

      const stats = fs.statSync(tempPath);
      const endTime = new Date();
      const storageKey = `recordings/${cameraId}/${fileName}`;

      // Upload to MinIO
      await this.minioClient.fPutObject(bucket, storageKey, tempPath);
      this.logger.log(`Uploaded ${fileName} to MinIO`);

      // Save metadata to database
      await this.prisma.recording.create({
        data: {
          cameraId,
          startTime,
          endTime,
          duration: Math.floor((endTime.getTime() - startTime.getTime()) / 1000),
          storageKey,
          fileSize: stats.size,
        },
      });

      // Delete temp file
      fs.unlinkSync(tempPath);
      this.logger.log(`Recording saved for camera ${cameraId}`);
    } catch (error) {
      this.logger.error(`Error saving recording: ${error}`);
    }
  }

  // Stop recording
  async stopRecording(cameraId: string) {
    const recording = this.activeRecordings.get(cameraId);
    if (recording) {
      recording.process.kill('SIGTERM');
      this.activeRecordings.delete(cameraId);
      this.logger.log(`Stopped recording for camera ${cameraId}`);
    }
  }

  // Get recordings for a camera
  async getRecordings(cameraId: string) {
    return this.prisma.recording.findMany({
      where: { cameraId },
      orderBy: { startTime: 'desc' },
    });
  }

  // Get timeline for a specific date
  async getTimeline(cameraId: string, date: string) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return this.prisma.recording.findMany({
      where: {
        cameraId,
        startTime: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      orderBy: { startTime: 'asc' },
    });
  }

  // Generate presigned URL for playback
  async getPlaybackUrl(recordingId: string) {
    const recording = await this.prisma.recording.findUnique({
      where: { id: recordingId },
    });

    if (!recording) return null;

    const bucket = this.configService.get<string>('MINIO_BUCKET') || 'surveillance-recordings';

    // Generate presigned URL valid for 1 hour
    const url = await this.minioClient.presignedGetObject(
      bucket,
      recording.storageKey,
      3600,
    );

    return { url, recording };
  }
}