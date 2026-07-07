import { ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { User } from '../../../generated/prisma/client';
import { ClerkAuthGuard } from './clerk-auth.guard';

/**
 * Routes using optional authentication need both @Public() (to skip the global
 * mandatory guard) and @UseGuards(OptionalAuthGuard) locally.
 */
@Injectable()
export class OptionalAuthGuard extends ClerkAuthGuard {
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractBearerToken(request);
    if (!token) {
      return true;
    }

    let user: User;
    try {
      user = await this.verifyAndLoad(token);
    } catch {
      return true;
    }

    this.assertActive(user);
    this.attachUser(request, user);
    return true;
  }
}
