import { Prisma } from '../../generated/prisma/client';
import { ShippingService } from './shipping.service';

describe('ShippingService', () => {
  const prisma = {
    shippingZone: {
      findFirst: jest.fn(),
    },
  };
  const service = new ShippingService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('returns a city-specific match before governorate fallback', async () => {
    prisma.shippingZone.findFirst.mockResolvedValueOnce({
      country: 'Egypt',
      governorate: 'Cairo',
      city: 'Nasr City',
      fee: new Prisma.Decimal('65.00'),
    });

    await expect(
      service.getFee({
        country: 'Egypt',
        governorate: 'Cairo',
        city: 'Nasr City',
      }),
    ).resolves.toEqual({
      fee: '65.00',
      zone: { country: 'Egypt', governorate: 'Cairo', city: 'Nasr City' },
    });
    expect(prisma.shippingZone.findFirst).toHaveBeenCalledTimes(1);
  });

  it('falls back to the governorate-wide zone', async () => {
    prisma.shippingZone.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        country: 'Egypt',
        governorate: 'Cairo',
        city: null,
        fee: new Prisma.Decimal('90.00'),
      });

    await expect(
      service.getFee({ country: 'Egypt', governorate: 'Cairo', city: 'Maadi' }),
    ).resolves.toMatchObject({
      fee: '90.00',
      zone: { city: null },
    });
  });

  it('checks governorate-wide zones directly when no city is provided', async () => {
    prisma.shippingZone.findFirst.mockResolvedValueOnce({
      country: 'Egypt',
      governorate: 'Giza',
      city: null,
      fee: new Prisma.Decimal('80.00'),
    });

    await service.getFee({ country: 'Egypt', governorate: 'Giza' });
    expect(prisma.shippingZone.findFirst).toHaveBeenCalledWith({
      where: {
        country: 'Egypt',
        governorate: 'Giza',
        city: null,
        isActive: true,
      },
      select: {
        country: true,
        governorate: true,
        city: true,
        fee: true,
      },
    });
  });

  it('excludes inactive rows and throws SHIPPING_NOT_AVAILABLE when missing', async () => {
    prisma.shippingZone.findFirst.mockResolvedValue(null);

    await expect(
      service.getFee({ country: 'Egypt', governorate: 'Alexandria' }),
    ).rejects.toMatchObject({
      response: { code: 'SHIPPING_NOT_AVAILABLE' },
    });
  });
});
