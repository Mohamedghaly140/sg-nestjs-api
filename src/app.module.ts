import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { randomUUID } from 'node:crypto';
import { LoggerModule } from 'nestjs-pino';
import { CommonModule } from './common/common.module';
import configuration from './config/configuration';
import { validate } from './config/env.validation';
import { AuthModule } from './modules/auth/auth.module';
import { AddressesModule } from './modules/addresses/addresses.module';
import { CartModule } from './modules/cart/cart.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { ClerkAuthGuard } from './modules/auth/guards/clerk-auth.guard';
import { CouponsModule } from './modules/coupons/coupons.module';
import { RolesGuard } from './modules/auth/guards/roles.guard';
import { HealthModule } from './modules/health/health.module';
import { MailModule } from './modules/mail/mail.module';
import { OrdersModule } from './modules/orders/orders.module';
import { ProductsModule } from './modules/products/products.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { ShippingModule } from './modules/shipping/shipping.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { UsersModule } from './modules/users/users.module';
import { WishlistModule } from './modules/wishlist/wishlist.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: configuration,
      validate,
      cache: true,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const nodeEnv = config.get<string>('app.nodeEnv');

        return {
          pinoHttp: {
            level:
              nodeEnv === 'production'
                ? 'info'
                : nodeEnv === 'test'
                  ? 'silent'
                  : 'debug',
            transport:
              nodeEnv === 'development'
                ? {
                    target: 'pino-pretty',
                  }
                : undefined,
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.headers["x-cart-session"]',
                'req.body.guestToken',
                'req.body.sessionToken',
                'res.headers["set-cookie"]',
              ],
              censor: '[REDACTED]',
            },
            genReqId: (request, response) => {
              const incomingRequestId = request.headers['x-request-id'];
              const requestId =
                typeof incomingRequestId === 'string'
                  ? incomingRequestId
                  : randomUUID();

              response.setHeader('X-Request-Id', requestId);
              return requestId;
            },
          },
        };
      },
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    PrismaModule,
    CommonModule,
    AuthModule,
    AddressesModule,
    UsersModule,
    UploadsModule,
    CategoriesModule,
    ProductsModule,
    ReviewsModule,
    WishlistModule,
    CartModule,
    CouponsModule,
    ShippingModule,
    OrdersModule,
    MailModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ClerkAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
