import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReviewResponseDto } from './dto/review-response.dto';
import { ReviewsService } from './reviews.service';

@ApiTags('reviews')
@Controller('products/:id/reviews')
export class ProductReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List product reviews' })
  @ApiParam({ name: 'id', description: 'Product ID', example: 'ckvprod123' })
  @ApiResponse({ status: 200, type: ReviewResponseDto, isArray: true })
  list(@Param('id') productId: string, @Query() query: PaginationQueryDto) {
    return this.reviews.listProductReviews(productId, query);
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create my product review' })
  @ApiParam({ name: 'id', description: 'Product ID', example: 'ckvprod123' })
  @ApiResponse({ status: 201, type: ReviewResponseDto })
  @ApiResponse({
    status: 404,
    description: 'Product missing or not active',
  })
  @ApiResponse({
    status: 409,
    description: 'Current user already reviewed this product',
  })
  create(
    @Param('id') productId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviews.createReview(productId, userId, dto);
  }
}
