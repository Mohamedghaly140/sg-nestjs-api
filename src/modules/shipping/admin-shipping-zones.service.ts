import { Injectable } from '@nestjs/common';
import { buildPaginationMeta } from '../../common/utils/build-pagination-meta';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateShippingZoneDto } from './dto/create-shipping-zone.dto';
import { QueryAdminShippingZonesDto } from './dto/query-admin-shipping-zones.dto';
import { UpdateShippingZoneDto } from './dto/update-shipping-zone.dto';

const SHIPPING_ZONE_SELECT = {
  id: true,
  country: true,
  governorate: true,
  city: true,
  fee: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ShippingZoneSelect;

@Injectable()
export class AdminShippingZonesService {
  constructor(private readonly prisma: PrismaService) {}

  async listZones(query: QueryAdminShippingZonesDto) {
    const where = this.buildWhere(query);
    const skip = (query.page - 1) * query.limit;
    const [zones, totalItems] = await Promise.all([
      this.prisma.shippingZone.findMany({
        where,
        select: SHIPPING_ZONE_SELECT,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.shippingZone.count({ where }),
    ]);

    return {
      data: zones,
      meta: buildPaginationMeta(query.page, query.limit, totalItems),
    };
  }

  async createZone(dto: CreateShippingZoneDto) {
    return this.prisma.shippingZone.create({
      data: dto,
      select: SHIPPING_ZONE_SELECT,
    });
  }

  async updateZone(id: string, dto: UpdateShippingZoneDto) {
    return this.prisma.shippingZone.update({
      where: { id },
      data: dto,
      select: SHIPPING_ZONE_SELECT,
    });
  }

  async deleteZone(id: string): Promise<void> {
    await this.prisma.shippingZone.delete({ where: { id } });
  }

  private buildWhere(
    query: QueryAdminShippingZonesDto,
  ): Prisma.ShippingZoneWhereInput {
    return query.search
      ? {
          OR: [
            { country: { contains: query.search, mode: 'insensitive' } },
            { governorate: { contains: query.search, mode: 'insensitive' } },
            { city: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {};
  }
}
