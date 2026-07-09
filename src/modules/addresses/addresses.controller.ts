import {
  Body,
  Controller,
  Delete,
  Get,
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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AddressResponseDto } from './dto/address-response.dto';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { AddressesService } from './addresses.service';

@ApiTags('addresses')
@ApiBearerAuth()
@Controller('addresses')
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  @Get()
  @ApiOperation({ summary: 'List my addresses' })
  @ApiResponse({ status: 200, type: [AddressResponseDto] })
  listMine(@CurrentUser('id') userId: string): Promise<AddressResponseDto[]> {
    return this.addressesService.listMine(userId);
  }

  @Post()
  @ApiOperation({ summary: 'Create an address' })
  @ApiResponse({ status: 201, type: AddressResponseDto })
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateAddressDto,
  ): Promise<AddressResponseDto> {
    return this.addressesService.create(userId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one of my addresses' })
  @ApiParam({ name: 'id', description: 'Address ID', example: 'ckvaddr123' })
  @ApiResponse({ status: 200, type: AddressResponseDto })
  @ApiResponse({
    status: 404,
    description: 'Address was not found for this user',
  })
  getMine(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<AddressResponseDto> {
    return this.addressesService.getMine(userId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update one of my addresses' })
  @ApiParam({ name: 'id', description: 'Address ID', example: 'ckvaddr123' })
  @ApiResponse({ status: 200, type: AddressResponseDto })
  @ApiResponse({
    status: 404,
    description: 'Address was not found for this user',
  })
  update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ): Promise<AddressResponseDto> {
    return this.addressesService.update(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete one of my addresses' })
  @ApiParam({ name: 'id', description: 'Address ID', example: 'ckvaddr123' })
  @ApiResponse({ status: 204, description: 'Address deleted' })
  @ApiResponse({
    status: 404,
    description: 'Address was not found for this user',
  })
  delete(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<void> {
    return this.addressesService.delete(userId, id);
  }

  @Patch(':id/default')
  @ApiOperation({ summary: 'Set one of my addresses as default' })
  @ApiParam({ name: 'id', description: 'Address ID', example: 'ckvaddr123' })
  @ApiResponse({ status: 200, type: AddressResponseDto })
  @ApiResponse({
    status: 404,
    description: 'Address was not found for this user',
  })
  setDefault(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<AddressResponseDto> {
    return this.addressesService.setDefault(userId, id);
  }
}
