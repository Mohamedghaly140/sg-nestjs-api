import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CartCleanupCron } from './cart-cleanup.cron';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { CartIdentityMiddleware } from './middleware/cart-identity.middleware';

@Module({
  imports: [AuthModule],
  controllers: [CartController],
  providers: [CartService, CartCleanupCron, CartIdentityMiddleware],
  exports: [CartService, CartIdentityMiddleware],
})
export class CartModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CartIdentityMiddleware).forRoutes(CartController);
  }
}
