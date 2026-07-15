import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { ERROR_CODES } from '../../common/constants/error-codes';
import { buildPaginationMeta } from '../../common/utils/build-pagination-meta';
import { Prisma, Role } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CLERK_CLIENT, type ClerkClient } from '../auth/clerk-client.provider';
import { composeClerkName } from '../auth/utils/compose-clerk-name';
import { AdminUserResponseDto } from './dto/admin-user-response.dto';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { QueryAdminUsersDto } from './dto/query-admin-users.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import {
  assertNotSelf,
  isClerkNotFound,
  logAdminMutation,
  logCriticalCompensationFailure,
  toValidationException,
} from './utils/admin-mutation.utils';

const ADMIN_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  active: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

type AdminUserSnapshot = Prisma.UserGetPayload<{
  select: typeof ADMIN_USER_SELECT;
}>;

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLERK_CLIENT) private readonly clerk: ClerkClient,
    private readonly logger: Logger,
  ) {}

  async listUsers(query: QueryAdminUsersDto) {
    const where = this.buildAdminUsersWhere(query);
    const skip = (query.page - 1) * query.limit;
    const [users, totalItems] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: ADMIN_USER_SELECT,
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

  async createUser(
    actingId: string,
    dto: CreateAdminUserDto,
  ): Promise<AdminUserResponseDto> {
    const name = composeClerkName(dto.firstName, dto.lastName);
    let clerkUserId: string;

    try {
      const clerkUser = await this.clerk.users.createUser({
        emailAddress: [dto.email],
        phoneNumber: [dto.phone],
        username: this.deriveUsername(dto.email),
        password: dto.password,
        firstName: dto.firstName,
        lastName: dto.lastName,
        publicMetadata: { role: dto.role },
      });
      clerkUserId = clerkUser.id;
    } catch (error: unknown) {
      const validation = toValidationException(error);
      if (validation) {
        throw validation;
      }
      throw error;
    }

    try {
      const user = await this.prisma.user.upsert({
        where: { id: clerkUserId },
        update: {
          email: dto.email,
          name,
          phone: dto.phone,
          role: dto.role,
        },
        create: {
          id: clerkUserId,
          email: dto.email,
          name,
          phone: dto.phone,
          role: dto.role,
        },
        select: ADMIN_USER_SELECT,
      });
      logAdminMutation(this.logger, 'admin-user-create', actingId, user.id, {
        role: dto.role,
      });
      return user;
    } catch (error: unknown) {
      try {
        await this.clerk.users.deleteUser(clerkUserId);
      } catch (compensationError: unknown) {
        logCriticalCompensationFailure(
          this.logger,
          'admin-user-create-compensation',
          actingId,
          clerkUserId,
          { deletedFromClerk: true },
          { deletedFromClerk: false },
          compensationError,
        );
      }
      throw error;
    }
  }

  async updateUser(
    actingId: string,
    targetId: string,
    dto: UpdateAdminUserDto,
  ): Promise<AdminUserResponseDto> {
    assertNotSelf(actingId, targetId);
    const previous = await this.prisma.user.findUniqueOrThrow({
      where: { id: targetId },
      select: ADMIN_USER_SELECT,
    });
    await this.assertNotLastActiveAdmin(targetId, previous, dto);

    const roleChanged = previous.role !== dto.role;
    const activeChanged = previous.active !== dto.active;

    try {
      if (roleChanged) {
        await this.updateClerkRole(targetId, dto.role);
      }
      if (activeChanged) {
        await this.applyClerkActive(targetId, dto.active);
      }
    } catch (error: unknown) {
      if (roleChanged && activeChanged) {
        await this.revertClerkRole(
          actingId,
          targetId,
          previous.role,
          'admin-user-update-ban-compensation',
          error,
        );
      }
      throw error;
    }

    try {
      const user = await this.prisma.user.update({
        where: { id: targetId },
        data: { role: dto.role, active: dto.active },
        select: ADMIN_USER_SELECT,
      });
      logAdminMutation(this.logger, 'admin-user-update', actingId, targetId, {
        role: dto.role,
        active: dto.active,
      });
      return user;
    } catch (error: unknown) {
      await this.revertAppliedClerkWrites(
        actingId,
        targetId,
        previous,
        roleChanged,
        activeChanged,
        error,
      );
      throw error;
    }
  }

  async deleteUser(actingId: string, targetId: string): Promise<void> {
    assertNotSelf(actingId, targetId);
    const target = await this.prisma.user.findUniqueOrThrow({
      where: { id: targetId },
      select: ADMIN_USER_SELECT,
    });
    await this.assertNotLastActiveAdmin(targetId, target, {
      role: Role.USER,
      active: false,
    });

    try {
      await this.clerk.users.deleteUser(targetId);
    } catch (error: unknown) {
      if (!isClerkNotFound(error)) {
        throw error;
      }
    }

    // deleteMany tolerates the row already being gone: a successful Clerk
    // delete can fire the user.deleted webhook, whose handler may remove the
    // local row before this statement runs.
    await this.prisma.user.deleteMany({ where: { id: targetId } });
    logAdminMutation(this.logger, 'admin-user-delete', actingId, targetId, {
      role: target.role,
    });
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
            ],
          }
        : {}),
      ...(query.role === undefined ? {} : { role: query.role }),
      ...(query.active === undefined ? {} : { active: query.active }),
    };
  }

  private deriveUsername(email: string): string {
    const [localPart = 'user'] = email.split('@');
    return localPart.replace(/[^a-zA-Z0-9_.-]/g, '_');
  }

  private async assertNotLastActiveAdmin(
    targetId: string,
    previous: Pick<AdminUserSnapshot, 'role' | 'active'>,
    next: Pick<UpdateAdminUserDto, 'role' | 'active'>,
  ): Promise<void> {
    if (
      previous.role !== Role.ADMIN ||
      !previous.active ||
      (next.role === Role.ADMIN && next.active)
    ) {
      return;
    }

    // MVP accepts a small race window between this pre-check and the DB write.
    const otherActiveAdmins = await this.prisma.user.count({
      where: {
        role: Role.ADMIN,
        active: true,
        id: { not: targetId },
      },
    });

    if (otherActiveAdmins === 0) {
      throw new ConflictException({
        code: ERROR_CODES.LAST_ADMIN_REQUIRED,
        message: 'At least one active admin account is required',
      });
    }
  }

  private async updateClerkRole(userId: string, role: Role): Promise<void> {
    await this.clerk.users.updateUserMetadata(userId, {
      publicMetadata: { role },
    });
  }

  private async applyClerkActive(
    userId: string,
    active: boolean,
  ): Promise<void> {
    if (active) {
      await this.clerk.users.unbanUser(userId);
      return;
    }
    await this.clerk.users.banUser(userId);
  }

  private async revertAppliedClerkWrites(
    actingId: string,
    targetId: string,
    previous: AdminUserSnapshot,
    roleChanged: boolean,
    activeChanged: boolean,
    originalError: unknown,
  ): Promise<void> {
    if (activeChanged) {
      await this.revertClerkActive(
        actingId,
        targetId,
        previous.active,
        'admin-user-update-active-compensation',
        originalError,
      );
    }

    if (roleChanged) {
      await this.revertClerkRole(
        actingId,
        targetId,
        previous.role,
        'admin-user-update-role-compensation',
        originalError,
      );
    }
  }

  private async revertClerkRole(
    actingId: string,
    targetId: string,
    role: Role,
    action: string,
    originalError: unknown,
  ): Promise<void> {
    try {
      await this.updateClerkRole(targetId, role);
    } catch (error: unknown) {
      logCriticalCompensationFailure(
        this.logger,
        action,
        actingId,
        targetId,
        { role },
        { originalError },
        error,
      );
    }
  }

  private async revertClerkActive(
    actingId: string,
    targetId: string,
    active: boolean,
    action: string,
    originalError: unknown,
  ): Promise<void> {
    try {
      await this.applyClerkActive(targetId, active);
    } catch (error: unknown) {
      logCriticalCompensationFailure(
        this.logger,
        action,
        actingId,
        targetId,
        { active },
        { originalError },
        error,
      );
    }
  }
}
