import type { Role } from '../../../generated/prisma/client';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  active: boolean;
}

declare global {
  // Express exposes this namespace specifically for request augmentation.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user: AuthenticatedUser;
    }
  }
}

export {};
