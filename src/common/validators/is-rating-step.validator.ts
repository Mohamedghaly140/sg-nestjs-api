import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'isRatingStep', async: false })
export class IsRatingStepConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return false;
    }

    return value >= 1 && value <= 5 && Number.isInteger(value * 2);
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be between 1.0 and 5.0 in 0.5 increments`;
  }
}

export function IsRatingStep(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsRatingStepConstraint,
    });
  };
}
