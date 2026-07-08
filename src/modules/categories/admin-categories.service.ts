import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { buildPaginationMeta } from '../../common/utils/build-pagination-meta';
import { resolveUniqueSlug } from '../../common/utils/resolve-unique-slug';
import { slugify } from '../../common/utils/slugify';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { QueryAdminCategoriesDto } from './dto/query-admin-categories.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

const ADMIN_CATEGORY_SELECT = {
  id: true,
  name: true,
  slug: true,
  imageId: true,
  imageUrl: true,
  createdAt: true,
  subCategories: {
    select: { id: true, name: true, slug: true },
    orderBy: { name: 'asc' },
  },
} satisfies Prisma.CategorySelect;

@Injectable()
export class AdminCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
  ) {}

  async listCategories(query: QueryAdminCategoriesDto) {
    const where = this.buildWhere(query);
    const skip = (query.page - 1) * query.limit;
    const [categories, totalItems] = await Promise.all([
      this.prisma.category.findMany({
        where,
        select: ADMIN_CATEGORY_SELECT,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.category.count({ where }),
    ]);

    return {
      data: categories,
      meta: buildPaginationMeta(query.page, query.limit, totalItems),
    };
  }

  async createCategory(dto: CreateCategoryDto) {
    const slug = await this.resolveSlug(slugify(dto.name) || 'category');
    return this.prisma.category.create({
      data: {
        name: dto.name,
        slug,
        imageId: dto.imageId,
        imageUrl: dto.imageUrl,
      },
      select: ADMIN_CATEGORY_SELECT,
    });
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    const previous = await this.prisma.category.findUniqueOrThrow({
      where: { id },
      select: { id: true, name: true, imageId: true },
    });
    const slug =
      dto.name && dto.name !== previous.name
        ? await this.resolveSlug(slugify(dto.name) || 'category', id)
        : undefined;
    const oldImageId =
      dto.imageId !== undefined && dto.imageId !== previous.imageId
        ? previous.imageId
        : null;

    const category = await this.prisma.category.update({
      where: { id },
      data: {
        ...(dto.name === undefined ? {} : { name: dto.name }),
        ...(slug === undefined ? {} : { slug }),
        ...(dto.imageId === undefined ? {} : { imageId: dto.imageId }),
        ...(dto.imageUrl === undefined ? {} : { imageUrl: dto.imageUrl }),
      },
      select: ADMIN_CATEGORY_SELECT,
    });

    await this.uploads.destroyImage(oldImageId);
    return category;
  }

  async removeCategory(id: string): Promise<void> {
    const previous = await this.prisma.category.findUniqueOrThrow({
      where: { id },
      select: { imageId: true },
    });

    await this.prisma.category.delete({ where: { id } });
    await this.uploads.destroyImage(previous.imageId);
  }

  private buildWhere(
    query: QueryAdminCategoriesDto,
  ): Prisma.CategoryWhereInput {
    return {
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { slug: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  private async resolveSlug(
    base: string,
    excludingId?: string,
  ): Promise<string> {
    const categories = await this.prisma.category.findMany({
      where: {
        ...(excludingId ? { id: { not: excludingId } } : {}),
        OR: [{ slug: base }, { slug: { startsWith: `${base}-` } }],
      },
      select: { slug: true },
    });

    return resolveUniqueSlug(
      base,
      categories.map((category) => category.slug),
    );
  }
}
