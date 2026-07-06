import { Body, Controller, INestApplication, Post } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaHealthIndicator } from '@nestjs/terminus';
import { IsString } from 'class-validator';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/common/utils/configure-app';

class ValidationTestDto {
  @ApiProperty({ example: 'valid value' })
  @IsString()
  value: string;
}

@Controller('validation-test')
class ValidationTestController {
  @Post()
  create(@Body() body: ValidationTestDto): ValidationTestDto {
    return body;
  }
}

describe('Phase 0 HTTP layer (e2e)', () => {
  const apps: INestApplication<App>[] = [];

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  async function createApp(
    forceDatabaseDown = false,
  ): Promise<INestApplication<App>> {
    const builder = Test.createTestingModule({
      imports: [AppModule],
      controllers: [ValidationTestController],
    });

    if (forceDatabaseDown) {
      builder.overrideProvider(PrismaHealthIndicator).useValue({
        pingCheck: (key: string) =>
          Promise.resolve({
            [key]: { status: 'down' },
          }),
      });
    }

    const moduleFixture: TestingModule = await builder.compile();
    const app = moduleFixture.createNestApplication<INestApplication<App>>();
    configureApp(app, ['http://localhost:3000']);
    await app.init();
    apps.push(app);

    return app;
  }

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it('GET /api/v1/health returns the healthy success envelope', async () => {
    const app = await createApp();

    await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          status: 'success',
          message: 'Success',
          data: {
            app: 'up',
            database: 'up',
          },
        });
      });
  });

  it('GET /api/v1/health returns the service-unavailable envelope', async () => {
    const app = await createApp(true);

    await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(503)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          status: 'error',
          code: 'SERVICE_UNAVAILABLE',
        });
      });
  });

  it('returns the documented 422 envelope for an invalid DTO', async () => {
    const app = await createApp();

    await request(app.getHttpServer())
      .post('/api/v1/validation-test')
      .send({ value: null })
      .expect(422)
      .expect((response) => {
        const body = response.body as unknown;
        expect(isRecord(body)).toBe(true);

        if (!isRecord(body)) {
          throw new Error('Expected an object response body');
        }

        expect(body).toMatchObject({
          status: 'error',
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
        });
        expect(Array.isArray(body.errors)).toBe(true);

        const firstError = Array.isArray(body.errors)
          ? (body.errors[0] as unknown)
          : undefined;
        expect(isRecord(firstError)).toBe(true);

        if (!isRecord(firstError)) {
          throw new Error('Expected a validation error object');
        }

        expect(firstError.field).toBe('value');
        expect(isRecord(firstError.constraints)).toBe(true);

        if (!isRecord(firstError.constraints)) {
          throw new Error('Expected validation constraints');
        }

        expect(typeof firstError.constraints.isString).toBe('string');
      });
  });
});
