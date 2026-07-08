import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp, setupSwagger } from './common/utils/configure-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });
  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService);
  app.use(cookieParser());
  configureApp(app, configService.get<string[]>('cors.origins') ?? []);
  setupSwagger(app);

  await app.listen(configService.get<number>('app.port') ?? 3000);
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
