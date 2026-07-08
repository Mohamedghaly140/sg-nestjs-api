import { ApiProperty } from '@nestjs/swagger';

export class ReviewUserDto {
  @ApiProperty({ description: 'Reviewer user ID', example: 'user_2abcd' })
  id!: string;

  @ApiProperty({ description: 'Reviewer display name', example: 'Mona Ali' })
  name!: string;
}

export class ReviewResponseDto {
  @ApiProperty({ description: 'Review ID', example: 'ckvreview123' })
  id!: string;

  @ApiProperty({
    description: 'Review title or short comment',
    example: 'Beautiful fabric and fit',
  })
  title!: string;

  @ApiProperty({
    description: 'Rating value',
    type: String,
    example: '4.5',
  })
  ratings!: string;

  @ApiProperty({ description: 'Reviewer', type: ReviewUserDto })
  user!: ReviewUserDto;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2026-07-08T12:00:00.000Z',
  })
  createdAt!: Date;
}
