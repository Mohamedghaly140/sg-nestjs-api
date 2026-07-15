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
import { IsComposedNameMaxLength } from '../validators/is-composed-name-max-length.validator';

export class CreateAdminUserDto {
  @ApiProperty({
    description:
      'First name, trimmed and non-empty. The composed first and last name must not exceed 120 characters',
    example: 'Mariam',
    minLength: 1,
    maxLength: 120,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(120)
  firstName: string;

  @ApiProperty({
    description:
      'Last name, trimmed and non-empty. The composed first and last name must not exceed 120 characters',
    example: 'Hassan',
    minLength: 1,
    maxLength: 120,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(120)
  @IsComposedNameMaxLength(120)
  lastName: string;

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
