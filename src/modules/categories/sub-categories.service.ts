import { ConflictException, Injectable } from '@nestjs/common';
import { ERROR_CODES } from '../../common/constants/error-codes';
import { resolveUniqueSlug } from '../../common/utils/resolve-unique-slug';
import { slugify } from '../../common/utils/slugify';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSubCategoryDto } from './dto/create-sub-category.dto';
import { UpdateSubCategoryDto } from './dto/update-sub-category.dto';

const SUB_CATEGORY_SELECT = {
  id: true,
  name: true,
  slug: true,
  categoryId: true,
} as const;

@Injectable()
export class SubCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async createSubCategory(dto: CreateSubCategoryDto) {
    await this.prisma.category.findUniqueOrThrow({
      where: { id: dto.categoryId },
      select: { id: true },
    });
    const slug = await this.resolveSlug(slugify(dto.name) || 'sub-category');

    return this.prisma.subCategory.create({
      data: {
        name: dto.name,
        slug,
        categoryId: dto.categoryId,
      },
      select: SUB_CATEGORY_SELECT,
    });
  }

  async updateSubCategory(id: string, dto: UpdateSubCategoryDto) {
    const previous = await this.prisma.subCategory.findUniqueOrThrow({
      where: { id },
      select: { id: true, name: true, categoryId: true },
    });
    const categoryChanged =
      dto.categoryId !== undefined && dto.categoryId !== previous.categoryId;

    if (dto.categoryId !== undefined) {
      await this.prisma.category.findUniqueOrThrow({
        where: { id: dto.categoryId },
        select: { id: true },
      });
    }

    if (categoryChanged) {
      const productCount = await this.prisma.productSubCategory.count({
        where: { subCategoryId: id },
      });

      if (productCount > 0) {
        throw new ConflictException({
          code: ERROR_CODES.FOREIGN_KEY_CONSTRAINT,
          message: 'Sub-category has products',
        });
      }
    }

    const slug =
      dto.name && dto.name !== previous.name
        ? await this.resolveSlug(slugify(dto.name) || 'sub-category', id)
        : undefined;

    return this.prisma.subCategory.update({
      where: { id },
      data: {
        ...(dto.name === undefined ? {} : { name: dto.name }),
        ...(slug === undefined ? {} : { slug }),
        ...(dto.categoryId === undefined ? {} : { categoryId: dto.categoryId }),
      },
      select: SUB_CATEGORY_SELECT,
    });
  }

  async removeSubCategory(id: string): Promise<void> {
    await this.prisma.subCategory.findUniqueOrThrow({
      where: { id },
      select: { id: true },
    });
    const productCount = await this.prisma.productSubCategory.count({
      where: { subCategoryId: id },
    });

    if (productCount > 0) {
      throw new ConflictException({
        code: ERROR_CODES.FOREIGN_KEY_CONSTRAINT,
        message: 'Sub-category has products',
      });
    }

    await this.prisma.subCategory.delete({ where: { id } });
  }

  private async resolveSlug(
    base: string,
    excludingId?: string,
  ): Promise<string> {
    const subCategories = await this.prisma.subCategory.findMany({
      where: {
        ...(excludingId ? { id: { not: excludingId } } : {}),
        OR: [{ slug: base }, { slug: { startsWith: `${base}-` } }],
      },
      select: { slug: true },
    });

    return resolveUniqueSlug(
      base,
      subCategories.map((subCategory) => subCategory.slug),
    );
  }
}
