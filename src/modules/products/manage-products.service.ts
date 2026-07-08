import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, ProductStatus } from '../../generated/prisma/client';
import { ERROR_CODES } from '../../common/constants/error-codes';
import { resolveUniqueSlug } from '../../common/utils/resolve-unique-slug';
import { slugify } from '../../common/utils/slugify';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { ADMIN_PRODUCT_DETAIL_SELECT } from './admin-products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductGalleryImageDto } from './dto/product-gallery-image.dto';
import {
  SetProductFeaturedDto,
  SetProductStatusDto,
} from './dto/product-actions.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { computePriceAfterDiscount } from './utils/product-pricing';

type ProductDetail = Prisma.ProductGetPayload<{
  select: typeof ADMIN_PRODUCT_DETAIL_SELECT;
}>;

@Injectable()
export class ManageProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
  ) {}

  async createProduct(dto: CreateProductDto) {
    await this.prisma.category.findUniqueOrThrow({
      where: { id: dto.categoryId },
      select: { id: true },
    });
    await this.assertSubCategoriesBelong(
      dto.categoryId,
      dto.subCategoryIds ?? [],
    );

    const slug = await this.resolveSlug(slugify(dto.name) || 'product');
    const discount = dto.discount ?? 0;
    const product = await this.prisma.product.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        quantity: dto.quantity,
        price: dto.price,
        discount,
        priceAfterDiscount: computePriceAfterDiscount(dto.price, discount),
        sizes: dto.sizes,
        colors: dto.colors,
        imageId: dto.imageId,
        imageUrl: dto.imageUrl,
        status: dto.status ?? ProductStatus.DRAFT,
        featured: dto.featured ?? false,
        categoryId: dto.categoryId,
        subCategories: {
          create: (dto.subCategoryIds ?? []).map((subCategoryId) => ({
            subCategory: { connect: { id: subCategoryId } },
          })),
        },
      },
      select: ADMIN_PRODUCT_DETAIL_SELECT,
    });

    return this.flattenProduct(product);
  }

  async updateProduct(id: string, dto: UpdateProductDto) {
    const previous = await this.prisma.product.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        name: true,
        categoryId: true,
        price: true,
        discount: true,
        imageId: true,
        images: {
          select: { id: true, imageId: true, imageUrl: true, sortOrder: true },
        },
        subCategories: {
          select: {
            subCategory: { select: { id: true, categoryId: true } },
          },
        },
      },
    });

    const nextCategoryId = dto.categoryId ?? previous.categoryId;
    if (dto.categoryId) {
      await this.prisma.category.findUniqueOrThrow({
        where: { id: dto.categoryId },
        select: { id: true },
      });
    }

    if (dto.subCategoryIds) {
      await this.assertSubCategoriesBelong(nextCategoryId, dto.subCategoryIds);
    } else if (dto.categoryId) {
      const mismatchedExisting = previous.subCategories.some(
        (join) => join.subCategory.categoryId !== dto.categoryId,
      );
      if (mismatchedExisting) {
        this.throwSubCategoryMismatch();
      }
    }

    const slug =
      dto.name && dto.name !== previous.name
        ? await this.resolveSlug(slugify(dto.name) || 'product', id)
        : undefined;
    const nextPrice = dto.price ?? previous.price;
    const nextDiscount = dto.discount ?? previous.discount;
    const priceAfterDiscount =
      dto.price === undefined && dto.discount === undefined
        ? undefined
        : computePriceAfterDiscount(nextPrice, nextDiscount);
    const oldCoverImageId =
      dto.imageId !== undefined && dto.imageId !== previous.imageId
        ? previous.imageId
        : null;
    const galleryDiff =
      dto.images === undefined
        ? undefined
        : this.diffGallery(previous.images, dto.images);

    const product = await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          ...(dto.name === undefined ? {} : { name: dto.name }),
          ...(slug === undefined ? {} : { slug }),
          ...(dto.description === undefined
            ? {}
            : { description: dto.description }),
          ...(dto.quantity === undefined ? {} : { quantity: dto.quantity }),
          ...(dto.price === undefined ? {} : { price: dto.price }),
          ...(dto.discount === undefined ? {} : { discount: dto.discount }),
          ...(priceAfterDiscount === undefined ? {} : { priceAfterDiscount }),
          ...(dto.sizes === undefined ? {} : { sizes: dto.sizes }),
          ...(dto.colors === undefined ? {} : { colors: dto.colors }),
          ...(dto.imageId === undefined ? {} : { imageId: dto.imageId }),
          ...(dto.imageUrl === undefined ? {} : { imageUrl: dto.imageUrl }),
          ...(dto.status === undefined ? {} : { status: dto.status }),
          ...(dto.featured === undefined ? {} : { featured: dto.featured }),
          ...(dto.categoryId === undefined
            ? {}
            : { categoryId: dto.categoryId }),
        },
      });

      if (dto.subCategoryIds) {
        await tx.productSubCategory.deleteMany({ where: { productId: id } });
        if (dto.subCategoryIds.length > 0) {
          await tx.productSubCategory.createMany({
            data: dto.subCategoryIds.map((subCategoryId) => ({
              productId: id,
              subCategoryId,
            })),
          });
        }
      }

      if (galleryDiff) {
        if (galleryDiff.deleteRecordIds.length > 0) {
          await tx.productImage.deleteMany({
            where: { id: { in: galleryDiff.deleteRecordIds }, productId: id },
          });
        }
        for (const image of galleryDiff.update) {
          await tx.productImage.update({
            where: { id: image.id },
            data: { imageUrl: image.imageUrl, sortOrder: image.sortOrder },
          });
        }
        if (galleryDiff.create.length > 0) {
          await tx.productImage.createMany({
            data: galleryDiff.create.map((image) => ({
              productId: id,
              imageId: image.imageId,
              imageUrl: image.imageUrl,
              sortOrder: image.sortOrder,
            })),
          });
        }
      }

      return tx.product.findUniqueOrThrow({
        where: { id },
        select: ADMIN_PRODUCT_DETAIL_SELECT,
      });
    });

    await this.uploads.destroyImages([
      oldCoverImageId,
      ...(galleryDiff?.destroyImageIds ?? []),
    ]);
    return this.flattenProduct(product);
  }

  async removeProduct(id: string) {
    const product = await this.prisma.product.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        imageId: true,
        images: { select: { imageId: true } },
        _count: { select: { cartItems: true, orderItems: true } },
      },
    });

    if (product._count.cartItems > 0 || product._count.orderItems > 0) {
      await this.archiveProduct(id);
      return { deleted: false, archived: true };
    }

    try {
      await this.prisma.product.delete({ where: { id } });
    } catch (error: unknown) {
      if (this.isPrismaKnownError(error, 'P2003')) {
        await this.archiveProduct(id);
        return { deleted: false, archived: true };
      }
      throw error;
    }

    await this.uploads.destroyImages([
      product.imageId,
      ...product.images.map((image) => image.imageId),
    ]);
    return { deleted: true, archived: false };
  }

  async duplicateProduct(id: string) {
    const source = await this.prisma.product.findUniqueOrThrow({
      where: { id },
      select: {
        name: true,
        slug: true,
        description: true,
        quantity: true,
        price: true,
        discount: true,
        priceAfterDiscount: true,
        sizes: true,
        colors: true,
        categoryId: true,
        subCategories: { select: { subCategoryId: true } },
      },
    });
    const slug = await this.resolveSlug(`${source.slug}-copy`);

    const product = await this.prisma.product.create({
      data: {
        name: `${source.name} (copy)`,
        slug,
        description: source.description,
        quantity: source.quantity,
        price: source.price,
        discount: source.discount,
        priceAfterDiscount: source.priceAfterDiscount,
        sizes: source.sizes,
        colors: source.colors,
        imageId: '',
        imageUrl: '',
        status: ProductStatus.DRAFT,
        featured: false,
        ratingsAverage: null,
        ratingsQuantity: 0,
        sold: 0,
        categoryId: source.categoryId,
        subCategories: {
          create: source.subCategories.map((join) => ({
            subCategory: { connect: { id: join.subCategoryId } },
          })),
        },
      },
      select: ADMIN_PRODUCT_DETAIL_SELECT,
    });

    return this.flattenProduct(product);
  }

  async setFeatured(id: string, dto: SetProductFeaturedDto) {
    return this.prisma.product.update({
      where: { id },
      data: { featured: dto.featured },
      select: { id: true, featured: true },
    });
  }

  async setStatus(id: string, dto: SetProductStatusDto) {
    return this.prisma.product.update({
      where: { id },
      data: { status: dto.status },
      select: { id: true, status: true },
    });
  }

  async addImage(id: string, dto: ProductGalleryImageDto) {
    await this.prisma.product.findUniqueOrThrow({
      where: { id },
      select: { id: true },
    });
    const max = await this.prisma.productImage.aggregate({
      where: { productId: id },
      _max: { sortOrder: true },
    });

    return this.prisma.productImage.create({
      data: {
        productId: id,
        imageId: dto.imageId,
        imageUrl: dto.imageUrl,
        sortOrder: dto.sortOrder ?? (max._max.sortOrder ?? -1) + 1,
      },
      select: { id: true, imageId: true, imageUrl: true, sortOrder: true },
    });
  }

  async removeImage(productId: string, imageRecordId: string): Promise<void> {
    const image = await this.prisma.productImage.findFirstOrThrow({
      where: { id: imageRecordId, productId },
      select: { id: true, imageId: true },
    });

    await this.prisma.productImage.delete({ where: { id: image.id } });
    await this.uploads.destroyImage(image.imageId);
  }

  async reorderImages(productId: string, order: string[]) {
    const existing = await this.prisma.productImage.findMany({
      where: { productId },
      select: { id: true },
      orderBy: { sortOrder: 'asc' },
    });
    const existingIds = existing.map((image) => image.id).sort();
    const requestedIds = [...order].sort();

    if (
      existingIds.length !== requestedIds.length ||
      existingIds.some((id, index) => id !== requestedIds[index])
    ) {
      throw new UnprocessableEntityException({
        code: ERROR_CODES.INVALID_VARIANT,
        message: 'Image order must be an exact permutation of the gallery',
      });
    }

    await this.prisma.$transaction(
      order.map((id, sortOrder) =>
        this.prisma.productImage.update({
          where: { id },
          data: { sortOrder },
        }),
      ),
    );

    return this.prisma.productImage.findMany({
      where: { productId },
      select: { id: true, imageId: true, imageUrl: true, sortOrder: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  private async archiveProduct(id: string): Promise<void> {
    await this.prisma.product.update({
      where: { id },
      data: { status: ProductStatus.ARCHIVED, featured: false },
      select: { id: true },
    });
  }

  private async assertSubCategoriesBelong(
    categoryId: string,
    subCategoryIds: string[],
  ): Promise<void> {
    const uniqueIds = [...new Set(subCategoryIds)];
    if (uniqueIds.length === 0) return;

    const matchingCount = await this.prisma.subCategory.count({
      where: { id: { in: uniqueIds }, categoryId },
    });
    if (matchingCount !== uniqueIds.length) {
      this.throwSubCategoryMismatch();
    }
  }

  private throwSubCategoryMismatch(): never {
    throw new UnprocessableEntityException({
      code: ERROR_CODES.SUBCATEGORY_CATEGORY_MISMATCH,
      message: 'Sub-categories must belong to the selected category',
    });
  }

  private diffGallery(
    existing: Array<{
      id: string;
      imageId: string | null;
      imageUrl: string | null;
      sortOrder: number;
    }>,
    desired: ProductGalleryImageDto[],
  ) {
    const byImageId = new Map(
      existing
        .filter((image): image is typeof image & { imageId: string } =>
          Boolean(image.imageId),
        )
        .map((image) => [image.imageId, image]),
    );
    const desiredIds = new Set(desired.map((image) => image.imageId));
    const deleteRecords = existing.filter(
      (image) => !image.imageId || !desiredIds.has(image.imageId),
    );

    return {
      deleteRecordIds: deleteRecords.map((image) => image.id),
      destroyImageIds: deleteRecords.map((image) => image.imageId),
      update: desired
        .map((image, index) => {
          const match = byImageId.get(image.imageId);
          return match
            ? {
                id: match.id,
                imageUrl: image.imageUrl,
                sortOrder: image.sortOrder ?? index,
              }
            : null;
        })
        .filter(
          (
            image,
          ): image is { id: string; imageUrl: string; sortOrder: number } =>
            image !== null,
        ),
      create: desired
        .filter((image) => !byImageId.has(image.imageId))
        .map((image, index) => ({
          imageId: image.imageId,
          imageUrl: image.imageUrl,
          sortOrder: image.sortOrder ?? index,
        })),
    };
  }

  private async resolveSlug(
    base: string,
    excludingId?: string,
  ): Promise<string> {
    const products = await this.prisma.product.findMany({
      where: {
        ...(excludingId ? { id: { not: excludingId } } : {}),
        OR: [{ slug: base }, { slug: { startsWith: `${base}-` } }],
      },
      select: { slug: true },
    });

    return resolveUniqueSlug(
      base,
      products.map((product) => product.slug),
    );
  }

  private flattenProduct(product: ProductDetail) {
    return {
      ...product,
      subCategories: product.subCategories.map((join) => join.subCategory),
    };
  }

  private isPrismaKnownError(error: unknown, code: string): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === code
    );
  }
}
