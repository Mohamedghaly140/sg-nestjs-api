import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  Body,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MANAGER_PLUS, Roles } from '../../common/decorators/roles.decorator';
import { AdminOrderDetailResponseDto } from './dto/admin-order-detail-response.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { QueryAdminOrdersDto } from './dto/query-admin-orders.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { AdminOrdersService } from './admin-orders.service';

@ApiTags('admin/orders')
@ApiBearerAuth()
@Roles(...MANAGER_PLUS)
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly adminOrdersService: AdminOrdersService) {}

  @Get()
  @ApiOperation({ summary: 'List orders for administration' })
  @ApiResponse({ status: 200, description: 'Paginated admin order rows' })
  list(@Query() query: QueryAdminOrdersDto) {
    return this.adminOrdersService.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an order detail for administration' })
  @ApiParam({ name: 'id', description: 'Order ID', example: 'ckvorder123' })
  @ApiResponse({ status: 200, type: AdminOrderDetailResponseDto })
  @ApiResponse({ status: 404, description: 'Order was not found' })
  get(@Param('id') id: string): Promise<AdminOrderDetailResponseDto> {
    return this.adminOrdersService.get(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update an order status' })
  @ApiParam({ name: 'id', description: 'Order ID', example: 'ckvorder123' })
  @ApiResponse({ status: 200, type: OrderResponseDto })
  @ApiResponse({ status: 409, description: 'Invalid order status transition' })
  updateStatus(
    @CurrentUser('id') actingId: string,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ): Promise<OrderResponseDto> {
    return this.adminOrdersService.updateStatus(actingId, id, dto);
  }

  @Patch(':id/mark-paid')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a CASH order paid' })
  @ApiParam({ name: 'id', description: 'Order ID', example: 'ckvorder123' })
  @ApiResponse({ status: 200, type: OrderResponseDto })
  @ApiResponse({ status: 409, description: 'Order cannot be marked paid' })
  markPaid(
    @CurrentUser('id') actingId: string,
    @Param('id') id: string,
  ): Promise<OrderResponseDto> {
    return this.adminOrdersService.markPaid(actingId, id);
  }
}
