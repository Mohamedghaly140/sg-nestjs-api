/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import autocannon from 'autocannon';
import {
  PaymentMethod,
  PrismaClient,
  ProductStatus,
} from '../../src/generated/prisma/client';

// Extends the correctness-only concurrency race already covered at 2 parallel
// requests in test/orders.e2e-spec.ts to real load: fires CONCURRENCY
// simultaneous guest checkouts against a single low-stock product on a
// running instance of the app (not the Nest testing module), then verifies
// the conditional-stock-decrement invariant (ADR-0003) still holds — exactly
// STOCK orders created, exactly (CONCURRENCY - STOCK) rejected, final stock
// at 0 — while reporting latency/throughput under that concurrency.
const BASE_URL = process.env.LOAD_TEST_BASE_URL ?? 'http://localhost:3000';
// Default calibrated empirically against the real dev DB (remote Supabase
// Postgres — every query in the checkout transaction is a network round
// trip, not a local one): 8-way contention on one product reliably completes
// within CHECKOUT_TRANSACTION_OPTIONS' 15s budget (max observed ~6.6s); at
// 10-way, the last-queued transaction can exceed it (~16s observed). See
// docs/testing/phase-11-load-test.md for the full write-up. Override via
// LOAD_TEST_CONCURRENCY to explore further, but expect failures past ~9-10.
const CONCURRENCY = Number(process.env.LOAD_TEST_CONCURRENCY ?? 8);
const STOCK = Math.max(1, Math.floor(CONCURRENCY / 2));

async function main(): Promise<void> {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DIRECT_URL or DATABASE_URL must be set to run the load test',
    );
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  const slugPrefix = `load-test-${Date.now()}`;

  try {
    const category = await prisma.category.create({
      data: { name: 'Load Test Category', slug: `${slugPrefix}-cat` },
    });
    const product = await prisma.product.create({
      data: {
        name: 'Load Test Dress',
        slug: `${slugPrefix}-dress`,
        description: 'Checkout concurrency load-test fixture',
        quantity: STOCK,
        price: '100.00',
        discount: '0.00',
        priceAfterDiscount: '100.00',
        sizes: ['M'],
        colors: ['Black'],
        imageId: `${slugPrefix}/dress`,
        imageUrl: 'https://example.test/load-test-dress.jpg',
        status: ProductStatus.ACTIVE,
        categoryId: category.id,
      },
    });

    const sessionTokens = Array.from(
      { length: CONCURRENCY },
      (_, i) => `${slugPrefix}-session-${i}`,
    );
    await prisma.cart.createMany({
      data: sessionTokens.map((sessionToken) => ({
        sessionToken,
        expiresAt: new Date(Date.now() + 3_600_000),
        totalCartPrice: '100.00',
        totalPriceAfterDiscount: '100.00',
      })),
    });
    const carts = await prisma.cart.findMany({
      where: { sessionToken: { in: sessionTokens } },
      select: { id: true, sessionToken: true },
    });
    await prisma.cartItem.createMany({
      data: carts.map((cart) => ({
        cartId: cart.id,
        productId: product.id,
        quantity: 1,
        color: 'Black',
        size: 'M',
        price: '100.00',
      })),
    });

    console.log(
      `Seeded product ${product.id} with stock=${STOCK}; firing ${CONCURRENCY} concurrent guest checkouts at ${BASE_URL}/api/v1/orders/guest ...`,
    );

    let clientIndex = 0;
    const result = await autocannon({
      url: `${BASE_URL}/api/v1/orders/guest`,
      method: 'POST',
      connections: CONCURRENCY,
      amount: CONCURRENCY,
      pipelining: 1,
      headers: { 'content-type': 'application/json' },
      setupClient: (client) => {
        const sessionToken = sessionTokens[clientIndex % sessionTokens.length];
        clientIndex += 1;
        if (process.env.LOAD_TEST_DEBUG === 'true') {
          client.on('response', (statusCode: number) => {
            console.log(`DEBUG response for ${sessionToken}: ${statusCode}`);
          });
          client.on('body', (body: Buffer) => {
            console.log(`DEBUG body for ${sessionToken}: ${body.toString()}`);
          });
        }
        client.setHeadersAndBody(
          {
            'content-type': 'application/json',
            'x-cart-session': sessionToken,
          },
          JSON.stringify({
            paymentMethod: PaymentMethod.CASH,
            contact: {
              name: 'Load Test',
              phone: '+201000000000',
              email: `${sessionToken}@example.test`,
            },
            shipping: {
              country: 'Egypt',
              governorate: 'Cairo',
              city: 'Nasr City',
              area: 'District 7',
              phone: '+201000000001',
              addressLine1: '1 Load Test Street',
              details: 'N/A',
            },
          }),
        );
      },
    });

    const finalProduct = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { quantity: true },
    });
    const orders = await prisma.order.findMany({
      where: { items: { some: { productId: product.id } } },
      select: { id: true },
    });

    console.log('\n--- Load test result ---');
    console.log(`Requests: ${CONCURRENCY}, connections: ${CONCURRENCY}`);
    console.log(
      `Latency (ms) — mean: ${result.latency.mean}, p50: ${result.latency.p50}, p97.5: ${result.latency.p97_5}, p99: ${result.latency.p99}, max: ${result.latency.max}`,
    );
    console.log(
      `Throughput (req/s) — mean: ${result.requests.mean}, total requests completed: ${result.requests.total}`,
    );
    console.log(
      `Non-2xx responses: ${result.non2xx} (expected ${CONCURRENCY - STOCK} — the losing 409 INSUFFICIENT_STOCK checkouts)`,
    );
    console.log(`Connection errors/timeouts: ${result.errors}`);
    console.log(
      `Orders created: ${orders.length} (expected ${STOCK}); final stock: ${finalProduct.quantity} (expected 0)`,
    );

    await prisma.order.deleteMany({
      where: { items: { some: { productId: product.id } } },
    });
    await prisma.cartItem.deleteMany({ where: { productId: product.id } });
    await prisma.cart.deleteMany({
      where: { sessionToken: { in: sessionTokens } },
    });
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.category.delete({ where: { id: category.id } });

    const failures: string[] = [];
    if (finalProduct.quantity !== 0) {
      failures.push(`expected final stock 0, got ${finalProduct.quantity}`);
    }
    if (orders.length !== STOCK) {
      failures.push(`expected ${STOCK} orders created, got ${orders.length}`);
    }
    if (result.errors > 0) {
      failures.push(`${result.errors} connection-level errors/timeouts`);
    }

    if (failures.length > 0) {
      console.error(`\nFAIL: ${failures.join('; ')}`);
      process.exitCode = 1;
      return;
    }

    console.log(
      '\nPASS: exactly-one-success-per-unit-of-stock invariant held under concurrent load.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
