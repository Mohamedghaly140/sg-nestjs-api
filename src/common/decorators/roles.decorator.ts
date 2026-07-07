import { SetMetadata } from '@nestjs/common';
import { Role } from '../../generated/prisma/client';

export const ROLES_KEY = 'roles';
export const MANAGER_PLUS = [Role.MANAGER, Role.ADMIN] as const;
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
