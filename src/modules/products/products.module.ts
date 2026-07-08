import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import { AdminProductsController } from './admin-products.controller';
import { AdminProductsService } from './admin-products.service';
import { ManageProductsService } from './manage-products.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [UploadsModule],
  controllers: [ProductsController, AdminProductsController],
  providers: [ProductsService, AdminProductsService, ManageProductsService],
})
export class ProductsModule {}
