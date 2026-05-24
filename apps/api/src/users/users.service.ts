import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(currentUser: any) {
    // Super admin sees all users
    if (currentUser.role === Role.SUPER_ADMIN) {
      return this.prisma.user.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          clientId: true,
          lastLoginAt: true,
          createdAt: true,
        },
      });
    }

    // Customer sees only their own profile
    return this.prisma.user.findMany({
      where: { id: currentUser.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        clientId: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
  }

  async findOne(id: string, currentUser: any) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        clientId: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Non-admin can only see themselves
    if (currentUser.role !== Role.SUPER_ADMIN && currentUser.id !== id) {
      throw new ForbiddenException('Access denied');
    }

    return user;
  }

  async create(data: any) {
    const hashedPassword = await bcrypt.hash(data.password, 10);
    return this.prisma.user.create({
      data: {
        ...data,
        password: hashedPassword,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        clientId: true,
        createdAt: true,
      },
    });
  }

  async update(id: string, data: any, currentUser: any) {
    // Only admin or the user themselves can update
    if (currentUser.role !== Role.SUPER_ADMIN && currentUser.id !== id) {
      throw new ForbiddenException('Access denied');
    }

    if (data.password) {
      data.password = await bcrypt.hash(data.password, 10);
    }

    return this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        clientId: true,
        createdAt: true,
      },
    });
  }

  async remove(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
  }
}