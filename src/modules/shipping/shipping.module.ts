import { Module } from '@nestjs/common';
import { AdminShippingZonesController } from './admin-shipping-zones.controller';
import { AdminShippingZonesService } from './admin-shipping-zones.service';
import { ShippingController } from './shipping.controller';
import { ShippingService } from './shipping.service';

@Module({
  controllers: [ShippingController, AdminShippingZonesController],
  providers: [ShippingService, AdminShippingZonesService],
  exports: [ShippingService],
})
export class ShippingModule {}
