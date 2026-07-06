import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export function createPrismaConfig(environment: NodeJS.ProcessEnv) {
  const datasourceUrl = environment.DIRECT_URL ?? environment.DATABASE_URL;

  return defineConfig({
    schema: 'prisma/schema.prisma',
    migrations: {
      path: 'prisma/migrations',
      seed: 'pnpm run seed:execute',
    },
    ...(datasourceUrl
      ? {
          datasource: {
            url: datasourceUrl,
          },
        }
      : {}),
  });
}

export default createPrismaConfig(process.env);
