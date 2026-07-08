import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { MANAGER_PLUS, Roles } from '../../common/decorators/roles.decorator';
import { AdminCategoriesService } from './admin-categories.service';
import { AdminCategoryResponseDto } from './dto/category-response.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { QueryAdminCategoriesDto } from './dto/query-admin-categories.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@ApiTags('admin/categories')
@ApiBearerAuth()
@Controller('admin/categories')
@Roles(...MANAGER_PLUS)
export class AdminCategoriesController {
  constructor(private readonly categories: AdminCategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'List categories for administration' })
  @ApiResponse({ status: 200, type: AdminCategoryResponseDto, isArray: true })
  list(@Query() query: QueryAdminCategoriesDto) {
    return this.categories.listCategories(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a category' })
  @ApiResponse({ status: 201, type: AdminCategoryResponseDto })
  @ApiResponse({ status: 409, description: 'Duplicate category name or slug' })
  create(@Body() dto: CreateCategoryDto) {
    return this.categories.createCategory(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a category' })
  @ApiParam({ name: 'id', description: 'Category ID' })
  @ApiResponse({ status: 200, type: AdminCategoryResponseDto })
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categories.updateCategory(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a category' })
  @ApiParam({ name: 'id', description: 'Category ID' })
  @ApiResponse({ status: 204, description: 'Category deleted' })
  @ApiResponse({
    status: 409,
    description: 'Category has products or sub-categories',
  })
  delete(@Param('id') id: string) {
    return this.categories.removeCategory(id);
  }
}
