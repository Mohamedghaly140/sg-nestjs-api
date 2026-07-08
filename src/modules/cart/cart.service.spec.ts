import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, ProductStatus } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { CartService } from './cart.service';

interface FakeProduct {
  id: string;
  name: string;
  slug: string;
  imageUrl: string;
  price: Prisma.Decimal;
  priceAfterDiscount: Prisma.Decimal;
  quantity: number;
  colors: string[];
  sizes: string[];
  status: ProductStatus;
}

interface FakeCart {
  id: string;
  userId: string | null;
  sessionToken: string | null;
  expiresAt: Date | null;
  totalCartPrice: Prisma.Decimal | null;
  totalPriceAfterDiscount: Prisma.Decimal | null;
}

interface FakeCartItem {
  id: string;
  cartId: string;
  productId: string;
  quantity: number;
  color: string | null;
  size: string | null;
  price: Prisma.Decimal | null;
  createdAt: Date;
}

class FakePrisma {
  products = new Map<string, FakeProduct>();
  carts = new Map<string, FakeCart>();
  cartItems = new Map<string, FakeCartItem>();
  private id = 0;

  $queryRaw = jest.fn().mockResolvedValue([]);

  $transaction = jest.fn(
    <T>(callback: (tx: FakePrisma) => Promise<T>): Promise<T> => callback(this),
  );

  product = {
    findFirst: jest.fn(
      ({ where }: { where: { id?: string; status?: ProductStatus } }) => {
        const product = where.id ? this.products.get(where.id) : undefined;
        if (!product) return Promise.resolve(null);
        if (where.status !== undefined && product.status !== where.status) {
          return Promise.resolve(null);
        }
        return Promise.resolve(product);
      },
    ),
  };

  cart = {
    findUnique: jest.fn(({ where }: { where: Record<string, string> }) => {
      if (where.id) {
        return Promise.resolve(
          this.cartPayload(this.carts.get(where.id) ?? null),
        );
      }
      if (where.userId) {
        return Promise.resolve(
          this.cartPayload(
            [...this.carts.values()].find(
              (cart) => cart.userId === where.userId,
            ) ?? null,
          ),
        );
      }
      if (where.sessionToken) {
        return Promise.resolve(
          this.cartPayload(
            [...this.carts.values()].find(
              (cart) => cart.sessionToken === where.sessionToken,
            ) ?? null,
          ),
        );
      }
      return Promise.resolve(null);
    }),
    create: jest.fn(({ data }: { data: Partial<FakeCart> }) => {
      const cart: FakeCart = {
        id: this.nextId('cart'),
        userId: data.userId ?? null,
        sessionToken: data.sessionToken ?? null,
        expiresAt: data.expiresAt ?? null,
        totalCartPrice: data.totalCartPrice ?? null,
        totalPriceAfterDiscount: data.totalPriceAfterDiscount ?? null,
      };
      this.carts.set(cart.id, cart);
      return Promise.resolve(this.cartPayload(cart));
    }),
    update: jest.fn(
      ({ where, data }: { where: { id: string }; data: Partial<FakeCart> }) => {
        const cart = this.carts.get(where.id);
        if (!cart) throw new Error('missing cart');
        Object.assign(cart, data);
        return Promise.resolve(this.cartPayload(cart));
      },
    ),
    delete: jest.fn(({ where }: { where: { id: string } }) => {
      this.carts.delete(where.id);
      for (const item of [...this.cartItems.values()]) {
        if (item.cartId === where.id) {
          this.cartItems.delete(item.id);
        }
      }
      return Promise.resolve();
    }),
    deleteMany: jest.fn(() => Promise.resolve({ count: 0 })),
  };

