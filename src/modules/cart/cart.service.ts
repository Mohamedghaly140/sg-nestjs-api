import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { ERROR_CODES } from '../../common/constants/error-codes';
import { Prisma, ProductStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { CartResponseDto } from './dto/cart-response.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import type { CartServiceIdentity } from './interfaces/cart-service-identity.interface';

const CART_SELECT = {
  id: true,
  totalCartPrice: true,
  totalPriceAfterDiscount: true,
  expiresAt: true,
  items: {
    select: {
      id: true,
      quantity: true,
      color: true,
      size: true,
      price: true,
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          imageUrl: true,
          priceAfterDiscount: true,
          quantity: true,
          status: true,
        },
      },
    },
    orderBy: [{ id: Prisma.SortOrder.asc }],
  },
} satisfies Prisma.CartSelect;

const CART_WITH_ITEMS_SELECT = {
  id: true,
  userId: true,
  sessionToken: true,
  items: {
    select: {
      id: true,
      productId: true,
      quantity: true,
      color: true,
      size: true,
      price: true,
      product: {
        select: {
          quantity: true,
          priceAfterDiscount: true,
        },
      },
    },
  },
} satisfies Prisma.CartSelect;

type SelectedCart = Prisma.CartGetPayload<{ select: typeof CART_SELECT }>;
type CartWithItems = Prisma.CartGetPayload<{
  select: typeof CART_WITH_ITEMS_SELECT;
}>;

interface CartOperationResult {
  cart: CartResponseDto;
  mintedSessionToken?: string;
  clearAnonCookie?: boolean;
}

interface ClearCartResult {
  clearAnonCookie?: boolean;
}

