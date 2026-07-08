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
import { AdminProductsService } from './admin-products.service';
import { CreateProductDto } from './dto/create-product.dto';
import {
  ReorderProductImagesDto,
  SetProductFeaturedDto,
  SetProductStatusDto,
} from './dto/product-actions.dto';
import { ProductGalleryImageDto } from './dto/product-gallery-image.dto';
import {
  AdminProductDetailDto,
  AdminProductFormDto,
  AdminProductListItemDto,
  DeleteProductResponseDto,
  ProductFeaturedResponseDto,
  ProductFilterOptionsDto,
  ProductFormDataDto,
  ProductImageResponseDto,
  ProductStatusResponseDto,
} from './dto/product-response.dto';
import { QueryAdminProductsDto } from './dto/query-admin-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ManageProductsService } from './manage-products.service';

@ApiTags('admin/products')
@ApiBearerAuth()
@Controller('admin/products')
@Roles(...MANAGER_PLUS)
export class AdminProductsController {
  constructor(
    private readonly adminProducts: AdminProductsService,
    private readonly products: ManageProductsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List products for administration' })
  @ApiResponse({ status: 200, type: AdminProductListItemDto, isArray: true })
  list(@Query() query: QueryAdminProductsDto) {
    return this.adminProducts.listProducts(query);
  }

  @Get('filter-options')
  @ApiOperation({ summary: 'Get product list filter options' })
  @ApiResponse({ status: 200, type: ProductFilterOptionsDto })
  filterOptions() {
    return this.adminProducts.getFilterOptions();
  }

  @Get('form-data')
  @ApiOperation({ summary: 'Get product form reference data' })
  @ApiResponse({ status: 200, type: ProductFormDataDto })
  formData() {
    return this.adminProducts.getFormData();
  }

  @Get(':id/form')
  @ApiOperation({ summary: 'Get a product in edit-form shape' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiResponse({ status: 200, type: AdminProductFormDto })
  getForm(@Param('id') id: string) {
    return this.adminProducts.getForm(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an administrative product detail' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiResponse({ status: 200, type: AdminProductDetailDto })
  getDetail(@Param('id') id: string) {
    return this.adminProducts.getDetail(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a product' })
  @ApiResponse({ status: 201, type: AdminProductDetailDto })
  @ApiResponse({ status: 422, description: 'Sub-category/category mismatch' })
  create(@Body() dto: CreateProductDto) {
    return this.products.createProduct(dto);
  }

  @Post(':id/duplicate')
  @ApiOperation({ summary: 'Duplicate a product as a draft' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiResponse({ status: 201, type: AdminProductDetailDto })
  duplicate(@Param('id') id: string) {
    return this.products.duplicateProduct(id);
  }

  @Patch(':id/featured')
  @ApiOperation({ summary: 'Set a product featured flag' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiResponse({ status: 200, type: ProductFeaturedResponseDto })
  setFeatured(@Param('id') id: string, @Body() dto: SetProductFeaturedDto) {
    return this.products.setFeatured(id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Set a product status' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiResponse({ status: 200, type: ProductStatusResponseDto })
  setStatus(@Param('id') id: string, @Body() dto: SetProductStatusDto) {
    return this.products.setStatus(id, dto);
  }

  @Post(':id/images')
  @ApiOperation({ summary: 'Add a product gallery image' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiResponse({ status: 201, type: ProductImageResponseDto })
  addImage(@Param('id') id: string, @Body() dto: ProductGalleryImageDto) {
    return this.products.addImage(id, dto);
  }

  @Patch(':id/images/reorder')
  @ApiOperation({ summary: 'Reorder product gallery images' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiResponse({ status: 200, type: ProductImageResponseDto, isArray: true })
  @ApiResponse({
    status: 422,
    description: 'Image IDs are not an exact permutation',
  })
  reorderImages(@Param('id') id: string, @Body() dto: ReorderProductImagesDto) {
    return this.products.reorderImages(id, dto.order);
  }

  @Delete(':id/images/:imageId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a product gallery image' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiParam({ name: 'imageId', description: 'ProductImage row ID' })
  @ApiResponse({ status: 204, description: 'Gallery image removed' })
  removeImage(
    @Param('id') id: string,
    @Param('imageId') imageRecordId: string,
  ) {
    return this.products.removeImage(id, imageRecordId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a product' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiResponse({ status: 200, type: AdminProductDetailDto })
  @ApiResponse({ status: 422, description: 'Sub-category/category mismatch' })
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.products.updateProduct(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete or archive a product' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiResponse({ status: 200, type: DeleteProductResponseDto })
  delete(@Param('id') id: string) {
    return this.products.removeProduct(id);
  }
}
