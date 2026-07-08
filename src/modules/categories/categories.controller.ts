import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CategoriesService } from './categories.service';
import { PublicCategoryResponseDto } from './dto/category-response.dto';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List the public category tree' })
  @ApiResponse({ status: 200, type: PublicCategoryResponseDto, isArray: true })
  listTree() {
    return this.categories.listTree();
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Get a public category by slug' })
  @ApiParam({ name: 'slug', description: 'Category slug', example: 'dresses' })
  @ApiResponse({ status: 200, type: PublicCategoryResponseDto })
  getBySlug(@Param('slug') slug: string) {
    return this.categories.getBySlug(slug);
  }
}
