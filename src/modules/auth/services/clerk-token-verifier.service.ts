import { verifyToken } from '@clerk/backend';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface VerifiedClerkToken {
  sub: string;
}

@Injectable()
export class ClerkTokenVerifierService {
  constructor(private readonly config: ConfigService) {}

  async verify(token: string): Promise<VerifiedClerkToken> {
    return verifyToken(token, {
      secretKey: this.config.getOrThrow<string>('clerk.secretKey'),
      authorizedParties:
        this.config.get<string[]>('clerk.authorizedParties') ?? [],
      clockSkewInMs: 5_000,
    });
  }
}
