export interface CartRequestIdentity {
  sessionToken?: string;
}

declare global {
  // Express exposes this namespace specifically for request augmentation.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      cartIdentity?: CartRequestIdentity;
    }
  }
}

export {};
