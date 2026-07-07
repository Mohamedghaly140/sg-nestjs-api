import { ConflictException, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Logger } from 'nestjs-pino';
import { Prisma, Role } from '../../generated/prisma/client';
import { ERROR_CODES } from '../../common/constants/error-codes';
import { buildPaginationMeta } from '../../common/utils/build-pagination-meta';
import { PrismaService } from '../../prisma/prisma.service';
import { ClerkSyncService } from '../auth/services/clerk-sync.service';
import { QueryAdminUsersDto } from './dto/query-admin-users.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { ResetPasswordMailService } from './services/reset-password-mail.service';

const ME_SELECT = {
  id: true,
  email: true,
  name: true,
  phone: true,
  role: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clerkSync: ClerkSyncService,
    private readonly resetPasswordMail: ResetPasswordMailService,
    private readonly logger: Logger,
  ) {}

  getMe(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: ME_SELECT,
    });
  }

  async updateMe(userId: string, dto: UpdateMeDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: ME_SELECT,
    });
    await this.clerkSync.pushProfileToClerk(userId, dto);
    return user;
  }

  async listUsers(query: QueryAdminUsersDto) {
    const where = this.buildAdminUsersWhere(query);
    const skip = (query.page - 1) * query.limit;
    const [users, totalItems] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      meta: buildPaginationMeta(query.page, query.limit, totalItems),
    };
  }

  async getUser(userId: string) {
    const [user, ordersCount, lastOrder] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      this.prisma.order.count({ where: { userId } }),
      this.prisma.order.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

    return {
      ...user,
      stats: {
        ordersCount,
        lastOrderAt: lastOrder?.createdAt ?? null,
      },
    };
  }

  async updateRole(actingId: string, targetId: string, role: Role) {
    this.assertNotSelf(actingId, targetId);
    const user = await this.prisma.user.update({
      where: { id: targetId },
      data: { role },
    });

    await this.clerkSync.mirrorRoleToClerk(targetId, role);
    this.logAdminMutation('update-role', actingId, targetId, { role });
    return user;
  }

  async updateStatus(actingId: string, targetId: string, active: boolean) {
    this.assertNotSelf(actingId, targetId);
    const user = await this.prisma.user.update({
      where: { id: targetId },
      data: { active },
    });

    this.logAdminMutation('update-status', actingId, targetId, { active });
    return user;
  }

  async resetPassword(
    actingId: string,
    targetId: string,
  ): Promise<{ sent: true }> {
    const target = await this.prisma.user.findUniqueOrThrow({
      where: { id: targetId },
    });

    // A Manager+ actor can never be USER, so this also rejects self-targeting
    // without a separate actor-role branch.
    if (target.role !== Role.USER) {
      throw new ConflictException({
        code: ERROR_CODES.FORBIDDEN_TARGET,
        message: 'Password reset target must have the USER role',
      });
    }

    const randomPassword = `${randomBytes(24).toString('base64url')}Aa1!`;
    await this.clerkSync.setRandomPassword(target.id, randomPassword);
    this.logAdminMutation('reset-password', actingId, targetId);
    await this.resetPasswordMail.sendPasswordResetNotice(
      target.email,
      target.name,
    );
    return { sent: true };
  }

  private assertNotSelf(actingId: string, targetId: string): void {
    if (actingId === targetId) {
      throw new ConflictException({
        code: ERROR_CODES.SELF_MODIFICATION_FORBIDDEN,
        message: 'You cannot modify your own role or activation status',
      });
    }
  }

  private buildAdminUsersWhere(
    query: QueryAdminUsersDto,
  ): Prisma.UserWhereInput {
    return {
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.role === undefined ? {} : { role: query.role }),
      ...(query.active === undefined ? {} : { active: query.active }),
    };
  }

  private logAdminMutation(
    action: string,
    actingId: string,
    targetId: string,
    details: Record<string, unknown> = {},
  ): void {
    this.logger.log(
      { audit: true, action, actingId, targetId, ...details },
      `Admin user action: ${action}`,
    );
  }
}
