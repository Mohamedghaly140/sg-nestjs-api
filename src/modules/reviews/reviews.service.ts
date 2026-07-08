import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ERROR_CODES } from '../../common/constants/error-codes';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { buildPaginationMeta } from '../../common/utils/build-pagination-meta';
import { Prisma, ProductStatus, Role } from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';

const REVIEW_SELECT = {
  id: true,
  title: true,
  ratings: true,
  user: { select: { id: true, name: true } },
  createdAt: true,
} as const;

type SelectedReview = Prisma.ReviewGetPayload<{ select: typeof REVIEW_SELECT }>;

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async listProductReviews(productId: string, query: PaginationQueryDto) {
    const skip = (query.page - 1) * query.limit;
    const [reviews, totalItems] = await Promise.all([
      this.prisma.review.findMany({
        where: { productId },
        select: REVIEW_SELECT,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.review.count({ where: { productId } }),
    ]);

    return {
      data: reviews.map((review) => this.toResponse(review)),
      meta: buildPaginationMeta(query.page, query.limit, totalItems),
    };
  }

  async createReview(productId: string, userId: string, dto: CreateReviewDto) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, status: ProductStatus.ACTIVE },
      select: { id: true },
    });
    if (!product) {
      throw this.notFound('Product not found');
    }

    const existingReview = await this.prisma.review.findUnique({
      where: { userId_productId: { userId, productId } },
      select: { id: true },
    });
    if (existingReview) {
      throw this.reviewExists();
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const review = await tx.review.create({
          data: {
            productId,
            userId,
            title: dto.title ?? '',
            ratings: dto.ratings,
          },
          select: REVIEW_SELECT,
        });
        await this.recomputeRatings(tx, productId);
        return this.toResponse(review);
      });
    } catch (error) {
      if (this.isPrismaKnownError(error, 'P2002')) {
        throw this.reviewExists();
      }
      throw error;
    }
  }

  async updateReview(reviewId: string, userId: string, dto: UpdateReviewDto) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      select: { userId: true, productId: true },
    });
    if (!review) {
      throw this.notFound('Review not found');
    }
    if (review.userId !== userId) {
      throw this.forbidden();
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedReview = await tx.review.update({
        where: { id: reviewId },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.ratings !== undefined ? { ratings: dto.ratings } : {}),
        },
        select: REVIEW_SELECT,
      });
      await this.recomputeRatings(tx, review.productId);
      return this.toResponse(updatedReview);
    });
  }

  async deleteReview(reviewId: string, user: AuthenticatedUser): Promise<void> {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      select: { userId: true, productId: true },
    });
    if (!review) {
      throw this.notFound('Review not found');
    }
    if (review.userId !== user.id && user.role !== Role.ADMIN) {
      throw this.forbidden();
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.review.delete({ where: { id: reviewId } });
      await this.recomputeRatings(tx, review.productId);
    });
  }

  private async recomputeRatings(
    tx: Prisma.TransactionClient,
    productId: string,
  ): Promise<void> {
    await tx.$queryRaw`SELECT id FROM "products" WHERE id = ${productId} FOR UPDATE`;

    const aggregate = await tx.review.aggregate({
      where: { productId },
      _avg: { ratings: true },
      _count: true,
    });
    const count = aggregate._count;
    const average =
      count > 0 && aggregate._avg.ratings
        ? aggregate._avg.ratings.toDecimalPlaces(
            1,
            Prisma.Decimal.ROUND_HALF_UP,
          )
        : null;

    await tx.product.update({
      where: { id: productId },
      data: {
        ratingsAverage: average,
        ratingsQuantity: count,
      },
    });
  }

  private toResponse(review: SelectedReview) {
    return {
      ...review,
      ratings: review.ratings.toString(),
    };
  }

  private reviewExists(): ConflictException {
    return new ConflictException({
      code: ERROR_CODES.REVIEW_EXISTS,
      message: 'Review already exists for this product',
    });
  }

  private notFound(message: string): NotFoundException {
    return new NotFoundException({
      code: ERROR_CODES.RESOURCE_NOT_FOUND,
      message,
    });
  }

  private forbidden(): ForbiddenException {
    return new ForbiddenException({
      code: ERROR_CODES.FORBIDDEN,
      message: 'Forbidden',
    });
  }

  private isPrismaKnownError(error: unknown, code: string): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === code
    );
  }
}
