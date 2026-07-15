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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../generated/prisma/client';
import { AdminUsersService } from './admin-users.service';
import { AdminUserResponseDto } from './dto/admin-user-response.dto';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { QueryAdminUsersDto } from './dto/query-admin-users.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';

@ApiTags('admin/users')
@ApiBearerAuth()
@Controller('admin/users')
@Roles(Role.ADMIN)
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  @ApiOperation({ summary: 'List users for staff management' })
  @ApiResponse({ status: 200, type: AdminUserResponseDto, isArray: true })
  list(@Query() query: QueryAdminUsersDto) {
    return this.users.listUsers(query);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a user account via Clerk',
    description:
      'Creates a Clerk account from explicit firstName and lastName fields, then stores their composed display name locally.',
  })
  @ApiResponse({ status: 201, type: AdminUserResponseDto })
  @ApiResponse({
    status: 422,
    description:
      'Request validation failed or Clerk rejected the user creation request',
  })
  create(@CurrentUser('id') actingId: string, @Body() dto: CreateAdminUserDto) {
    return this.users.createUser(actingId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a user role and activation status' })
  @ApiParam({ name: 'id', description: 'Clerk user ID' })
  @ApiResponse({ status: 200, type: AdminUserResponseDto })
  @ApiResponse({
    status: 409,
    description: 'Self-modification is forbidden or last admin is required',
  })
  update(
    @CurrentUser('id') actingId: string,
    @Param('id') targetId: string,
    @Body() dto: UpdateAdminUserDto,
  ) {
    return this.users.updateUser(actingId, targetId, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a user from Clerk and the database' })
  @ApiParam({ name: 'id', description: 'Clerk user ID' })
  @ApiResponse({ status: 204, description: 'User deleted' })
  @ApiResponse({
    status: 409,
    description: 'Self-modification is forbidden or last admin is required',
  })
  delete(@CurrentUser('id') actingId: string, @Param('id') targetId: string) {
    return this.users.deleteUser(actingId, targetId);
  }
}
