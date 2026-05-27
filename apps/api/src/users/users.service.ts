import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(currentUser: any, roleFilter?: string) {
    if (currentUser.role === Role.SUPER_ADMIN) {
      return this.prisma.user.findMany({
        where: roleFilter ? { role: roleFilter as Role } : undefined,
        select: {
          id: true, email: true, name: true, role: true,
          isActive: true, clientId: true, lastLoginAt: true, createdAt: true,
        },
      });
    }
    return this.prisma.user.findMany({
      where: { id: currentUser.id },
      select: {
        id: true, email: true, name: true, role: true,
        isActive: true, clientId: true, lastLoginAt: true, createdAt: true,
      },
    });
  }

  async findOne(id: string, currentUser: any) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true, email: true, name: true, role: true,
        isActive: true, clientId: true, lastLoginAt: true, createdAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    if (currentUser.role !== Role.SUPER_ADMIN && currentUser.id !== id) {
      throw new ForbiddenException('Access denied');
    }
    return user;
  }

  async create(data: any) {
    const existing = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new ConflictException('A user with this email already exists');

    const hashedPassword = await bcrypt.hash(data.password, 10);

    return this.prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: hashedPassword,
        role: data.role ?? Role.OPERATOR,
        isActive: data.isActive ?? true,
        ...(data.clientId && { clientId: data.clientId }),
      },
      select: {
        id: true, email: true, name: true, role: true,
        isActive: true, clientId: true, createdAt: true,
      },
    });
  }

  async update(id: string, data: any, currentUser: any) {
    if (currentUser.role !== Role.SUPER_ADMIN && currentUser.id !== id) {
      throw new ForbiddenException('Access denied');
    }

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.clientId !== undefined) updateData.clientId = data.clientId;
    if (data.password) updateData.password = await bcrypt.hash(data.password, 10);

    return this.prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true, email: true, name: true, role: true,
        isActive: true, clientId: true, createdAt: true,
      },
    });
  }

  async remove(id: string) {
    return this.prisma.user.update({ where: { id }, data: { isActive: false } });
  }
}
