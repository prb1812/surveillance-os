import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class CamerasService {
  constructor(private prisma: PrismaService) {}

  async findAll(currentUser: any) {
    // Super Admin sees all cameras
    if (currentUser.role === Role.SUPER_ADMIN) {
      return this.prisma.camera.findMany({
        include: { client: { select: { id: true, name: true } } },
      });
    }

    // Operator sees only assigned cameras
    if (currentUser.role === Role.OPERATOR) {
      return this.prisma.camera.findMany({
        where: {
          assignments: { some: { operatorId: currentUser.id } },
        },
        include: { client: { select: { id: true, name: true } } },
      });
    }

    // Customer sees only their cameras
    return this.prisma.camera.findMany({
      where: { clientId: currentUser.clientId },
      include: { client: { select: { id: true, name: true } } },
    });
  }

  async findOne(id: string, currentUser: any) {
    const camera = await this.prisma.camera.findUnique({
      where: { id },
      include: { client: { select: { id: true, name: true } } },
    });

    if (!camera) {
      throw new NotFoundException('Camera not found');
    }

    // Check access
    if (currentUser.role === Role.CUSTOMER) {
      if (camera.clientId !== currentUser.clientId) {
        throw new ForbiddenException('Access denied');
      }
    }

    if (currentUser.role === Role.OPERATOR) {
      const assignment = await this.prisma.cameraAssignment.findFirst({
        where: { cameraId: id, operatorId: currentUser.id },
      });
      if (!assignment) {
        throw new ForbiddenException('Access denied');
      }
    }

    return camera;
  }

  async create(data: any) {
    return this.prisma.camera.create({
      data,
      include: { client: { select: { id: true, name: true } } },
    });
  }

  async update(id: string, data: any) {
    return this.prisma.camera.update({
      where: { id },
      data,
      include: { client: { select: { id: true, name: true } } },
    });
  }

  async remove(id: string) {
    return this.prisma.camera.update({
      where: { id },
      data: { isActive: false },
    });
  }
}