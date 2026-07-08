import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import type { CartServiceIdentity } from '../interfaces/cart-service-identity.interface';
import '../interfaces/cart-identity.interface';

type RequestWithOptionalUser = Request & {
  user?: AuthenticatedUser;
};

export const CartIdentity = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CartServiceIdentity => {
    const request = context
      .switchToHttp()
      .getRequest<RequestWithOptionalUser>();

    return {
      userId: request.user?.id,
      sessionToken: request.cartIdentity?.sessionToken,
    };
  },
);
