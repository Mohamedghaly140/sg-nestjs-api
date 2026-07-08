import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Patch,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ReviewResponseDto } from './dto/review-response.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ReviewsService } from './reviews.service';

@ApiTags('reviews')
@ApiBearerAuth()
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Patch(':id')
  @ApiOperation({ summary: 'Update my review' })
  @ApiParam({ name: 'id', description: 'Review ID', example: 'ckvreview123' })
  @ApiResponse({ status: 200, type: ReviewResponseDto })
  @ApiResponse({ status: 403, description: 'Authenticated user is not owner' })
  @ApiResponse({ status: 404, description: 'Review not found' })
  update(
    @Param('id') reviewId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateReviewDto,
  ) {
    return this.reviews.updateReview(reviewId, userId, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a review' })
  @ApiParam({ name: 'id', description: 'Review ID', example: 'ckvreview123' })
  @ApiResponse({ status: 204, description: 'Review deleted' })
  @ApiResponse({
    status: 403,
    description: 'Authenticated user cannot delete this review',
  })
  @ApiResponse({ status: 404, description: 'Review not found' })
  delete(
    @Param('id') reviewId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reviews.deleteReview(reviewId, user);
  }
}
