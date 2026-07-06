import { createPrismaConfig } from '../../prisma.config';

describe('prisma.config', () => {
  it('does not require a datasource URL for client generation', () => {
    expect(createPrismaConfig({}).datasource).toBeUndefined();
  });

  it('prefers DIRECT_URL and falls back to DATABASE_URL for CLI commands', () => {
    expect(
      createPrismaConfig({
        DATABASE_URL: 'postgresql://pooled',
        DIRECT_URL: 'postgresql://direct',
      }),
    ).toHaveProperty('datasource.url', 'postgresql://direct');

    expect(
      createPrismaConfig({ DATABASE_URL: 'postgresql://pooled' }),
    ).toHaveProperty('datasource.url', 'postgresql://pooled');
  });
});
