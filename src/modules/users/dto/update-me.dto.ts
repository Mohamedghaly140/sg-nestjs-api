import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { IsComposedNameMaxLength } from '../validators/is-composed-name-max-length.validator';

export class UpdateMeDto {
  @ApiPropertyOptional({
    description:
      'First name. Must be supplied with lastName; the composed name must not exceed 120 characters',
    example: 'Mariam',
    minLength: 1,
    maxLength: 120,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf(
    (dto: UpdateMeDto) =>
      dto.firstName !== undefined || dto.lastName !== undefined,
  )
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(120)
  firstName?: string;

  @ApiPropertyOptional({
    description:
      'Last name. Must be supplied with firstName; the composed name must not exceed 120 characters',
    example: 'Hassan',
    minLength: 1,
    maxLength: 120,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf(
    (dto: UpdateMeDto) =>
      dto.firstName !== undefined || dto.lastName !== undefined,
  )
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(120)
  @IsComposedNameMaxLength(120)
  lastName?: string;

  @ApiPropertyOptional({
    description: 'Egyptian phone number',
    example: '+201000000002',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsPhoneNumber('EG')
  phone?: string;
}