  cartItem = {
    findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) => {
      const item =
        [...this.cartItems.values()].find((candidate) =>
          Object.entries(where).every(
            ([key, value]) => candidate[key as keyof FakeCartItem] === value,
          ),
        ) ?? null;
      return Promise.resolve(this.cartItemPayload(item));
    }),
    findMany: jest.fn(({ where }: { where: { cartId: string } }) =>
      Promise.resolve(
        [...this.cartItems.values()]
          .filter((item) => item.cartId === where.cartId)
          .map((item) => this.cartItemPayload(item)),
      ),
    ),
    create: jest.fn(({ data }: { data: Partial<FakeCartItem> }) => {
      const item: FakeCartItem = {
        id: this.nextId('item'),
        cartId: data.cartId!,
        productId: data.productId!,
        quantity: data.quantity ?? 1,
        color: data.color ?? null,
        size: data.size ?? null,
        price: data.price ?? null,
        createdAt: new Date(),
      };
      this.cartItems.set(item.id, item);
      return Promise.resolve(this.cartItemPayload(item));
    }),
    update: jest.fn(
      ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<FakeCartItem>;
      }) => {
        const item = this.cartItems.get(where.id);
        if (!item) throw new Error('missing item');
        Object.assign(item, data);
        return Promise.resolve(this.cartItemPayload(item));
      },
    ),
    delete: jest.fn(({ where }: { where: { id: string } }) => {
      this.cartItems.delete(where.id);
      return Promise.resolve();
    }),
    deleteMany: jest.fn(({ where }: { where: Record<string, string> }) => {
      let count = 0;
      for (const item of [...this.cartItems.values()]) {
        if (
          Object.entries(where).every(
            ([key, value]) => item[key as keyof FakeCartItem] === value,
          )
        ) {
          this.cartItems.delete(item.id);
          count += 1;
        }
      }
      return Promise.resolve({ count });
    }),
  };

  seedProduct(overrides: Partial<FakeProduct> = {}): FakeProduct {
    const product: FakeProduct = {
      id: overrides.id ?? this.nextId('prod'),
      name: overrides.name ?? 'Test Dress',
      slug: overrides.slug ?? 'test-dress',
      imageUrl: overrides.imageUrl ?? 'https://example.test/dress.jpg',
      price: new Prisma.Decimal(overrides.price ?? '100.00'),
      priceAfterDiscount: new Prisma.Decimal(
        overrides.priceAfterDiscount ?? '80.00',
      ),
      quantity: overrides.quantity ?? 5,
      colors: overrides.colors ?? ['Black'],
      sizes: overrides.sizes ?? ['M'],
      status: overrides.status ?? ProductStatus.ACTIVE,
    };
    this.products.set(product.id, product);
    return product;
  }

  seedCart(overrides: Partial<FakeCart> = {}): FakeCart {
    const cart: FakeCart = {
      id: overrides.id ?? this.nextId('cart'),
      userId: overrides.userId ?? null,
      sessionToken: overrides.sessionToken ?? null,
      expiresAt: overrides.expiresAt ?? null,
      totalCartPrice: overrides.totalCartPrice ?? new Prisma.Decimal(0),
      totalPriceAfterDiscount:
        overrides.totalPriceAfterDiscount ?? new Prisma.Decimal(0),
    };
    this.carts.set(cart.id, cart);
    return cart;
  }

  seedCartItem(overrides: Partial<FakeCartItem>): FakeCartItem {
    const item: FakeCartItem = {
      id: overrides.id ?? this.nextId('item'),
      cartId: overrides.cartId!,
      productId: overrides.productId!,
      quantity: overrides.quantity ?? 1,
      color: overrides.color ?? null,
      size: overrides.size ?? null,
      price: overrides.price ?? new Prisma.Decimal('80.00'),
      createdAt: overrides.createdAt ?? new Date(),
    };
    this.cartItems.set(item.id, item);
    return item;
  }

  private cartPayload(cart: FakeCart | null) {
    if (!cart) return null;
    return {
      ...cart,
      items: [...this.cartItems.values()]
        .filter((item) => item.cartId === cart.id)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((item) => this.cartItemPayload(item)),
    };
  }

  private cartItemPayload(item: FakeCartItem | null) {
    if (!item) return null;
    return {
      ...item,
      product: this.products.get(item.productId),
    };
  }

  private nextId(prefix: string): string {
    this.id += 1;
    return `${prefix}_${this.id}`;
  }
}

