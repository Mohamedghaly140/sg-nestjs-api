import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { ERROR_CODES } from '../../../common/constants/error-codes';
import type { User } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ClerkSyncService } from '../services/clerk-sync.service';
import { ClerkTokenVerifierService } from '../services/clerk-token-verifier.service';

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  constructor(
    protected readonly reflector: Reflector,
    protected readonly verifier: ClerkTokenVerifierService,
    protected readonly prisma: PrismaService,
    protected readonly clerkSync: ClerkSyncService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.isPublic(context)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractBearerToken(request);
    if (!token) {
      throw this.unauthenticated();
    }

    const user = await this.verifyAndLoad(token);
    this.assertActive(user);
    this.attachUser(request, user);
    return true;
  }

  protected isPublic(context: ExecutionContext): boolean {
    return this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
  }

  protected extractBearerToken(request: Request): string | undefined {
    const authorization = request.headers.authorization;
    if (!authorization) {
      return undefined;
    }

    const [scheme, token, extra] = authorization.trim().split(/\s+/);
    return scheme?.toLowerCase() === 'bearer' && token && !extra
      ? token
      : undefined;
  }

  protected async verifyAndLoad(token: string): Promise<User> {
    try {
      const claims = await this.verifier.verify(token);
      const localUser = await this.prisma.user.findUnique({
        where: { id: claims.sub },
      });
      return localUser ?? (await this.clerkSync.syncFromClerk(claims.sub));
    } catch {
      throw this.unauthenticated();
    }
  }

  protected assertActive(user: User): void {
    if (!user.active) {
      throw new ForbiddenException({
        code: ERROR_CODES.ACCOUNT_DISABLED,
        message: 'Account disabled',
      });
    }
  }

  protected attachUser(request: Request, user: User): void {
    request.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      active: user.active,
    };
  }

  protected unauthenticated(): UnauthorizedException {
    return new UnauthorizedException({
      code: ERROR_CODES.UNAUTHENTICATED,
      message: 'Unauthenticated',
    });
  }
}
