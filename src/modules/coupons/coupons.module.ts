import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CartModule } from '../cart/cart.module';
import { CartIdentityMiddleware } from '../cart/middleware/cart-identity.middleware';
import { AdminCouponsController } from './admin-coupons.controller';
import { AdminCouponsService } from './admin-coupons.service';
import { CouponsController } from './coupons.controller';
import { CouponsService } from './coupons.service';

@Module({
  imports: [CartModule, AuthModule],
  controllers: [CouponsController, AdminCouponsController],
  providers: [CouponsService, AdminCouponsService],
  exports: [CouponsService],
})
export class CouponsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CartIdentityMiddleware).forRoutes(CouponsController);
  }
}
