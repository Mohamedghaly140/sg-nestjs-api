import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import { AdminCategoriesController } from './admin-categories.controller';
import { AdminCategoriesService } from './admin-categories.service';
import { AdminSubCategoriesController } from './admin-sub-categories.controller';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { SubCategoriesService } from './sub-categories.service';

@Module({
  imports: [UploadsModule],
  controllers: [
    CategoriesController,
    AdminCategoriesController,
    AdminSubCategoriesController,
  ],
  providers: [CategoriesService, AdminCategoriesService, SubCategoriesService],
})
export class CategoriesModule {}
