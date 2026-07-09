import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CartModule } from '../cart/cart.module';
import { CartIdentityMiddleware } from '../cart/middleware/cart-identity.middleware';
import { CouponsModule } from '../coupons/coupons.module';
import { ShippingModule } from '../shipping/shipping.module';
import { AdminOrdersController } from './admin-orders.controller';
import { AdminOrdersService } from './admin-orders.service';
import { OrderExpiryCron } from './order-expiry.cron';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [AuthModule, CartModule, CouponsModule, ShippingModule],
  controllers: [OrdersController, AdminOrdersController],
  providers: [OrdersService, AdminOrdersService, OrderExpiryCron],
  exports: [OrdersService],
})
export class OrdersModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Matched by controller reference, not a raw string path, so it resolves
    // correctly under the app's global prefix + URI versioning (a bare
    // 'orders/guest' RouteInfo path does not reliably match once versioning
    // is layered on). Harmless on the controller's other routes — the
    // middleware only conditionally sets req.cartIdentity, same as how
    // CartModule already applies it to the whole CartController.
    consumer.apply(CartIdentityMiddleware).forRoutes(OrdersController);
  }
}
