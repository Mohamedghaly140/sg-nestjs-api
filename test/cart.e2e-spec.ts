/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { ProductStatus } from '../src/generated/prisma/client';
import type { PrismaService } from '../src/prisma/prisma.service';
import { authHeader, TEST_TOKENS } from './support/clerk-test-utils';
import { createCatalogTestApp } from './support/catalog-test-app';

describe('/cart (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let categoryId: string;
  let dressId: string;
  let scarfId: string;

  function getSetCookies(headers: {
    'set-cookie'?: string | string[];
  }): string[] {
    const value = headers['set-cookie'];
    if (Array.isArray(value)) return value;
    return value === undefined ? [] : [value];
  }

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
    await prisma.cartItem.deleteMany({
      where: {
        OR: [
          { product: { slug: { startsWith: 'e2e-cart-' } } },
          { cart: { userId: 'user_seed_customer' } },
          { cart: { sessionToken: { startsWith: 'e2e-cart-' } } },
        ],
      },
    });
    await prisma.cart.deleteMany({
      where: {
        OR: [
          { userId: 'user_seed_customer' },
          { sessionToken: { startsWith: 'e2e-cart-' } },
        ],
      },
    });
    await prisma.product.deleteMany({
      where: { slug: { startsWith: 'e2e-cart-' } },
    });
    await prisma.category.deleteMany({ where: { slug: 'e2e-cart-cat' } });
  }

  async function resetFixtures() {
    await cleanup();
    const category = await prisma.category.create({
      data: { name: 'E2E Cart Cat', slug: 'e2e-cart-cat' },
    });
    categoryId = category.id;

    const dress = await prisma.product.create({
      data: {
        name: 'E2E Cart Dress',
        slug: 'e2e-cart-dress',
        description: 'Active cart dress',
        quantity: 5,
        price: '100.00',
        discount: '20.00',
        priceAfterDiscount: '80.00',
        sizes: ['M'],
        colors: ['Black'],
        imageId: 'e2e/cart/dress',
        imageUrl: 'https://example.test/cart-dress.jpg',
        status: ProductStatus.ACTIVE,
        categoryId,
      },
    });
    dressId = dress.id;

    const scarf = await prisma.product.create({
      data: {
        name: 'E2E Cart Scarf',
        slug: 'e2e-cart-scarf',
        description: 'Active cart scarf',
        quantity: 4,
        price: '50.00',
        discount: '10.00',
        priceAfterDiscount: '45.00',
        sizes: [],
        colors: ['Red'],
        imageId: 'e2e/cart/scarf',
        imageUrl: 'https://example.test/cart-scarf.jpg',
        status: ProductStatus.ACTIVE,
        categoryId,
      },
    });
    scarfId = scarf.id;
  }

  it('adds to an anonymous cart using the mobile header token', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('X-Cart-Session', 'e2e-cart-header-token')
      .send({ productId: dressId, quantity: 2, color: 'Black', size: 'M' })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data.sessionToken).toBeUndefined();
        expect(body.data.items[0]).toEqual(
          expect.objectContaining({ quantity: 2, price: '80' }),
        );
        expect(body.data.totalCartPrice).toBe('200');
        expect(body.data.totalPriceAfterDiscount).toBe('160');
      });
  });

  it('mints an anonymous cart cookie and reads it on the next request', async () => {
    let cookie = '';

    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .send({ productId: dressId, quantity: 1, color: 'Black', size: 'M' })
      .expect(201)
      .expect(({ body, headers }) => {
        expect(body.data.sessionToken).toEqual(expect.any(String));
        cookie = getSetCookies(headers)[0] ?? '';
        expect(cookie).toContain('cart_session=');
      });

    await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('Cookie', cookie)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.items).toHaveLength(1);
        expect(body.data.items[0].product.id).toBe(dressId);
      });
  });

  it('adds to an authenticated user cart with no prior cart', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set(authHeader(TEST_TOKENS.customer))
      .send({ productId: scarfId, quantity: 1, color: 'Red' })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data.sessionToken).toBeUndefined();
        expect(body.data.items[0].product.id).toBe(scarfId);
      });

    const cart = await prisma.cart.findUniqueOrThrow({
      where: { userId: 'user_seed_customer' },
      include: { items: true },
    });
    expect(cart.sessionToken).toBeNull();
    expect(cart.items).toHaveLength(1);
  });

  it('merges anonymous cart into a fresh user cart and clears the cookie', async () => {
    let cookie = '';

    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .send({ productId: dressId, quantity: 2, color: 'Black', size: 'M' })
      .expect(201)
      .expect(({ headers }) => {
        cookie = getSetCookies(headers)[0] ?? '';
      });

    await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set(authHeader(TEST_TOKENS.customer))
      .set('Cookie', cookie)
      .expect(200)
      .expect(({ body, headers }) => {
        expect(getSetCookies(headers).join(';')).toContain('cart_session=');
        expect(body.data.items).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              product: expect.objectContaining({ id: dressId }),
              quantity: 2,
            }),
          ]),
        );
        expect(body.data.totalCartPrice).toBe('200');
        expect(body.data.totalPriceAfterDiscount).toBe('160');
      });
  });

  it('handles concurrent authenticated merge replays without duplicate lines or errors', async () => {
    const sessionToken = 'e2e-cart-concurrent-merge';

    const userCart = await prisma.cart.create({
      data: {
        userId: 'user_seed_customer',
        totalCartPrice: '50.00',
        totalPriceAfterDiscount: '45.00',
        items: {
          create: {
            productId: scarfId,
            quantity: 1,
            color: 'Red',
            price: '45.00',
          },
        },
      },
    });
    await prisma.cart.create({
      data: {
        sessionToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        totalCartPrice: '200.00',
        totalPriceAfterDiscount: '160.00',
        items: {
          create: [
            {
              productId: dressId,
              quantity: 2,
              color: 'Black',
              size: 'M',
              price: '80.00',
            },
            {
              productId: scarfId,
              quantity: 2,
              color: 'Red',
              price: '45.00',
            },
          ],
        },
      },
    });

    const responses = await Promise.all(
      [0, 1].map(() =>
        request(app.getHttpServer())
          .get('/api/v1/cart')
          .set(authHeader(TEST_TOKENS.customer))
          .set('Cookie', `cart_session=${sessionToken}`),
      ),
    );

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    for (const response of responses) {
      expect(response.body.data.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            product: expect.objectContaining({ id: dressId }),
            quantity: 2,
          }),
          expect.objectContaining({
            product: expect.objectContaining({ id: scarfId }),
            quantity: 3,
          }),
        ]),
      );
    }

    await expect(
      prisma.cart.findUnique({ where: { sessionToken } }),
    ).resolves.toBeNull();
    const mergedCart = await prisma.cart.findUniqueOrThrow({
      where: { id: userCart.id },
      include: { items: true },
    });
    expect(mergedCart.items).toHaveLength(2);
    expect(
      mergedCart.items.filter(
        (item) =>
          item.productId === scarfId &&
          item.color === 'Red' &&
          item.size === null,
      ),
    ).toHaveLength(1);
    expect(
      mergedCart.items.find((item) => item.productId === scarfId)?.quantity,
    ).toBe(3);
    expect(
      mergedCart.items.find((item) => item.productId === dressId)?.quantity,
    ).toBe(2);
  }, 30000);
});
