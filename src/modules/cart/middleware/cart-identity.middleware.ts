import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import '../interfaces/cart-identity.interface';

const CART_SESSION_COOKIE = 'cart_session';
const CART_SESSION_HEADER = 'x-cart-session';

function firstHeaderValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

@Injectable()
export class CartIdentityMiddleware implements NestMiddleware {
  use(request: Request, _response: Response, next: NextFunction): void {
    const headerToken = firstHeaderValue(request.headers[CART_SESSION_HEADER]);
    const cookieToken =
      typeof request.cookies === 'object' && request.cookies !== null
        ? (request.cookies[CART_SESSION_COOKIE] as unknown)
        : undefined;
    const sessionToken =
      headerToken ??
      (typeof cookieToken === 'string' && cookieToken.length > 0
        ? cookieToken
        : null);

    if (sessionToken) {
      request.cartIdentity = { sessionToken };
    }

    next();
  }
}
