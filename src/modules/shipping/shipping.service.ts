import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { ERROR_CODES } from '../../common/constants/error-codes';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ShippingFeeResponseDto } from './dto/shipping-fee-response.dto';

export interface ShippingDestination {
  country: string;
  governorate: string;
  city?: string;
}

const SHIPPING_FEE_SELECT = {
  country: true,
  governorate: true,
  city: true,
  fee: true,
} satisfies Prisma.ShippingZoneSelect;

@Injectable()
export class ShippingService {
  constructor(private readonly prisma: PrismaService) {}

  async getFee(
    destination: ShippingDestination,
  ): Promise<ShippingFeeResponseDto> {
    const cityZone = destination.city
      ? await this.prisma.shippingZone.findFirst({
          where: {
            country: destination.country,
            governorate: destination.governorate,
            city: destination.city,
            isActive: true,
          },
          select: SHIPPING_FEE_SELECT,
        })
      : null;
    const zone =
      cityZone ??
      (await this.prisma.shippingZone.findFirst({
        where: {
          country: destination.country,
          governorate: destination.governorate,
          city: null,
          isActive: true,
        },
        select: SHIPPING_FEE_SELECT,
      }));

    if (!zone) {
      throw new UnprocessableEntityException({
        code: ERROR_CODES.SHIPPING_NOT_AVAILABLE,
        message: 'Shipping is not available for this destination',
      });
    }

    return {
      fee: new Prisma.Decimal(zone.fee).toFixed(2),
      zone: {
        country: zone.country,
        governorate: zone.governorate,
        city: zone.city,
      },
    };
  }
}
