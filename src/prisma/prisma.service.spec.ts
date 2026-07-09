import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  it('rejects a missing database URL at construction time', () => {
    expect(() => new PrismaService({ url: undefined })).toThrow(
      'Validated database configuration is missing its URL',
    );
  });

  it('connects on module init and disconnects on module destroy', async () => {
    const service = new PrismaService({
      url: 'postgresql://user:pass@localhost:5432/db',
    });
    const connect = jest
      .spyOn(service, '$connect')
      .mockResolvedValue(undefined);
    const disconnect = jest
      .spyOn(service, '$disconnect')
      .mockResolvedValue(undefined);

    await service.onModuleInit();
    await service.onModuleDestroy();

    expect(connect).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
