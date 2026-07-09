import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

function isValidOrigin(origin: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  return (
    (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
    parsed.pathname === '/' &&
    parsed.search === '' &&
    parsed.hash === ''
  );
}

@ValidatorConstraint({ name: 'isCorsOriginList', async: false })
export class IsCorsOriginListConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return false;
    }
    const origins = value.split(',').map((origin) => origin.trim());
    return origins.length > 0 && origins.every(isValidOrigin);
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a comma-separated list of http(s) origins with no path (e.g. "https://app.example.com,http://localhost:3000")`;
  }
}

export function IsCorsOriginList(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsCorsOriginListConstraint,
    });
  };
}
