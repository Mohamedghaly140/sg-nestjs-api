import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { ShippingFeeQueryDto } from './dto/shipping-fee-query.dto';
import { ShippingFeeResponseDto } from './dto/shipping-fee-response.dto';
import { ShippingService } from './shipping.service';

@ApiTags('shipping')
@Public()
@Controller('shipping')
export class ShippingController {
  constructor(private readonly shippingService: ShippingService) {}

  @Get('fee')
  @ApiOperation({ summary: 'Get a shipping fee for a destination' })
  @ApiResponse({ status: 200, type: ShippingFeeResponseDto })
  @ApiResponse({
    status: 422,
    description: 'Shipping is not available for the destination',
  })
  getFee(@Query() query: ShippingFeeQueryDto): Promise<ShippingFeeResponseDto> {
    return this.shippingService.getFee(query);
  }
}
