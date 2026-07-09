import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { OrderMailListener } from './listeners/order-mail.listener';
import { MailService } from './mail.service';
import { RESEND_CLIENT, resendClientProvider } from './resend-client.provider';

@Module({
  imports: [OrdersModule],
  providers: [resendClientProvider, MailService, OrderMailListener],
  exports: [RESEND_CLIENT, MailService],
})
export class MailModule {}
