import type { Response } from 'express';

export const CART_SESSION_COOKIE_NAME = 'cart_session';

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function setCartSessionCookie(
  response: Response,
  token: string,
  ttlDays: number,
): void {
  response.cookie(CART_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    maxAge: ttlDays * 24 * 60 * 60 * 1000,
  });
}

export function clearCartSessionCookie(response: Response): void {
  response.clearCookie(CART_SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
  });
}