interface MergeResult {
  cartId?: string;
  clearAnonCookie?: boolean;
}

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async getCart(identity: CartServiceIdentity): Promise<CartOperationResult> {
    return this.prisma.$transaction(async (tx) => {
      const merge = await this.mergeIfNeeded(tx, identity);
      const cart = merge.cartId
        ? await this.findCartById(tx, merge.cartId)
        : await this.findCartByIdentity(tx, identity);

      return {
        cart: cart ? this.toResponse(cart) : this.emptyCart(),
        clearAnonCookie: merge.clearAnonCookie,
      };
    });
  }

  async addItem(
    identity: CartServiceIdentity,
    dto: AddCartItemDto,
  ): Promise<CartOperationResult> {
    return this.prisma.$transaction(async (tx) => {
      const merge = await this.mergeIfNeeded(tx, identity);
      const cartLookupIdentity = merge.cartId
        ? { userId: identity.userId }
        : identity;
      const { cart, mintedSessionToken } = await this.getOrCreateCart(
        tx,
        cartLookupIdentity,
      );
      await this.lockCart(tx, cart.id);
      await this.lockProduct(tx, dto.productId);

      const product = await tx.product.findFirst({
        where: { id: dto.productId, status: ProductStatus.ACTIVE },
        select: {
          id: true,
          quantity: true,
          colors: true,
          sizes: true,
          priceAfterDiscount: true,
        },
      });
      if (!product) {
        throw this.notFound('Product not found');
      }

      this.assertVariant(product, dto);

      const existingItem = await tx.cartItem.findFirst({
        where: {
          cartId: cart.id,
          productId: product.id,
          color: dto.color ?? null,
          size: dto.size ?? null,
        },
        select: { id: true, quantity: true },
      });
      const requestedQuantity = (existingItem?.quantity ?? 0) + dto.quantity;
      this.assertStock(product.id, requestedQuantity, product.quantity);

      if (existingItem) {
        await tx.cartItem.update({
          where: { id: existingItem.id },
          data: { quantity: requestedQuantity },
        });
      } else {
        await tx.cartItem.create({
          data: {
            cartId: cart.id,
            productId: product.id,
            quantity: dto.quantity,
            color: dto.color,
            size: dto.size,
            price: product.priceAfterDiscount,
          },
        });
      }

      await this.afterCartMutation(tx, cart.id, cart.sessionToken !== null);
      const updatedCart = await this.findCartByIdOrThrow(tx, cart.id);

      return {
        cart: this.toResponse(updatedCart),
        mintedSessionToken,
        clearAnonCookie: merge.clearAnonCookie,
      };
    });
  }

  async updateItem(
    identity: CartServiceIdentity,
    itemId: string,
    dto: UpdateCartItemDto,
  ): Promise<CartOperationResult> {
    return this.prisma.$transaction(async (tx) => {
      const merge = await this.mergeIfNeeded(tx, identity);
      const cart = merge.cartId
        ? await this.findMutableCartById(tx, merge.cartId)
        : await this.findMutableCartByIdentity(tx, identity);
      if (!cart) {
        throw this.notFound('Cart item not found');
      }
      await this.lockCart(tx, cart.id);

      const item = await tx.cartItem.findFirst({
        where: { id: itemId, cartId: cart.id },
        select: {
          id: true,
          productId: true,
        },
      });
      if (!item) {
        throw this.notFound('Cart item not found');
      }
      await this.lockProduct(tx, item.productId);
      const product = await tx.product.findFirst({
        where: { id: item.productId },
        select: { quantity: true },
      });
      if (!product) {
        throw this.notFound('Product not found');
      }
      this.assertStock(item.productId, dto.quantity, product.quantity);

      await tx.cartItem.update({
        where: { id: item.id },
        data: { quantity: dto.quantity },
      });
      await this.afterCartMutation(tx, cart.id, cart.sessionToken !== null);

      return {
        cart: this.toResponse(await this.findCartByIdOrThrow(tx, cart.id)),
        clearAnonCookie: merge.clearAnonCookie,
      };
    });
  }

  async removeItem(
    identity: CartServiceIdentity,
    itemId: string,
  ): Promise<CartOperationResult> {
    return this.prisma.$transaction(async (tx) => {
      const merge = await this.mergeIfNeeded(tx, identity);
      const cart = merge.cartId
        ? await this.findMutableCartById(tx, merge.cartId)
        : await this.findMutableCartByIdentity(tx, identity);
      if (!cart) {
        throw this.notFound('Cart item not found');
      }
      await this.lockCart(tx, cart.id);

      const deleteResult = await tx.cartItem.deleteMany({
        where: { id: itemId, cartId: cart.id },
      });
      if (deleteResult.count === 0) {
        throw this.notFound('Cart item not found');
      }

      await this.afterCartMutation(tx, cart.id, cart.sessionToken !== null);

      return {
        cart: this.toResponse(await this.findCartByIdOrThrow(tx, cart.id)),
        clearAnonCookie: merge.clearAnonCookie,
      };
    });
  }

  async clearCart(identity: CartServiceIdentity): Promise<ClearCartResult> {
    return this.prisma.$transaction(async (tx) => {
      const merge = await this.mergeIfNeeded(tx, identity);
      const cart = merge.cartId
        ? await this.findMutableCartById(tx, merge.cartId)
        : await this.findMutableCartByIdentity(tx, identity);
      if (!cart) {
        return { clearAnonCookie: merge.clearAnonCookie };
      }
      await this.lockCart(tx, cart.id);

      if (cart.userId) {
        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
        await this.recomputeTotals(tx, cart.id);
        return { clearAnonCookie: merge.clearAnonCookie };
      }

      await tx.cart.delete({ where: { id: cart.id } });
      return { clearAnonCookie: true };
    });
  }

  private async getOrCreateCart(
    tx: Prisma.TransactionClient,
    identity: CartServiceIdentity,
  ): Promise<{ cart: CartWithItems; mintedSessionToken?: string }> {
    const existingCart = await this.findMutableCartByIdentity(tx, identity);
    if (existingCart) {
      return { cart: existingCart };
    }

    if (identity.userId) {
      try {
        const cart = await tx.cart.create({
          data: {
            userId: identity.userId,
            totalCartPrice: new Prisma.Decimal(0),
            totalPriceAfterDiscount: new Prisma.Decimal(0),
          },
          select: CART_WITH_ITEMS_SELECT,
        });
        return { cart };
      } catch (error) {
        if (this.isPrismaError(error, 'P2002')) {
          const cart = await this.findMutableCartByIdentity(tx, {
            userId: identity.userId,
          });
          if (cart) {
            return { cart };
          }
        }
        throw error;
      }
    }

    const sessionToken = identity.sessionToken ?? randomUUID();
    const cart = await tx.cart.create({
      data: {
        sessionToken,
        expiresAt: this.nextAnonymousExpiry(),
        totalCartPrice: new Prisma.Decimal(0),
        totalPriceAfterDiscount: new Prisma.Decimal(0),
      },
      select: CART_WITH_ITEMS_SELECT,
    });
    return {
      cart,
      mintedSessionToken: identity.sessionToken ? undefined : sessionToken,
    };
  }

  private async mergeIfNeeded(
    tx: Prisma.TransactionClient,
    identity: CartServiceIdentity,
  ): Promise<MergeResult> {
    if (!identity.userId || !identity.sessionToken) {
      return {};
    }

    const anonymousCartLookup = await tx.cart.findUnique({
      where: { sessionToken: identity.sessionToken },
      select: { id: true },
    });
    if (!anonymousCartLookup) {
      return {};
    }
    await this.lockCart(tx, anonymousCartLookup.id);

    const anonymousCart = await tx.cart.findUnique({
      where: { id: anonymousCartLookup.id },
      select: CART_WITH_ITEMS_SELECT,
    });
    if (
      !anonymousCart ||
      anonymousCart.userId !== null ||
      anonymousCart.sessionToken !== identity.sessionToken
    ) {
      return {};
    }

    const userCartLookup = await tx.cart.findUnique({
      where: { userId: identity.userId },
      select: { id: true },
    });

    if (!userCartLookup) {
      const updatedCart = await tx.cart.update({
        where: { id: anonymousCart.id },
        data: {
          userId: identity.userId,
          sessionToken: null,
          expiresAt: null,
        },
        select: { id: true },
      });

      return { cartId: updatedCart.id, clearAnonCookie: true };
    }

    await this.lockCart(tx, userCartLookup.id);
    const userCart = await tx.cart.findUnique({
      where: { id: userCartLookup.id },
      select: CART_WITH_ITEMS_SELECT,
    });
    if (!userCart) {
      return {};
    }

    for (const anonymousItem of anonymousCart.items) {
      await this.lockProduct(tx, anonymousItem.productId);
      const product = await tx.product.findFirst({
        where: { id: anonymousItem.productId },
        select: { quantity: true, priceAfterDiscount: true },
      });
      if (!product) {
        continue;
      }
      const existingUserItem = userCart.items.find(
        (item) =>
          item.productId === anonymousItem.productId &&
          item.color === anonymousItem.color &&
          item.size === anonymousItem.size,
      );
      const cappedQuantity = Math.min(
        (existingUserItem?.quantity ?? 0) + anonymousItem.quantity,
        product.quantity,
      );

      if (existingUserItem) {
        if (cappedQuantity > 0) {
          await tx.cartItem.update({
            where: { id: existingUserItem.id },
            data: { quantity: cappedQuantity },
          });
        } else {
          await tx.cartItem.delete({ where: { id: existingUserItem.id } });
        }
        continue;
      }

      if (cappedQuantity > 0) {
        await tx.cartItem.create({
          data: {
            cartId: userCart.id,
            productId: anonymousItem.productId,
            quantity: cappedQuantity,
            color: anonymousItem.color,
            size: anonymousItem.size,
            price: anonymousItem.price ?? product.priceAfterDiscount,
          },
        });
      }
    }

    await this.recomputeTotals(tx, userCart.id);
    await tx.cart.delete({ where: { id: anonymousCart.id } });

    return { cartId: userCart.id, clearAnonCookie: true };
  }

  private isPrismaError(error: unknown, code: string): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === code
    );
  }

  private async afterCartMutation(
    tx: Prisma.TransactionClient,
    cartId: string,
    isAnonymous: boolean,
  ): Promise<void> {
    await this.recomputeTotals(tx, cartId);
    if (isAnonymous) {
      await tx.cart.update({
        where: { id: cartId },
        data: { expiresAt: this.nextAnonymousExpiry() },
      });
    }
  }

  private async recomputeTotals(
    tx: Prisma.TransactionClient,
    cartId: string,
  ): Promise<void> {
    await this.lockCart(tx, cartId);

    const items = await tx.cartItem.findMany({
      where: { cartId },
      select: {
        quantity: true,
        product: {
          select: {
            price: true,
            priceAfterDiscount: true,
          },
        },
      },
    });

    const totals = items.reduce(
      (acc, item) => ({
        totalCartPrice: acc.totalCartPrice.add(
          item.product.price.mul(item.quantity),
        ),
        totalPriceAfterDiscount: acc.totalPriceAfterDiscount.add(
          item.product.priceAfterDiscount.mul(item.quantity),
        ),
      }),
      {
        totalCartPrice: new Prisma.Decimal(0),
        totalPriceAfterDiscount: new Prisma.Decimal(0),
      },
    );

    await tx.cart.update({
      where: { id: cartId },
      data: totals,
    });
  }

  private async findCartByIdentity(
    tx: Prisma.TransactionClient,
    identity: CartServiceIdentity,
  ): Promise<SelectedCart | null> {
    if (identity.userId) {
      return tx.cart.findUnique({
        where: { userId: identity.userId },
        select: CART_SELECT,
      });
    }
    if (identity.sessionToken) {
      return tx.cart.findUnique({
        where: { sessionToken: identity.sessionToken },
        select: CART_SELECT,
      });
    }
    return null;
  }

  private async findMutableCartByIdentity(
    tx: Prisma.TransactionClient,
    identity: CartServiceIdentity,
  ): Promise<CartWithItems | null> {
    if (identity.userId) {
      return tx.cart.findUnique({
        where: { userId: identity.userId },
        select: CART_WITH_ITEMS_SELECT,
      });
    }
    if (identity.sessionToken) {
      return tx.cart.findUnique({
        where: { sessionToken: identity.sessionToken },
        select: CART_WITH_ITEMS_SELECT,
      });
    }
    return null;
  }

  private async findCartById(
    tx: Prisma.TransactionClient,
    cartId: string,
  ): Promise<SelectedCart | null> {
    return tx.cart.findUnique({
      where: { id: cartId },
      select: CART_SELECT,
    });
  }

  private async findCartByIdOrThrow(
    tx: Prisma.TransactionClient,
    cartId: string,
  ): Promise<SelectedCart> {
    const cart = await this.findCartById(tx, cartId);
    if (!cart) {
      throw this.notFound('Cart not found');
    }
    return cart;
  }

  private async findMutableCartById(
    tx: Prisma.TransactionClient,
    cartId: string,
  ): Promise<CartWithItems | null> {
    return tx.cart.findUnique({
      where: { id: cartId },
      select: CART_WITH_ITEMS_SELECT,
    });
  }

  private async lockCart(
    tx: Prisma.TransactionClient,
    cartId: string,
  ): Promise<void> {
    await tx.$queryRaw`SELECT id FROM "carts" WHERE id = ${cartId} FOR UPDATE`;
  }

  private async lockProduct(
    tx: Prisma.TransactionClient,
    productId: string,
  ): Promise<void> {
    await tx.$queryRaw`SELECT id FROM "products" WHERE id = ${productId} FOR UPDATE`;
  }

  private assertVariant(
    product: { id: string; colors: string[]; sizes: string[] },
    dto: Pick<AddCartItemDto, 'color' | 'size'>,
  ): void {
    if (dto.color !== undefined && !product.colors.includes(dto.color)) {
      throw new UnprocessableEntityException({
        code: ERROR_CODES.INVALID_VARIANT,
        message: 'Invalid product variant',
      });
    }

    if (dto.size !== undefined && !product.sizes.includes(dto.size)) {
      throw new UnprocessableEntityException({
        code: ERROR_CODES.INVALID_VARIANT,
        message: 'Invalid product variant',
      });
    }
  }

  private assertStock(
    productId: string,
    requested: number,
    available: number,
  ): void {
    if (requested <= available) {
      return;
    }

    throw new ConflictException({
      code: ERROR_CODES.INSUFFICIENT_STOCK,
      message: 'Insufficient stock for one or more items',
      errors: [{ productId, requested, available }],
    });
  }

  private emptyCart(): CartResponseDto {
    return {
      id: null,
      items: [],
      totalCartPrice: '0.00',
      totalPriceAfterDiscount: '0.00',
      expiresAt: null,
    };
  }

  private toResponse(cart: SelectedCart): CartResponseDto {
    return {
      id: cart.id,
      items: cart.items.map((item) => {
        const price = item.price ?? item.product.priceAfterDiscount;
        return {
          id: item.id,
          product: {
            ...item.product,
            priceAfterDiscount: item.product.priceAfterDiscount.toString(),
          },
          quantity: item.quantity,
          color: item.color,
          size: item.size,
          price: price.toString(),
          lineTotal: price.mul(item.quantity).toString(),
        };
      }),
      totalCartPrice: (cart.totalCartPrice ?? new Prisma.Decimal(0)).toString(),
      totalPriceAfterDiscount: (
        cart.totalPriceAfterDiscount ?? new Prisma.Decimal(0)
      ).toString(),
      expiresAt: cart.expiresAt,
    };
  }

  private nextAnonymousExpiry(): Date {
    const ttlDays = this.configService.get<number>('cart.anonCartTtlDays') ?? 7;
    return new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
  }

  private notFound(message: string): NotFoundException {
    return new NotFoundException({
      code: ERROR_CODES.RESOURCE_NOT_FOUND,
      message,
    });
  }
}
