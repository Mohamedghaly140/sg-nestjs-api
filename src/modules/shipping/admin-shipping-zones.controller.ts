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
import { AdminShippingZonesService } from './admin-shipping-zones.service';
import { CreateShippingZoneDto } from './dto/create-shipping-zone.dto';
import { QueryAdminShippingZonesDto } from './dto/query-admin-shipping-zones.dto';
import { ShippingZoneResponseDto } from './dto/shipping-zone-response.dto';
import { UpdateShippingZoneDto } from './dto/update-shipping-zone.dto';

@ApiTags('admin/shipping-zones')
@ApiBearerAuth()
@Controller('admin/shipping-zones')
@Roles(...MANAGER_PLUS)
export class AdminShippingZonesController {
  constructor(private readonly adminZones: AdminShippingZonesService) {}

  @Get()
  @ApiOperation({ summary: 'List shipping zones for administration' })
  @ApiResponse({ status: 200, type: ShippingZoneResponseDto, isArray: true })
  listZones(@Query() query: QueryAdminShippingZonesDto) {
    return this.adminZones.listZones(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a shipping zone' })
  @ApiResponse({ status: 201, type: ShippingZoneResponseDto })
  @ApiResponse({ status: 409, description: 'Shipping zone already exists' })
  createZone(@Body() dto: CreateShippingZoneDto) {
    return this.adminZones.createZone(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a shipping zone' })
  @ApiParam({
    name: 'id',
    description: 'Shipping zone ID',
    example: 'ckvzone123',
  })
  @ApiResponse({ status: 200, type: ShippingZoneResponseDto })
  @ApiResponse({ status: 409, description: 'Shipping zone already exists' })
  updateZone(@Param('id') id: string, @Body() dto: UpdateShippingZoneDto) {
    return this.adminZones.updateZone(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a shipping zone' })
  @ApiParam({
    name: 'id',
    description: 'Shipping zone ID',
    example: 'ckvzone123',
  })
  @ApiResponse({ status: 204, description: 'Shipping zone deleted' })
  async deleteZone(@Param('id') id: string): Promise<void> {
    await this.adminZones.deleteZone(id);
  }
}
