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
import { Role } from '../../generated/prisma/client';
import { AdminUserDetailResponseDto } from './dto/admin-user-detail-response.dto';
import { AdminUserResponseDto } from './dto/admin-user-response.dto';
import { QueryAdminUsersDto } from './dto/query-admin-users.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { UsersService } from './users.service';

@ApiTags('admin/users')
@ApiBearerAuth()
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Roles(...MANAGER_PLUS)
  @ApiOperation({ summary: 'List users for administration' })
  @ApiResponse({ status: 200, type: AdminUserResponseDto, isArray: true })
  list(@Query() query: QueryAdminUsersDto) {
    return this.users.listUsers(query);
  }

  @Get(':id')
  @Roles(...MANAGER_PLUS)
  @ApiOperation({ summary: 'Get an administrative user detail' })
  @ApiParam({ name: 'id', description: 'Clerk user ID' })
  @ApiResponse({ status: 200, type: AdminUserDetailResponseDto })
  get(@Param('id') id: string) {
    return this.users.getUser(id);
  }

  @Patch(':id/role')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Change a user role' })
  @ApiParam({ name: 'id', description: 'Clerk user ID' })
  @ApiResponse({ status: 200, type: AdminUserResponseDto })
  @ApiResponse({
    status: 409,
    description: 'Self-modification is forbidden',
  })
  updateRole(
    @CurrentUser('id') actingId: string,
    @Param('id') targetId: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.users.updateRole(actingId, targetId, dto.role);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Change a user activation status' })
  @ApiParam({ name: 'id', description: 'Clerk user ID' })
  @ApiResponse({ status: 200, type: AdminUserResponseDto })
  @ApiResponse({
    status: 409,
    description: 'Self-modification is forbidden',
  })
  updateStatus(
    @CurrentUser('id') actingId: string,
    @Param('id') targetId: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.users.updateStatus(actingId, targetId, dto.active);
  }

  @Post(':id/reset-password')
  @HttpCode(200)
  @Roles(...MANAGER_PLUS)
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
    return this.users.resetPassword(actingId, targetId);
  }
}
