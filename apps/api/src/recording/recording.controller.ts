import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RecordingService } from './recording.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('recording')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RecordingController {
  constructor(private readonly recordingService: RecordingService) {}

  // GET /recording/:cameraId — get all recordings
  @Get(':cameraId')
  getRecordings(@Param('cameraId') cameraId: string) {
    return this.recordingService.getRecordings(cameraId);
  }

  // GET /recording/:cameraId/timeline?date=YYYY-MM-DD
  @Get(':cameraId/timeline')
  getTimeline(
    @Param('cameraId') cameraId: string,
    @Query('date') date: string,
  ) {
    return this.recordingService.getTimeline(cameraId, date);
  }

  // GET /recording/playback/:recordingId
  @Get('playback/:recordingId')
  getPlaybackUrl(@Param('recordingId') recordingId: string) {
    return this.recordingService.getPlaybackUrl(recordingId);
  }

  // POST /recording/:cameraId/start — Super Admin only
  @Post(':cameraId/start')
  @Roles(Role.SUPER_ADMIN)
  startRecording(@Param('cameraId') cameraId: string) {
    return this.recordingService.startRecording(
      cameraId,
      `rtsp://localhost:8554/camera1`,
    );
  }

  // POST /recording/:cameraId/stop
  @Post(':cameraId/stop')
  @Roles(Role.SUPER_ADMIN)
  stopRecording(@Param('cameraId') cameraId: string) {
    return this.recordingService.stopRecording(cameraId);
  }
}