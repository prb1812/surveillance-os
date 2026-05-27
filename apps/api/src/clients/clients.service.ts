import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class ClientsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.client.findMany({
      include: {
        _count: {
          select: { cameras: true, users: true, alerts: true },
        },
      },
    });
  }

  async findOne(id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: {
        cameras: true,
        users: {
          select: { id: true, email: true, name: true, role: true, isActive: true },
        },
      },
    });
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  async create(data: any) {
    const { password, name, email, phone, address, plan } = data;

    const client = await this.prisma.client.create({
      data: { name, email, phone, address, plan },
    });

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      await this.prisma.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role: 'CUSTOMER',
          clientId: client.id,
        },
      });
    }

    return this.prisma.client.findUnique({
      where: { id: client.id },
      include: { _count: { select: { cameras: true, users: true, alerts: true } } },
    });
  }

  async update(id: string, data: any) {
    const { password, name, email, phone, address, plan, isActive } = data;

    const client = await this.prisma.client.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(email !== undefined && { email }),
        ...(phone !== undefined && { phone }),
        ...(address !== undefined && { address }),
        ...(plan !== undefined && { plan }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      await this.prisma.user.updateMany({
        where: { clientId: id, role: 'CUSTOMER' },
        data: { password: hashedPassword },
      });
    }

    if (email) {
      await this.prisma.user.updateMany({
        where: { clientId: id, role: 'CUSTOMER' },
        data: { email },
      });
    }

    return client;
  }

  async remove(id: string) {
    return this.prisma.client.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
