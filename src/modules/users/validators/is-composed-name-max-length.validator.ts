import {
  maxLength as isMaxLength,
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';
import { composeClerkName } from '../../auth/utils/compose-clerk-name';

type NamePair = {
  firstName?: unknown;
  lastName?: unknown;
};

export function IsComposedNameMaxLength(
  maxLength: number,
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (target: object, propertyKey: string | symbol): void => {
    registerDecorator({
      name: 'isComposedNameMaxLength',
      target: target.constructor,
      propertyName: propertyKey.toString(),
      constraints: [maxLength],
      options: validationOptions,
      validator: {
        validate(_value: unknown, args: ValidationArguments): boolean {
          const { firstName, lastName } = args.object as NamePair;
          if (typeof firstName !== 'string' || typeof lastName !== 'string') {
            return true;
          }

          // Delegate to class-validator's own length check so the composed
          // limit uses the same surrogate-pair-aware semantics as the
          // per-field @MaxLength decorators (avoids rejecting valid non-BMP
          // names whose UTF-16 code-unit length exceeds their code-point count).
          return isMaxLength(composeClerkName(firstName, lastName), maxLength);
        },
        defaultMessage(args: ValidationArguments): string {
          const [limit] = args.constraints as [number];
          return `firstName and lastName must compose to at most ${limit} characters`;
        },
      },
    });
  };
}
