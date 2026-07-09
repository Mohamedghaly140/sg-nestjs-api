import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../generated/prisma/client';
import { AnalyticsService } from './analytics.service';
import { CouponsAnalyticsResponseDto } from './dto/coupons-analytics-response.dto';
import { CustomersAnalyticsResponseDto } from './dto/customers-analytics-response.dto';
import { GeographyAnalyticsResponseDto } from './dto/geography-analytics-response.dto';
import { ProductsAnalyticsResponseDto } from './dto/products-analytics-response.dto';
import { QueryAnalyticsRangeDto } from './dto/query-analytics-range.dto';
import { SalesAnalyticsResponseDto } from './dto/sales-analytics-response.dto';

@ApiTags('admin/analytics')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('sales')
  @ApiOperation({ summary: 'Get sales analytics' })
  @RangeQueryDocs()
  @ApiResponse({
    status: 200,
    description: 'Sales analytics',
    type: SalesAnalyticsResponseDto,
  })
  getSales(
    @Query() query: QueryAnalyticsRangeDto,
  ): Promise<SalesAnalyticsResponseDto> {
    return this.analyticsService.getSales(query);
  }

  @Get('products')
  @ApiOperation({ summary: 'Get product analytics' })
  @RangeQueryDocs()
  @ApiResponse({
    status: 200,
    description: 'Product analytics',
    type: ProductsAnalyticsResponseDto,
  })
  getProducts(
    @Query() query: QueryAnalyticsRangeDto,
  ): Promise<ProductsAnalyticsResponseDto> {
    return this.analyticsService.getProducts(query);
  }

  @Get('customers')
  @ApiOperation({ summary: 'Get customer analytics' })
  @RangeQueryDocs()
  @ApiResponse({
    status: 200,
    description: 'Customer analytics',
    type: CustomersAnalyticsResponseDto,
  })
  getCustomers(
    @Query() query: QueryAnalyticsRangeDto,
  ): Promise<CustomersAnalyticsResponseDto> {
    return this.analyticsService.getCustomers(query);
  }

  @Get('coupons')
  @ApiOperation({ summary: 'Get coupon analytics' })
  @RangeQueryDocs()
  @ApiResponse({
    status: 200,
    description: 'Coupon analytics',
    type: CouponsAnalyticsResponseDto,
  })
  getCoupons(
    @Query() query: QueryAnalyticsRangeDto,
  ): Promise<CouponsAnalyticsResponseDto> {
    return this.analyticsService.getCoupons(query);
  }

  @Get('geography')
  @ApiOperation({ summary: 'Get geography analytics' })
  @RangeQueryDocs()
  @ApiResponse({
    status: 200,
    description: 'Geography analytics',
    type: GeographyAnalyticsResponseDto,
  })
  getGeography(
    @Query() query: QueryAnalyticsRangeDto,
  ): Promise<GeographyAnalyticsResponseDto> {
    return this.analyticsService.getGeography(query);
  }
}

function RangeQueryDocs(): MethodDecorator {
  const from = ApiQuery({
    name: 'from',
    required: false,
    description: 'Start date for the analytics range, inclusive',
    example: '2026-07-01',
  });
  const to = ApiQuery({
    name: 'to',
    required: false,
    description: 'End date for the analytics range, inclusive',
    example: '2026-07-31',
  });

  return (target, propertyKey, descriptor) => {
    from(target, propertyKey, descriptor);
    to(target, propertyKey, descriptor);
  };
}
