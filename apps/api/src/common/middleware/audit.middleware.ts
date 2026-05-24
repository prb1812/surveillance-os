import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditMiddleware implements NestMiddleware {
  constructor(private prisma: PrismaService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const startTime = Date.now();

    res.on('finish', async () => {
      // Only log mutations (POST, PATCH, DELETE)
      if (['POST', 'PATCH', 'DELETE'].includes(req.method)) {
        try {
          const user = (req as any).user;
          await this.prisma.auditLog.create({
            data: {
              action: `${req.method} ${req.path}`,
              resource: req.path.split('/')[1],
              details: {
                method: req.method,
                path: req.path,
                statusCode: res.statusCode,
                duration: Date.now() - startTime,
              },
              ipAddress: req.ip,
              userAgent: req.headers['user-agent'],
              userId: user?.id || null,
            },
          });
        } catch (error) {
          // Don't break the request if audit logging fails
          console.error('Audit log error:', error);
        }
      }
    });

    next();
  }
}