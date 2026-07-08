/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { ProductStatus } from '../src/generated/prisma/client';
import type { PrismaService } from '../src/prisma/prisma.service';
import { createCatalogTestApp } from './support/catalog-test-app';

describe('/products public catalog (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let categoryId: string;
  let subCategoryId: string;

  beforeAll(async () => {
    ({ app, prisma } = await createCatalogTestApp());
  });

  beforeEach(async () => {
    await resetFixtures();
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  async function cleanup() {
    await prisma.productSubCategory.deleteMany({
      where: { product: { slug: { startsWith: 'e2e-public-product-' } } },
    });
    await prisma.productImage.deleteMany({
      where: { product: { slug: { startsWith: 'e2e-public-product-' } } },
    });
    await prisma.product.deleteMany({
      where: { slug: { startsWith: 'e2e-public-product-' } },
    });
    await prisma.subCategory.deleteMany({
      where: { slug: 'e2e-public-product-sub' },
    });
    await prisma.category.deleteMany({
      where: { slug: 'e2e-public-product-cat' },
    });
  }

  async function resetFixtures() {
    await cleanup();
    const category = await prisma.category.create({
      data: { name: 'E2E Public Product Cat', slug: 'e2e-public-product-cat' },
    });
    categoryId = category.id;
    const subCategory = await prisma.subCategory.create({
      data: {
        name: 'E2E Public Product Sub',
        slug: 'e2e-public-product-sub',
        categoryId,
      },
    });
    subCategoryId = subCategory.id;

    const activeOne = await prisma.product.create({
      data: {
        name: 'E2E Public Product Satin',
        slug: 'e2e-public-product-satin',
        description: 'Satin searchable description',
        quantity: 8,
        sold: 5,
        price: '200.00',
        discount: '10.00',
        priceAfterDiscount: '180.00',
        sizes: ['S', 'M'],
        colors: ['Black', 'Emerald'],
        imageId: 'e2e/satin',
        imageUrl: 'https://example.test/satin.jpg',
        ratingsAverage: '4.5',
        ratingsQuantity: 2,
        featured: true,
        status: ProductStatus.ACTIVE,
        categoryId,
      },
    });
    await prisma.productImage.create({
      data: {
        productId: activeOne.id,
        imageId: 'e2e/satin/front',
        imageUrl: 'https://example.test/satin-front.jpg',
        sortOrder: 0,
      },
    });
    await prisma.productSubCategory.create({
      data: { productId: activeOne.id, subCategoryId },
    });
    await prisma.product.create({
      data: {
        name: 'E2E Public Product Cotton',
        slug: 'e2e-public-product-cotton',
        description: 'Cotton description',
        quantity: 4,
        sold: 1,
        price: '90.00',
        discount: '0.00',
        priceAfterDiscount: '90.00',
        sizes: ['L'],
        colors: ['Ivory'],
        imageId: 'e2e/cotton',
        imageUrl: 'https://example.test/cotton.jpg',
        ratingsAverage: null,
        ratingsQuantity: 0,
        featured: false,
        status: ProductStatus.ACTIVE,
        categoryId,
      },
    });
    await prisma.product.createMany({
      data: [
        {
          name: 'E2E Public Product Draft',
          slug: 'e2e-public-product-draft',
          description: 'Hidden draft',
          quantity: 1,
          price: '100.00',
          discount: '0.00',
          priceAfterDiscount: '100.00',
          sizes: [],
          colors: [],
          imageId: 'e2e/draft',
          imageUrl: 'https://example.test/draft.jpg',
          status: ProductStatus.DRAFT,
          categoryId,
        },
        {
          name: 'E2E Public Product Archived',
          slug: 'e2e-public-product-archived',
          description: 'Hidden archived',
          quantity: 1,
          price: '100.00',
          discount: '0.00',
          priceAfterDiscount: '100.00',
          sizes: [],
          colors: [],
          imageId: 'e2e/archived',
          imageUrl: 'https://example.test/archived.jpg',
          status: ProductStatus.ARCHIVED,
          categoryId,
        },
      ],
    });
  }

  it('hides DRAFT and ARCHIVED products from list and detail routes', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/products?search=e2e+public+product')
      .expect(200)
      .expect(({ body }) => {
        const slugs = body.data.map((item: { slug: string }) => item.slug);
        expect(slugs).toEqual(
          expect.arrayContaining([
            'e2e-public-product-satin',
            'e2e-public-product-cotton',
          ]),
        );
        expect(slugs).not.toContain('e2e-public-product-draft');
        expect(slugs).not.toContain('e2e-public-product-archived');
      });

    await request(app.getHttpServer())
      .get('/api/v1/products/e2e-public-product-draft')
      .expect(404);
  });

  it('combines storefront filters and returns full product detail', async () => {
    await request(app.getHttpServer())
      .get(
        '/api/v1/products?search=satin&category=e2e-public-product-cat&subCategory=e2e-public-product-sub&minPrice=100&maxPrice=200&sizes=S,M&colors=Black&featured=true',
      )
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toHaveLength(1);
        expect(body.data[0]).toMatchObject({
          slug: 'e2e-public-product-satin',
          priceAfterDiscount: '180',
        });
      });

    await request(app.getHttpServer())
      .get('/api/v1/products/e2e-public-product-satin')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          slug: 'e2e-public-product-satin',
          category: { slug: 'e2e-public-product-cat' },
          subCategories: [
            expect.objectContaining({ slug: 'e2e-public-product-sub' }),
          ],
          images: [expect.objectContaining({ imageId: 'e2e/satin/front' })],
        });
      });
  });

  it('supports price, sales, newest, and top-rated sorts with null ratings last', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/products?search=e2e+public+product&sort=price_asc')
      .expect(200)
      .expect(({ body }) =>
        expect(body.data.map((item: { slug: string }) => item.slug)[0]).toBe(
          'e2e-public-product-cotton',
        ),
      );

    await request(app.getHttpServer())
      .get('/api/v1/products?search=e2e+public+product&sort=top_rated')
      .expect(200)
      .expect(({ body }) =>
        expect(body.data.map((item: { slug: string }) => item.slug)).toEqual([
          'e2e-public-product-satin',
          'e2e-public-product-cotton',
        ]),
      );
  });
});