describe('CartService', () => {
  let prisma: FakePrisma;
  let service: CartService;

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-07-09T10:00:00.000Z') });
    prisma = new FakePrisma();
    service = new CartService(
      prisma as unknown as PrismaService,
      { get: jest.fn().mockReturnValue(7) } as unknown as ConfigService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('enforces stock cap when adding an item', async () => {
    const product = prisma.seedProduct({ quantity: 3 });

    await expect(
      service.addItem(
        { userId: 'user_1' },
        { productId: product.id, quantity: 4 },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('enforces stock cap when updating an item', async () => {
    const product = prisma.seedProduct({ quantity: 3 });
    const cart = prisma.seedCart({ userId: 'user_1' });
    const item = prisma.seedCartItem({
      cartId: cart.id,
      productId: product.id,
      quantity: 1,
    });

    await expect(
      service.updateItem({ userId: 'user_1' }, item.id, { quantity: 4 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects out-of-range color and size variants', async () => {
    const product = prisma.seedProduct({ colors: ['Black'], sizes: ['S'] });

    await expect(
      service.addItem(
        { userId: 'user_1' },
        { productId: product.id, quantity: 1, color: 'Red' },
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    await expect(
      service.addItem(
        { userId: 'user_1' },
        { productId: product.id, quantity: 1, size: 'L' },
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('recomputes totals from live product prices after mutation', async () => {
    const product = prisma.seedProduct({
      price: '100.00',
      priceAfterDiscount: '80.00',
    });

    const result = await service.addItem(
      { userId: 'user_1' },
      { productId: product.id, quantity: 2 },
    );

    expect(result.cart.totalCartPrice).toBe('200');
    expect(result.cart.totalPriceAfterDiscount).toBe('160');
    expect(result.cart.items[0]).toEqual(
      expect.objectContaining({ price: '80', lineTotal: '160' }),
    );
  });

  it('re-keys an anonymous cart when the user has no cart', async () => {
    const product = prisma.seedProduct();
    const anonCart = prisma.seedCart({
      sessionToken: 'anon_token',
      expiresAt: new Date('2026-07-10T00:00:00.000Z'),
    });
    prisma.seedCartItem({ cartId: anonCart.id, productId: product.id });

    const result = await service.getCart({
      userId: 'user_1',
      sessionToken: 'anon_token',
    });

    const cart = prisma.carts.get(anonCart.id);
    expect(cart).toMatchObject({
      userId: 'user_1',
      sessionToken: null,
      expiresAt: null,
    });
    expect(result.clearAnonCookie).toBe(true);
    expect(result.cart.id).toBe(anonCart.id);
  });

  it('merges anonymous and user carts by summing with stock cap and appending distinct lines', async () => {
    const cappedProduct = prisma.seedProduct({ id: 'prod_cap', quantity: 5 });
    const appendedProduct = prisma.seedProduct({
      id: 'prod_append',
      price: '50.00',
      priceAfterDiscount: '45.00',
      quantity: 2,
    });
    const userCart = prisma.seedCart({ userId: 'user_1' });
    const anonCart = prisma.seedCart({ sessionToken: 'anon_token' });
    prisma.seedCartItem({
      cartId: userCart.id,
      productId: cappedProduct.id,
      quantity: 3,
      color: 'Black',
      size: 'M',
    });
    prisma.seedCartItem({
      cartId: anonCart.id,
      productId: cappedProduct.id,
      quantity: 4,
      color: 'Black',
      size: 'M',
    });
    prisma.seedCartItem({
      cartId: anonCart.id,
      productId: appendedProduct.id,
      quantity: 1,
    });

    const result = await service.getCart({
      userId: 'user_1',
      sessionToken: 'anon_token',
    });

    expect(prisma.carts.has(anonCart.id)).toBe(false);
    expect(result.clearAnonCookie).toBe(true);
    expect(
      result.cart.items.find((item) => item.product.id === cappedProduct.id)
        ?.quantity,
    ).toBe(5);
    expect(
      result.cart.items.find((item) => item.product.id === appendedProduct.id)
        ?.quantity,
    ).toBe(1);
    expect(result.cart.totalCartPrice).toBe('550');
    expect(result.cart.totalPriceAfterDiscount).toBe('445');
  });

  it('is idempotent when merge is replayed after the anonymous cart is gone', async () => {
    const product = prisma.seedProduct();
    const userCart = prisma.seedCart({ userId: 'user_1' });
    const anonCart = prisma.seedCart({ sessionToken: 'anon_token' });
    prisma.seedCartItem({ cartId: userCart.id, productId: product.id });
    prisma.seedCartItem({ cartId: anonCart.id, productId: product.id });

    await service.getCart({ userId: 'user_1', sessionToken: 'anon_token' });
    const replay = await service.getCart({
      userId: 'user_1',
      sessionToken: 'anon_token',
    });

    expect(replay.clearAnonCookie).toBeUndefined();
    expect(replay.cart.items).toHaveLength(1);
  });

  it('bumps anonymous cart TTL on mutation', async () => {
    const product = prisma.seedProduct();
    const oldExpiry = new Date('2026-07-09T11:00:00.000Z');
    const cart = prisma.seedCart({
      sessionToken: 'anon_token',
      expiresAt: oldExpiry,
    });

    await service.addItem(
      { sessionToken: 'anon_token' },
      { productId: product.id, quantity: 1 },
    );

    expect(prisma.carts.get(cart.id)?.expiresAt?.toISOString()).toBe(
      '2026-07-16T10:00:00.000Z',
    );
  });
});
