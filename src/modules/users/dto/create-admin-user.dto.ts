import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsPhoneNumber,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Role } from '../../../generated/prisma/client';

export class CreateAdminUserDto {
  @ApiProperty({
    description: 'Display name, 2 to 120 characters',
    example: 'Mariam Hassan',
    minLength: 2,
    maxLength: 120,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiProperty({
    description: 'Primary email address',
    example: 'mariam@example.com',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'Egyptian phone number',
    example: '+201000000002',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsPhoneNumber('EG')
  phone: string;

  @ApiProperty({
    description: 'Initial Clerk password, at least 8 characters',
    example: 'Str0ngPass!2026',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({
    description: 'Authoritative application role',
    enum: Role,
    enumName: 'Role',
    example: Role.MANAGER,
  })
  @IsEnum(Role)
  role: Role;
}
