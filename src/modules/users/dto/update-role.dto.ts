import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { Role } from '../../../generated/prisma/client';

export class UpdateRoleDto {
  @ApiProperty({
    description: 'New authorization role',
    enum: Role,
    example: Role.MANAGER,
  })
  @IsEnum(Role)
  role: Role;
}
