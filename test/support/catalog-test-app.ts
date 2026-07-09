import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/common/utils/configure-app';
import { CLERK_CLIENT } from '../../src/modules/auth/clerk-client.provider';
import { ClerkTokenVerifierService } from '../../src/modules/auth/services/clerk-token-verifier.service';
import {
  RESEND_CLIENT,
  type ResendClient,
} from '../../src/modules/mail/resend-client.provider';
import { CLOUDINARY_CLIENT } from '../../src/modules/uploads/cloudinary-client.provider';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  createFakeClerkClient,
  FakeClerkTokenVerifierService,
} from './clerk-test-utils';
import { createFakeCloudinaryClient } from './cloudinary-test-utils';

export interface CatalogTestApp {
  app: INestApplication<App>;
  prisma: PrismaService;
  cloudinary: ReturnType<typeof createFakeCloudinaryClient>;
}

export interface CatalogTestAppOptions {
  resendClient?: ResendClient | null;
}

export async function createCatalogTestApp(
  options: CatalogTestAppOptions = {},
): Promise<CatalogTestApp> {
  const cloudinary = createFakeCloudinaryClient();

  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ClerkTokenVerifierService)
    .useClass(FakeClerkTokenVerifierService)
    .overrideProvider(CLERK_CLIENT)
    .useValue(createFakeClerkClient())
    .overrideProvider(CLOUDINARY_CLIENT)
    .useValue(cloudinary)
    .overrideProvider(RESEND_CLIENT)
    .useValue(options.resendClient ?? null)
    .compile();

  const app = module.createNestApplication<INestApplication<App>>();
  app.use(cookieParser());
  configureApp(app, ['http://localhost:3000']);
  await app.init();

  return { app, prisma: app.get(PrismaService), cloudinary };
}
