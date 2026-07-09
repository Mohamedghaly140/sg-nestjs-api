/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  OrderStatus,
  PaymentMethod,
  ProductStatus,
} from '../src/generated/prisma/client';
import type { PrismaService } from '../src/prisma/prisma.service';
import { authHeader, TEST_TOKENS } from './support/clerk-test-utils';
import { createCatalogTestApp } from './support/catalog-test-app';
import { createCapturingResendClient } from './support/mail-test-utils';

describe('/orders (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let categoryId: string;
  let productId: string;
  let addressId: string;
  const mail = createCapturingResendClient();

  beforeAll(async () => {
    process.env.MAIL_FROM = 'SG Couture <orders@test.dev>';
    process.env.STOREFRONT_URL = 'https://storefront.test';
    ({ app, prisma } = await createCatalogTestApp({
      resendClient: mail.client,
    }));
  });

  beforeEach(async () => {
    mail.reset();
    await resetFixtures();
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  async function cleanup() {
    const orderIds = (
      await prisma.order.findMany({
        where: {
          items: { some: { product: { slug: { startsWith: 'e2e-orders-' } } } },
        },
        select: { id: true },
      })
    ).map((order) => order.id);
    await prisma.couponUsage.deleteMany({
      where: { orderId: { in: orderIds } },
    });
    await prisma.order.deleteMany({
      where: {
        items: { some: { product: { slug: { startsWith: 'e2e-orders-' } } } },
      },
    });
    await prisma.cartItem.deleteMany({
      where: { product: { slug: { startsWith: 'e2e-orders-' } } },
    });
    await prisma.cart.deleteMany({
      where: {
        OR: [
          { userId: 'user_seed_customer' },
          { sessionToken: { startsWith: 'e2e-orders-' } },
        ],
      },
    });
    await prisma.address.deleteMany({
      where: { alias: { startsWith: 'E2E Orders' } },
    });
    await prisma.shippingZone.deleteMany({
      where: { country: 'E2E Orders Egypt' },
    });
    await prisma.product.deleteMany({
      where: { slug: { startsWith: 'e2e-orders-' } },
    });
    await prisma.category.deleteMany({
      where: { slug: { startsWith: 'e2e-orders-' } },
    });
  }

  async function resetFixtures() {
    await cleanup();
    const category = await prisma.category.create({
      data: { name: 'E2E Orders Cat', slug: 'e2e-orders-cat' },
    });
    categoryId = category.id;
    const product = await prisma.product.create({
      data: {
        name: 'E2E Orders Dress',
        slug: 'e2e-orders-dress',
        description: 'Order test dress',
        quantity: 5,
        price: '100.00',
        discount: '20.00',
        priceAfterDiscount: '80.00',
        sizes: ['M'],
        colors: ['Black'],
        imageId: 'e2e/orders/dress',
        imageUrl: 'https://example.test/orders-dress.jpg',
        status: ProductStatus.ACTIVE,
        categoryId,
      },
    });
    productId = product.id;
    const address = await prisma.address.create({
      data: {
        alias: 'E2E Orders Home',
        country: 'E2E Orders Egypt',
        governorate: 'Cairo',
        city: 'Nasr City',
        area: 'District 7',
        phone: '+201000000001',
        addressLine1: '12 Street',
        details: 'Floor 3',
        isDefault: true,
        userId: 'user_seed_customer',
      },
    });
    addressId = address.id;
    await prisma.shippingZone.create({
      data: {
        country: 'E2E Orders Egypt',
        governorate: 'Cairo',
        city: 'Nasr City',
        fee: '65.00',
      },
    });
  }

  async function createUserCart(quantity = 1) {
    // A registered user's cart is emptied (not deleted) on checkout, so a
    // prior order in the same test can leave a zeroed-out cart row behind.
    await prisma.cart.deleteMany({ where: { userId: 'user_seed_customer' } });
    await prisma.cart.create({
      data: {
        userId: 'user_seed_customer',
        totalCartPrice: '100.00',
        totalPriceAfterDiscount: '80.00',
        items: {
          create: {
            productId,
            quantity,
            color: 'Black',
            size: 'M',
            price: '80.00',
          },
        },
      },
    });
  }

  async function createGuestCart(sessionToken: string) {
    await prisma.cart.create({
      data: {
        sessionToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        totalCartPrice: '100.00',
        totalPriceAfterDiscount: '80.00',
        items: {
          create: {
            productId,
            quantity: 1,
            color: 'Black',
            size: 'M',
            price: '80.00',
          },
        },
      },
    });
  }

  async function waitForMailCount(count: number) {
    const startedAt = Date.now();
    while (mail.sent.length < count && Date.now() - startedAt < 1000) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(mail.sent).toHaveLength(count);
  }

  const guestBody = {
    paymentMethod: PaymentMethod.CARD,
    contact: {
      name: 'Guest Customer',
      phone: '+201000000001',
      email: 'guest-orders@example.com',
    },
    shipping: {
      country: 'E2E Orders Egypt',
      governorate: 'Cairo',
      city: 'Nasr City',
      area: 'District 7',
      phone: '+201000000002',
      addressLine1: '12 Street',
      details: 'Floor 3',
    },
  };

  it('creates a registered order and allows self-cancel', async () => {
    await createUserCart(1);

    const created = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set(authHeader(TEST_TOKENS.customer))
      .send({
        shippingAddressId: addressId,
        paymentMethod: PaymentMethod.CARD,
      })
      .expect(201);

    expect(created.body.data.totalOrderPrice).toBe('145.00');
    await waitForMailCount(1);
    expect(mail.sent[0]).toEqual(
      expect.objectContaining({
        to: 'customer.seed@sgcouture.test',
        subject: expect.stringContaining('ORD-'),
        text: expect.stringContaining('Order'),
      }),
    );

    await request(app.getHttpServer())
      .get('/api/v1/orders')
      .set(authHeader(TEST_TOKENS.customer))
      .expect(200)
      .expect(({ body }) => {
        expect(body.data[0]).toEqual(
          expect.objectContaining({ id: created.body.data.id }),
        );
      });

    await request(app.getHttpServer())
      .post(`/api/v1/orders/${created.body.data.id}/cancel`)
      .set(authHeader(TEST_TOKENS.customer))
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.status).toBe(OrderStatus.CANCELLED);
      });
    await waitForMailCount(2);
  }, 15000);

  it('creates, fetches, and claims a guest order', async () => {
    await createGuestCart('e2e-orders-guest');

    const created = await request(app.getHttpServer())
      .post('/api/v1/orders/guest')
      .set('X-Cart-Session', 'e2e-orders-guest')
      .send(guestBody)
      .expect(201);

    expect(created.body.data.claimToken).toBe('sent-by-email');
    const row = await prisma.order.findUniqueOrThrow({
      where: { id: created.body.data.id },
      select: { guestToken: true },
    });
    await waitForMailCount(1);
    expect(mail.sent[0]?.to).toBe('guest-orders@example.com');
    expect(mail.sent[0]?.text).toContain(
      `https://storefront.test/orders/claim?token=${row.guestToken}`,
    );

    await request(app.getHttpServer())
      .get(`/api/v1/orders/guest/${row.guestToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/orders/claim')
      .set(authHeader(TEST_TOKENS.customer))
      .send({ token: row.guestToken })
      .expect(200);
  }, 10000);

  it('supports admin status transitions and CASH mark-paid', async () => {
    await createUserCart(1);
    const created = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set(authHeader(TEST_TOKENS.customer))
      .send({
        shippingAddressId: addressId,
        paymentMethod: PaymentMethod.CASH,
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/orders/${created.body.data.id}/status`)
      .set(authHeader(TEST_TOKENS.manager))
      .send({ status: OrderStatus.PROCESSING })
      .expect(200);
    await waitForMailCount(1);

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/orders/${created.body.data.id}/mark-paid`)
      .set(authHeader(TEST_TOKENS.manager))
      .expect(200);
    await waitForMailCount(2);
    expect(mail.sent[1]?.subject).toContain('Payment received');

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/orders/${created.body.data.id}/status`)
      .set(authHeader(TEST_TOKENS.manager))
      .send({ status: OrderStatus.SHIPPED })
      .expect(200);
    await waitForMailCount(3);
    expect(mail.sent[2]?.subject).toContain('has shipped');

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/orders/${created.body.data.id}/status`)
      .set(authHeader(TEST_TOKENS.manager))
      .send({ status: OrderStatus.DELIVERED })
      .expect(200);
    await waitForMailCount(4);
    expect(mail.sent[3]?.subject).toContain('has been delivered');

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/orders/${created.body.data.id}/status`)
      .set(authHeader(TEST_TOKENS.manager))
      .send({ status: OrderStatus.REFUNDED })
      .expect(200);
    await waitForMailCount(5);
    expect(mail.sent[4]?.subject).toContain('has been refunded');
  }, 20000);

  it('sends cancellation status email but never fails the request on mail failure', async () => {
    await createUserCart(1);
    const created = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set(authHeader(TEST_TOKENS.customer))
      .send({
        shippingAddressId: addressId,
        paymentMethod: PaymentMethod.CARD,
      })
      .expect(201);
    await waitForMailCount(1);

    await request(app.getHttpServer())
      .post(`/api/v1/orders/${created.body.data.id}/cancel`)
      .set(authHeader(TEST_TOKENS.customer))
      .expect(200);
    await waitForMailCount(2);
    expect(mail.sent[1]?.subject).toContain('has been cancelled');

    mail.reset();
    mail.fail();
    await createUserCart(1);
    await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set(authHeader(TEST_TOKENS.customer))
      .send({
        shippingAddressId: addressId,
        paymentMethod: PaymentMethod.CARD,
      })
      .expect(201);

    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(mail.send).toHaveBeenCalled();
  }, 15000);

  it('allows only one of two concurrent guest checkouts for the last unit', async () => {
    await prisma.product.update({
      where: { id: productId },
      data: { quantity: 1 },
    });
    await createGuestCart('e2e-orders-race-a');
    await createGuestCart('e2e-orders-race-b');

    const responses = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/orders/guest')
        .set('X-Cart-Session', 'e2e-orders-race-a')
        .send({
          ...guestBody,
          contact: { ...guestBody.contact, email: 'race-a@example.com' },
        }),
      request(app.getHttpServer())
        .post('/api/v1/orders/guest')
        .set('X-Cart-Session', 'e2e-orders-race-b')
        .send({
          ...guestBody,
          contact: { ...guestBody.contact, email: 'race-b@example.com' },
        }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    const product = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
      select: { quantity: true },
    });
    expect(product.quantity).toBe(0);
  });
});
