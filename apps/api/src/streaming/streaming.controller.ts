import {
  Controller,
  Get,
  Param,
  UseGuards,
} from '@nestjs/common';
import { StreamingService } from './streaming.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('streaming')
@UseGuards(JwtAuthGuard)
export class StreamingController {
  constructor(private readonly streamingService: StreamingService) {}

  @Get()
  getActiveStreams(@CurrentUser() currentUser: any) {
    return this.streamingService.getActiveStreams(currentUser);
  }

  @Get(':cameraId')
  getCameraStream(@Param('cameraId') cameraId: string) {
    return this.streamingService.getCameraStream(cameraId);
  }
}