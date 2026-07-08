import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { buildPaginationMeta } from '../../common/utils/build-pagination-meta';
import { PrismaService } from '../../prisma/prisma.service';
import { QueryAdminProductsDto } from './dto/query-admin-products.dto';

export const ADMIN_PRODUCT_DETAIL_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  quantity: true,
  sold: true,
  price: true,
  discount: true,
  priceAfterDiscount: true,
  sizes: true,
  colors: true,
  imageId: true,
  imageUrl: true,
  ratingsAverage: true,
  ratingsQuantity: true,
  status: true,
  featured: true,
  categoryId: true,
  category: { select: { id: true, name: true, slug: true } },
  subCategories: {
    select: { subCategory: { select: { id: true, name: true, slug: true } } },
    orderBy: { subCategory: { name: 'asc' } },
  },
  images: {
    select: { id: true, imageId: true, imageUrl: true, sortOrder: true },
    orderBy: { sortOrder: 'asc' },
  },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProductSelect;

@Injectable()
export class AdminProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async listProducts(query: QueryAdminProductsDto) {
    const where = this.buildWhere(query);
    const skip = (query.page - 1) * query.limit;
    const [products, totalItems] = await Promise.all([
      this.prisma.product.findMany({
        where,
        select: {
          id: true,
          name: true,
          slug: true,
          price: true,
          discount: true,
          priceAfterDiscount: true,
          quantity: true,
          sold: true,
          imageUrl: true,
          ratingsAverage: true,
          ratingsQuantity: true,
          sizes: true,
          colors: true,
          status: true,
          featured: true,
          createdAt: true,
          category: { select: { id: true, name: true } },
        },
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data: products,
      meta: buildPaginationMeta(query.page, query.limit, totalItems),
    };
  }

  async getFilterOptions() {
    const categories = await this.prisma.category.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return { categories };
  }

  async getFormData() {
    const [categories, subCategories] = await Promise.all([
      this.prisma.category.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.subCategory.findMany({
        select: { id: true, name: true, categoryId: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    return { categories, subCategories };
  }

  async getDetail(id: string) {
    const product = await this.prisma.product.findUniqueOrThrow({
      where: { id },
      select: ADMIN_PRODUCT_DETAIL_SELECT,
    });

    return this.flattenProduct(product);
  }

  async getForm(id: string) {
    const product = await this.prisma.product.findUniqueOrThrow({
      where: { id },
      select: ADMIN_PRODUCT_DETAIL_SELECT,
    });

    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      price: product.price,
      discount: product.discount,
      priceAfterDiscount: product.priceAfterDiscount,
      quantity: product.quantity,
      sizes: product.sizes,
      colors: product.colors,
      imageId: product.imageId,
      imageUrl: product.imageUrl,
      status: product.status,
      featured: product.featured,
      categoryId: product.categoryId,
      subCategoryIds: product.subCategories.map((join) => join.subCategory.id),
      images: product.images,
    };
  }

  flattenProduct(
    product: Prisma.ProductGetPayload<{
      select: typeof ADMIN_PRODUCT_DETAIL_SELECT;
    }>,
  ) {
    return {
      ...product,
      subCategories: product.subCategories.map((join) => join.subCategory),
    };
  }

  private buildWhere(query: QueryAdminProductsDto): Prisma.ProductWhereInput {
    return {
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { slug: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.categoryId === undefined
        ? {}
        : { categoryId: query.categoryId }),
      ...(query.featured === undefined ? {} : { featured: query.featured }),
    };
  }
}
