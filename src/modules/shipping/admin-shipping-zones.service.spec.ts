import { AdminShippingZonesService } from './admin-shipping-zones.service';

describe('AdminShippingZonesService', () => {
  const prisma = {
    shippingZone: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
  const service = new AdminShippingZonesService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.shippingZone.findMany.mockResolvedValue([]);
    prisma.shippingZone.count.mockResolvedValue(0);
  });

  it('lists zones with search and pagination metadata', async () => {
    await expect(
      service.listZones({ page: 2, limit: 10, search: 'cairo' }),
    ).resolves.toMatchObject({
      data: [],
      meta: { page: 2, limit: 10, totalItems: 0, hasPrev: true },
    });
    expect(prisma.shippingZone.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { country: { contains: 'cairo', mode: 'insensitive' } },
            { governorate: { contains: 'cairo', mode: 'insensitive' } },
            { city: { contains: 'cairo', mode: 'insensitive' } },
          ],
        },
        skip: 10,
        take: 10,
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  it('passes create/update/delete through to Prisma', async () => {
    prisma.shippingZone.create.mockResolvedValueOnce({ id: 'zone_1' });
    prisma.shippingZone.update.mockResolvedValueOnce({ id: 'zone_1' });
    prisma.shippingZone.delete.mockResolvedValueOnce({});

    await expect(
      service.createZone({
        country: 'Egypt',
        governorate: 'Cairo',
        fee: 65,
        isActive: true,
      }),
    ).resolves.toEqual({ id: 'zone_1' });
    await expect(service.updateZone('zone_1', { fee: 75 })).resolves.toEqual({
      id: 'zone_1',
    });
    await expect(service.deleteZone('zone_1')).resolves.toBeUndefined();
  });
});
