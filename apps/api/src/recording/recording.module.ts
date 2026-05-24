import { Module } from '@nestjs/common';
import { RecordingService } from './recording.service';
import { RecordingController } from './recording.controller';

@Module({
  providers: [RecordingService],
  controllers: [RecordingController]
})
export class RecordingModule {}
