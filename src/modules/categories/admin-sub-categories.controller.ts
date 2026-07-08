import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { MANAGER_PLUS, Roles } from '../../common/decorators/roles.decorator';
import { AdminSubCategorySummaryDto } from './dto/category-response.dto';
import { CreateSubCategoryDto } from './dto/create-sub-category.dto';
import { UpdateSubCategoryDto } from './dto/update-sub-category.dto';
import { SubCategoriesService } from './sub-categories.service';

@ApiTags('admin/sub-categories')
@ApiBearerAuth()
@Controller('admin/sub-categories')
@Roles(...MANAGER_PLUS)
export class AdminSubCategoriesController {
  constructor(private readonly subCategories: SubCategoriesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a sub-category' })
  @ApiResponse({ status: 201, type: AdminSubCategorySummaryDto })
  create(@Body() dto: CreateSubCategoryDto) {
    return this.subCategories.createSubCategory(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a sub-category' })
  @ApiParam({ name: 'id', description: 'Sub-category ID' })
  @ApiResponse({ status: 200, type: AdminSubCategorySummaryDto })
  update(@Param('id') id: string, @Body() dto: UpdateSubCategoryDto) {
    return this.subCategories.updateSubCategory(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a sub-category' })
  @ApiParam({ name: 'id', description: 'Sub-category ID' })
  @ApiResponse({ status: 204, description: 'Sub-category deleted' })
  @ApiResponse({ status: 409, description: 'Sub-category has products' })
  delete(@Param('id') id: string) {
    return this.subCategories.removeSubCategory(id);
  }
}
