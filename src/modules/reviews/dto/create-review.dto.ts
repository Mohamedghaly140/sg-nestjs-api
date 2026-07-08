import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsNumber,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { IsRatingStep } from '../../../common/validators/is-rating-step.validator';

export class CreateReviewDto {
  @ApiPropertyOptional({
    description: 'Review title or short comment. Defaults to an empty string.',
    example: 'Beautiful fabric and fit',
    maxLength: 150,
    default: '',
  })
  @ValidateIf((_, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(150)
  title?: string;

  @ApiProperty({
    description: 'Rating from 1.0 to 5.0 in 0.5 increments.',
    example: 4.5,
    minimum: 1,
    maximum: 5,
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(1)
  @Max(5)
  @IsRatingStep()
  ratings!: number;
}
