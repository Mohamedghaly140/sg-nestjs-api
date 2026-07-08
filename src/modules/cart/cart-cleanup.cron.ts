import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CartCleanupCron {
  private readonly logger = new Logger(CartCleanupCron.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async purgeExpiredCarts(): Promise<void> {
    const result = await this.prisma.cart.deleteMany({
      where: {
        sessionToken: { not: null },
        expiresAt: { lt: new Date() },
      },
    });

    this.logger.log({ deletedCount: result.count }, 'Purged expired carts');
  }
}
