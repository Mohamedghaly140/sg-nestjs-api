import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Logger } from 'nestjs-pino';
import { ERROR_CODES } from '../../common/constants/error-codes';
import { buildPaginationMeta } from '../../common/utils/build-pagination-meta';
import { Prisma, Role } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CLERK_CLIENT, type ClerkClient } from '../auth/clerk-client.provider';
import { ClerkSyncService } from '../auth/services/clerk-sync.service';
import { AdminCustomerDetailResponseDto } from './dto/admin-customer-detail-response.dto';
import { AdminCustomerResponseDto } from './dto/admin-customer-response.dto';
import { QueryAdminCustomersDto } from './dto/query-admin-customers.dto';
import { ResetPasswordMailService } from './services/reset-password-mail.service';
import {
  assertNotSelf,
  logAdminMutation,
  logCriticalCompensationFailure,
} from './utils/admin-mutation.utils';

const CUSTOMER_ROW_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  active: true,
  createdAt: true,
  _count: { select: { orders: true } },
} satisfies Prisma.UserSelect;

@Injectable()
export class AdminCustomersService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLERK_CLIENT) private readonly clerk: ClerkClient,
    private readonly clerkSync: ClerkSyncService,
    private readonly resetPasswordMail: ResetPasswordMailService,
    private readonly logger: Logger,
  ) {}

  async listCustomers(query: QueryAdminCustomersDto) {
    const where = this.buildCustomersWhere(query);
    const skip = (query.page - 1) * query.limit;
    const [customers, totalItems] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: CUSTOMER_ROW_SELECT,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: customers.map((customer): AdminCustomerResponseDto => ({
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        active: customer.active,
        createdAt: customer.createdAt,
        ordersCount: customer._count.orders,
      })),
      meta: buildPaginationMeta(query.page, query.limit, totalItems),
    };
  }

  async getCustomer(id: string): Promise<AdminCustomerDetailResponseDto> {
    const customer = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        active: true,
        role: true,
        createdAt: true,
        addresses: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            alias: true,
            country: true,
            governorate: true,
            city: true,
            area: true,
            phone: true,
            addressLine1: true,
            details: true,
            postalCode: true,
            latitude: true,
            longitude: true,
            isDefault: true,
            createdAt: true,
          },
        },
        orders: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            humanOrderId: true,
            status: true,
            paymentMethod: true,
            totalOrderPrice: true,
            isPaid: true,
            createdAt: true,
            _count: { select: { items: true } },
          },
        },
      },
    });

    if (!customer || customer.role !== Role.USER) {
      throw new NotFoundException();
    }

    return {
      ...customer,
      orders: customer.orders.map((order) => ({
        id: order.id,
        humanOrderId: order.humanOrderId,
        status: order.status,
        paymentMethod: order.paymentMethod,
        totalOrderPrice:
          order.totalOrderPrice === null ? null : Number(order.totalOrderPrice),
        isPaid: order.isPaid,
        createdAt: order.createdAt,
        itemsCount: order._count.items,
      })),
    };
  }

  async setActive(actingId: string, targetId: string, active: boolean) {
    assertNotSelf(actingId, targetId);
    const target = await this.prisma.user.findUniqueOrThrow({
      where: { id: targetId },
      select: { id: true, role: true, active: true },
    });

    if (target.role !== Role.USER) {
      throw new ConflictException({
        code: ERROR_CODES.FORBIDDEN_TARGET,
        message: 'Customer activation target must have the USER role',
      });
    }

    await this.applyClerkActive(targetId, active);

    try {
      const updated = await this.prisma.user.update({
        where: { id: targetId },
        data: { active },
        select: { id: true, active: true },
      });
      logAdminMutation(this.logger, 'customer-set-active', actingId, targetId, {
        active,
      });
      return updated;
    } catch (error: unknown) {
      await this.revertClerkActive(actingId, targetId, target.active, error);
      throw error;
    }
  }

  async resetPassword(
    actingId: string,
    targetId: string,
  ): Promise<{ sent: true }> {
    const target = await this.prisma.user.findUniqueOrThrow({
      where: { id: targetId },
    });

    if (target.role !== Role.USER) {
      throw new ConflictException({
        code: ERROR_CODES.FORBIDDEN_TARGET,
        message: 'Password reset target must have the USER role',
      });
    }

    const randomPassword = `${randomBytes(24).toString('base64url')}Aa1!`;
    await this.clerkSync.setRandomPassword(target.id, randomPassword);
    logAdminMutation(
      this.logger,
      'customer-reset-password',
      actingId,
      targetId,
    );
    await this.resetPasswordMail.sendPasswordResetNotice(
      target.email,
      target.name,
    );
    return { sent: true };
  }

  private buildCustomersWhere(
    query: QueryAdminCustomersDto,
  ): Prisma.UserWhereInput {
    return {
      role: Role.USER,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.active === undefined ? {} : { active: query.active }),
    };
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

  private async revertClerkActive(
    actingId: string,
    targetId: string,
    active: boolean,
    originalError: unknown,
  ): Promise<void> {
    try {
      await this.applyClerkActive(targetId, active);
    } catch (revertError: unknown) {
      logCriticalCompensationFailure(
        this.logger,
        'customer-set-active-compensation',
        actingId,
        targetId,
        { active },
        { originalError },
        revertError,
      );
    }
  }
}
