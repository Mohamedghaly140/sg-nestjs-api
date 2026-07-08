import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import {
  PublicProductCardDto,
  PublicProductDetailDto,
} from './dto/product-response.dto';
import { QueryPublicProductsDto } from './dto/query-public-products.dto';
import { ProductsService } from './products.service';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List active storefront products' })
  @ApiResponse({ status: 200, type: PublicProductCardDto, isArray: true })
  list(@Query() query: QueryPublicProductsDto) {
    return this.products.listProducts(query);
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Get an active storefront product by slug' })
  @ApiParam({
    name: 'slug',
    description: 'Product slug',
    example: 'satin-cowl-neck-dress',
  })
  @ApiResponse({ status: 200, type: PublicProductDetailDto })
  @ApiResponse({ status: 404, description: 'Product missing or not active' })
  getBySlug(@Param('slug') slug: string) {
    return this.products.getBySlug(slug);
  }
}
