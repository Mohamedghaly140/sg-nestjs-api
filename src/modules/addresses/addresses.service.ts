import { Injectable, NotFoundException } from '@nestjs/common';
import { ERROR_CODES } from '../../common/constants/error-codes';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AddressResponseDto } from './dto/address-response.dto';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

const ADDRESS_SELECT = {
  id: true,
  alias: true,
  country: true,
  governorate: true,
  city: true,
  area: true,
  phone: true,
  addressLine1: true,
  details: true,
  postalCode: true,
  latitude: true,
  longitude: true,
  isDefault: true,
  createdAt: true,
} satisfies Prisma.AddressSelect;

type SelectedAddress = Prisma.AddressGetPayload<{
  select: typeof ADDRESS_SELECT;
}>;

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  async listMine(userId: string): Promise<AddressResponseDto[]> {
    return this.prisma.address.findMany({
      where: { userId },
      select: ADDRESS_SELECT,
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(
    userId: string,
    dto: CreateAddressDto,
  ): Promise<AddressResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const existingCount = await tx.address.count({ where: { userId } });
      const isDefault = dto.isDefault === true || existingCount === 0;

      if (isDefault) {
        await tx.address.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.address.create({
        data: {
          alias: dto.alias,
          country: dto.country,
          governorate: dto.governorate,
          city: dto.city,
          area: dto.area,
          phone: dto.phone,
          addressLine1: dto.addressLine1,
          details: dto.details,
          postalCode: dto.postalCode,
          latitude: dto.latitude,
          longitude: dto.longitude,
          isDefault,
          userId,
        },
        select: ADDRESS_SELECT,
      });
    });
  }

  async getMine(userId: string, id: string): Promise<AddressResponseDto> {
    return this.findMineOrThrow(this.prisma, userId, id);
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateAddressDto,
  ): Promise<AddressResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      await this.findMineOrThrow(tx, userId, id);

      if (dto.isDefault === true) {
        await tx.address.updateMany({
          where: { userId, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }

      return tx.address.update({
        where: { id },
        data: dto,
        select: ADDRESS_SELECT,
      });
    });
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const address = await this.findMineOrThrow(tx, userId, id);
      await tx.address.delete({ where: { id } });

      if (!address.isDefault) {
        return;
      }

      const replacement = await tx.address.findFirst({
        where: { userId },
        select: { id: true },
        orderBy: { createdAt: 'desc' },
      });
      if (replacement) {
        await tx.address.update({
          where: { id: replacement.id },
          data: { isDefault: true },
        });
      }
    });
  }

  async setDefault(userId: string, id: string): Promise<AddressResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      await this.findMineOrThrow(tx, userId, id);
      await tx.address.updateMany({
        where: { userId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
      return tx.address.update({
        where: { id },
        data: { isDefault: true },
        select: ADDRESS_SELECT,
      });
    });
  }

  private async findMineOrThrow(
    tx: Pick<Prisma.TransactionClient, 'address'>,
    userId: string,
    id: string,
  ): Promise<SelectedAddress> {
    const address = await tx.address.findFirst({
      where: { id, userId },
      select: ADDRESS_SELECT,
    });

    if (!address) {
      throw new NotFoundException({
        code: ERROR_CODES.RESOURCE_NOT_FOUND,
        message: 'Address not found',
      });
    }

    return address;
  }
}
