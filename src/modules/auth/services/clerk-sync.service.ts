import type { DeletedObjectJSON, UserJSON } from '@clerk/backend';
import { Inject, Injectable } from '@nestjs/common';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { Logger } from 'nestjs-pino';
import { Prisma, Role, type User } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CLERK_CLIENT, type ClerkClient } from '../clerk-client.provider';
import { composeClerkName } from '../utils/compose-clerk-name';

interface ClerkIdentity {
  id: string;
  email: string;
  name: string;
  phone: string;
}

type ProfileUpdate =
  | { firstName: string; lastName: string; phone?: string }
  | { firstName?: never; lastName?: never; phone?: string };

@Injectable()
export class ClerkSyncService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLERK_CLIENT) private readonly clerk: ClerkClient,
    private readonly logger: Logger,
  ) {}

  async upsertFromWebhookUser(data: UserJSON): Promise<User | undefined> {
    try {
      return await this.upsertIdentity(this.mapWebhookUser(data));
    } catch (error: unknown) {
      if (this.isUniqueConstraintError(error)) {
        this.logger.error(
          {
            audit: true,
            action: 'clerk-user-sync-collision',
            clerkUserId: data.id,
            err: error,
          },
          'Clerk user sync collided with an existing email or phone',
        );
        return undefined;
      }
      throw error;
    }
  }

  async deleteFromWebhookUser(data: DeletedObjectJSON): Promise<void> {
    if (!data.id) {
      return;
    }
    await this.prisma.user.deleteMany({ where: { id: data.id } });
  }

  async syncFromClerk(clerkUserId: string): Promise<User> {
    const user = await this.clerk.users.getUser(clerkUserId);
    const primaryEmail = user.emailAddresses.find(
      (email) => email.id === user.primaryEmailAddressId,
    );
    const primaryPhone = user.phoneNumbers.find(
      (phone) => phone.id === user.primaryPhoneNumberId,
    );
    const email = primaryEmail?.emailAddress;

    if (!email) {
      throw new Error(`Clerk user ${clerkUserId} has no primary email`);
    }

    return this.upsertIdentity({
      id: user.id,
      email,
      name: this.buildName(user.firstName, user.lastName, email),
      phone: primaryPhone?.phoneNumber ?? `pending:${user.id}`,
    });
  }

  async mirrorRoleToClerk(clerkUserId: string, role: Role): Promise<void> {
    try {
      await this.clerk.users.updateUserMetadata(clerkUserId, {
        publicMetadata: { role },
      });
    } catch (error: unknown) {
      this.logger.warn(
        { err: error, clerkUserId, role },
        'Failed to mirror authoritative role to Clerk',
      );
    }
  }

  async pushProfileToClerk(
    clerkUserId: string,
    update: ProfileUpdate,
  ): Promise<void> {
    try {
      const hasFirstName = update.firstName !== undefined;
      const hasLastName = update.lastName !== undefined;
      if (hasFirstName !== hasLastName) {
        throw new Error('Profile name updates require firstName and lastName');
      }

      if (hasFirstName && hasLastName) {
        await this.clerk.users.updateUser(clerkUserId, {
          firstName: update.firstName,
          lastName: update.lastName,
        });
      }

      if (update.phone !== undefined) {
        const parsed = parsePhoneNumberFromString(update.phone, 'EG');
        if (!parsed?.isValid()) {
          throw new Error('Invalid Egyptian phone number');
        }

        const currentUser = await this.clerk.users.getUser(clerkUserId);
        const created = await this.clerk.phoneNumbers.createPhoneNumber({
          userId: clerkUserId,
          phoneNumber: parsed.number,
          primary: true,
          verified: true,
        });

        await Promise.all(
          currentUser.phoneNumbers
            .filter((phone) => phone.id !== created.id)
            .map((phone) =>
              this.clerk.phoneNumbers.deletePhoneNumber(phone.id),
            ),
        );
      }
    } catch (error: unknown) {
      this.logger.warn(
        { err: error, clerkUserId },
        'Failed to push profile update to Clerk',
      );
    }
  }

  async setRandomPassword(
    clerkUserId: string,
    password: string,
  ): Promise<void> {
    await this.clerk.users.updateUser(clerkUserId, {
      password,
      signOutOfOtherSessions: true,
    });
  }

  private async upsertIdentity(identity: ClerkIdentity): Promise<User> {
    return this.prisma.user.upsert({
      where: { id: identity.id },
      update: {
        email: identity.email,
        name: identity.name,
        phone: identity.phone,
      },
      create: identity,
    });
  }

  private mapWebhookUser(data: UserJSON): ClerkIdentity {
    const primaryEmail = data.email_addresses.find(
      (email) => email.id === data.primary_email_address_id,
    );
    const primaryPhone = data.phone_numbers.find(
      (phone) => phone.id === data.primary_phone_number_id,
    );
    const email = primaryEmail?.email_address;

    if (!email) {
      throw new Error(`Clerk user ${data.id} has no primary email`);
    }

    return {
      id: data.id,
      email,
      name: this.buildName(data.first_name, data.last_name, email),
      phone: primaryPhone?.phone_number ?? `pending:${data.id}`,
    };
  }

  private buildName(
    firstName: string | null | undefined,
    lastName: string | null | undefined,
    email: string,
  ): string {
    return composeClerkName(firstName, lastName) || email;
  }

  private isUniqueConstraintError(
    error: unknown,
  ): error is Prisma.PrismaClientKnownRequestError {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
