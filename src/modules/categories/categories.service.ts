import { Injectable } from '@nestjs/common';
import { ProductStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async listTree() {
    const categories = await this.prisma.category.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        imageUrl: true,
        _count: {
          select: { products: { where: { status: ProductStatus.ACTIVE } } },
        },
        subCategories: {
          select: {
            id: true,
            name: true,
            slug: true,
            _count: {
              select: {
                products: {
                  where: { product: { status: ProductStatus.ACTIVE } },
                },
              },
            },
          },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    return categories.map((category) => this.toPublicCategory(category));
  }

  async getBySlug(slug: string) {
    const category = await this.prisma.category.findUniqueOrThrow({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        imageUrl: true,
        _count: {
          select: { products: { where: { status: ProductStatus.ACTIVE } } },
        },
        subCategories: {
          select: {
            id: true,
            name: true,
            slug: true,
            _count: {
              select: {
                products: {
                  where: { product: { status: ProductStatus.ACTIVE } },
                },
              },
            },
          },
          orderBy: { name: 'asc' },
        },
      },
    });

    return this.toPublicCategory(category);
  }

  private toPublicCategory(category: {
    id: string;
    name: string;
    slug: string;
    imageUrl: string | null;
    _count: { products: number };
    subCategories: Array<{
      id: string;
      name: string;
      slug: string;
      _count: { products: number };
    }>;
  }) {
    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      imageUrl: category.imageUrl,
      productCount: category._count.products,
      subCategories: category.subCategories.map((subCategory) => ({
        id: subCategory.id,
        name: subCategory.name,
        slug: subCategory.slug,
        productCount: subCategory._count.products,
      })),
    };
  }
}
