import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('alerts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  findAll(@CurrentUser() currentUser: any) {
    return this.alertsService.findAll(currentUser);
  }

  @Post()
  create(@Body() createAlertDto: any) {
    return this.alertsService.create(createAlertDto);
  }

  @Patch(':id/acknowledge')
  acknowledge(
    @Param('id') id: string,
    @CurrentUser() currentUser: any,
  ) {
    return this.alertsService.acknowledge(id, currentUser);
  }

  @Patch(':id/resolve')
  resolve(
    @Param('id') id: string,
    @CurrentUser() currentUser: any,
    @Body('notes') notes: string,
  ) {
    return this.alertsService.resolve(id, currentUser, notes);
  }
}