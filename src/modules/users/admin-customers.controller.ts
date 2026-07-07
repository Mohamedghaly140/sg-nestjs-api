import {
  Body,
  Controller,
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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MANAGER_PLUS, Roles } from '../../common/decorators/roles.decorator';
import { AdminCustomersService } from './admin-customers.service';
import { AdminCustomerDetailResponseDto } from './dto/admin-customer-detail-response.dto';
import { AdminCustomerResponseDto } from './dto/admin-customer-response.dto';
import { CustomerActiveResponseDto } from './dto/customer-active-response.dto';
import { QueryAdminCustomersDto } from './dto/query-admin-customers.dto';
import { UpdateCustomerActiveDto } from './dto/update-customer-active.dto';

@ApiTags('admin/customers')
@ApiBearerAuth()
@Controller('admin/customers')
@Roles(...MANAGER_PLUS)
export class AdminCustomersController {
  constructor(private readonly customers: AdminCustomersService) {}

  @Get()
  @ApiOperation({ summary: 'List customers for administration' })
  @ApiResponse({ status: 200, type: AdminCustomerResponseDto, isArray: true })
  list(@Query() query: QueryAdminCustomersDto) {
    return this.customers.listCustomers(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a customer detail with addresses and orders' })
  @ApiParam({ name: 'id', description: 'Clerk user ID' })
  @ApiResponse({ status: 200, type: AdminCustomerDetailResponseDto })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  get(@Param('id') id: string) {
    return this.customers.getCustomer(id);
  }

  @Patch(':id/active')
  @ApiOperation({ summary: 'Change a customer activation status' })
  @ApiParam({ name: 'id', description: 'Clerk user ID' })
  @ApiResponse({ status: 200, type: CustomerActiveResponseDto })
  @ApiResponse({
    status: 409,
    description: 'Self-modification is forbidden or target is not a customer',
  })
  setActive(
    @CurrentUser('id') actingId: string,
    @Param('id') targetId: string,
    @Body() dto: UpdateCustomerActiveDto,
  ) {
    return this.customers.setActive(actingId, targetId, dto.active);
  }

  @Post(':id/reset-password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reset a customer password and send a notice' })
  @ApiParam({ name: 'id', description: 'Clerk user ID' })
  @ApiResponse({
    status: 200,
    schema: { example: { sent: true } },
  })
  @ApiResponse({
    status: 409,
    description: 'Target must have the USER role',
  })
  @ApiResponse({
    status: 503,
    description: 'Password reset notice unavailable',
  })
  resetPassword(
    @CurrentUser('id') actingId: string,
    @Param('id') targetId: string,
  ) {
    return this.customers.resetPassword(actingId, targetId);
  }
}
