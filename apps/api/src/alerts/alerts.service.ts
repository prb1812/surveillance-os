import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class AlertsService {
  constructor(private prisma: PrismaService) {}

  async findAll(currentUser: any) {
    // Super Admin sees all alerts
    if (currentUser.role === Role.SUPER_ADMIN) {
      return this.prisma.alert.findMany({
        include: {
          camera: { select: { id: true, name: true } },
          client: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    // Operator sees alerts for assigned cameras
    if (currentUser.role === Role.OPERATOR) {
      const assignments = await this.prisma.cameraAssignment.findMany({
        where: { operatorId: currentUser.id },
        select: { cameraId: true },
      });
      const cameraIds = assignments.map((a) => a.cameraId);
      return this.prisma.alert.findMany({
        where: { cameraId: { in: cameraIds } },
        include: {
          camera: { select: { id: true, name: true } },
          client: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    // Customer sees only their alerts
    return this.prisma.alert.findMany({
      where: { clientId: currentUser.clientId },
      include: {
        camera: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(data: any) {
    return this.prisma.alert.create({
      data,
      include: {
        camera: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
      },
    });
  }

  async acknowledge(id: string, currentUser: any) {
    const alert = await this.prisma.alert.findUnique({ where: { id } });
    if (!alert) throw new NotFoundException('Alert not found');

    return this.prisma.alert.update({
      where: { id },
      data: {
        status: 'ACKNOWLEDGED',
        acknowledgedById: currentUser.id,
        acknowledgedAt: new Date(),
      },
    });
  }

  async resolve(id: string, currentUser: any, notes?: string) {
    const alert = await this.prisma.alert.findUnique({ where: { id } });
    if (!alert) throw new NotFoundException('Alert not found');

    return this.prisma.alert.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        resolvedById: currentUser.id,
        resolvedAt: new Date(),
        notes,
      },
    });
  }
}