/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { NotFoundException } from '@nestjs/common';
import { AddressesService } from './addresses.service';

describe('AddressesService', () => {
  const address = {
    id: 'addr_1',
    alias: 'Home',
    country: 'Egypt',
    governorate: 'Cairo',
    city: 'Nasr City',
    area: 'District 7',
    phone: '+201000000001',
    addressLine1: '12 Street',
    details: 'Floor 3',
    postalCode: null,
    latitude: null,
    longitude: null,
    isDefault: false,
    createdAt: new Date('2026-07-09T12:00:00.000Z'),
  };
  const tx = {
    address: {
      count: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
    },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn(
      <T>(callback: (transaction: typeof tx) => Promise<T>) => callback(tx),
    ),
  };
  const service = new AddressesService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    tx.address.count.mockResolvedValue(1);
    tx.address.updateMany.mockResolvedValue({ count: 1 });
    tx.address.create.mockResolvedValue(address);
    tx.address.findFirst.mockResolvedValue(address);
    tx.address.update.mockResolvedValue({ ...address, isDefault: true });
    tx.address.delete.mockResolvedValue(address);
    tx.address.findMany.mockResolvedValue([address]);
  });

  it('lists addresses default first', async () => {
    await expect(service.listMine('user_1')).resolves.toEqual([address]);
    expect(tx.address.findMany).toHaveBeenCalledWith({
      where: { userId: 'user_1' },
      select: expect.any(Object),
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  });

  it('auto-defaults the first address', async () => {
    tx.address.count.mockResolvedValueOnce(0);

    await service.create('user_1', {
      alias: 'Home',
      country: 'Egypt',
      governorate: 'Cairo',
      city: 'Nasr City',
      area: 'District 7',
      phone: '+201000000001',
      addressLine1: '12 Street',
      details: 'Floor 3',
    });

    expect(tx.address.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user_1', isDefault: true },
      data: { isDefault: false },
    });
    expect(tx.address.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user_1', isDefault: true }),
      }),
    );
  });

  it('unsets the previous default when explicitly requested', async () => {
    await service.create('user_1', {
      alias: 'Office',
      country: 'Egypt',
      governorate: 'Cairo',
      city: 'Zamalek',
      area: '26 July',
      phone: '+201000000002',
      addressLine1: '5 Street',
      details: 'Reception',
      isDefault: true,
    });

    expect(tx.address.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user_1', isDefault: true },
      data: { isDefault: false },
    });
  });

  it('returns 404 for addresses outside the owner scope', async () => {
    tx.address.findFirst.mockResolvedValueOnce(null);

    await expect(service.getMine('user_1', 'addr_2')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('promotes the newest remaining address after deleting the default', async () => {
    tx.address.findFirst
      .mockResolvedValueOnce({ ...address, isDefault: true })
      .mockResolvedValueOnce({ id: 'addr_2' });

    await service.delete('user_1', 'addr_1');

    expect(tx.address.delete).toHaveBeenCalledWith({ where: { id: 'addr_1' } });
    expect(tx.address.update).toHaveBeenCalledWith({
      where: { id: 'addr_2' },
      data: { isDefault: true },
    });
  });

  it('sets a default address transactionally', async () => {
    await service.setDefault('user_1', 'addr_1');

    expect(tx.address.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user_1', isDefault: true, id: { not: 'addr_1' } },
      data: { isDefault: false },
    });
    expect(tx.address.update).toHaveBeenCalledWith({
      where: { id: 'addr_1' },
      data: { isDefault: true },
      select: expect.any(Object),
    });
  });
});
