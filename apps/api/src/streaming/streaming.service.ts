import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class StreamingService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  // Get HLS stream URL for a camera
  getStreamUrl(cameraId: string): string {
    const hlsBase =
      this.configService.get<string>('HLS_BASE_URL') ||
      'http://localhost:8888';
    return `${hlsBase}/${cameraId}/index.m3u8`;
  }

  // Get all active streams
  async getActiveStreams(currentUser: any) {
    const cameras = await this.prisma.camera.findMany({
      where: {
        isActive: true,
        status: 'ONLINE',
      },
      select: {
        id: true,
        name: true,
        location: true,
        status: true,
        clientId: true,
        client: {
          select: { id: true, name: true },
        },
      },
    });

    return cameras.map((camera) => ({
      ...camera,
      streamUrl: this.getStreamUrl(camera.id),
      hlsUrl: this.getStreamUrl(camera.id),
    }));
  }

  // Update camera status when stream comes online/offline
  async updateCameraStatus(cameraId: string, status: 'ONLINE' | 'OFFLINE') {
    return this.prisma.camera.update({
      where: { id: cameraId },
      data: { status },
    });
  }

  // Get stream info for specific camera
  async getCameraStream(cameraId: string) {
    const camera = await this.prisma.camera.findUnique({
      where: { id: cameraId },
      include: {
        client: { select: { id: true, name: true } },
      },
    });

    if (!camera) return null;

    return {
      ...camera,
      streamUrl: this.getStreamUrl(cameraId),
      hlsUrl: this.getStreamUrl(cameraId),
    };
  }
}