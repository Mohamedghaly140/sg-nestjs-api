import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ClerkSyncService } from '../auth/services/clerk-sync.service';
import { composeClerkName } from '../auth/utils/compose-clerk-name';
import { UpdateMeDto } from './dto/update-me.dto';

const ME_SELECT = {
  id: true,
  email: true,
  name: true,
  phone: true,
  role: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clerkSync: ClerkSyncService,
  ) {}

  getMe(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: ME_SELECT,
    });
  }

  async updateMe(userId: string, dto: UpdateMeDto) {
    const hasNameUpdate =
      dto.firstName !== undefined && dto.lastName !== undefined;
    const data: Prisma.UserUpdateInput = {
      ...(hasNameUpdate
        ? { name: composeClerkName(dto.firstName, dto.lastName) }
        : {}),
      ...(dto.phone === undefined ? {} : { phone: dto.phone }),
    };
    const clerkUpdate =
      dto.firstName !== undefined && dto.lastName !== undefined
        ? {
            firstName: dto.firstName,
            lastName: dto.lastName,
            ...(dto.phone === undefined ? {} : { phone: dto.phone }),
          }
        : dto.phone === undefined
          ? {}
          : { phone: dto.phone };

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: ME_SELECT,
    });
    await this.clerkSync.pushProfileToClerk(userId, clerkUpdate);
    return user;
  }
}
