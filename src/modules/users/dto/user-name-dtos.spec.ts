import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Role } from '../../../generated/prisma/client';
import { CreateAdminUserDto } from './create-admin-user.dto';
import { UpdateMeDto } from './update-me.dto';

const createBase = {
  email: 'mariam@example.com',
  phone: '+201000000002',
  password: 'Str0ngPass!2026',
  role: Role.MANAGER,
};

describe('user name DTO validation', () => {
  it('trims and accepts an explicit first/last pair for admin creation', async () => {
    const dto = plainToInstance(CreateAdminUserDto, {
      ...createBase,
      firstName: '  Mary Anne  ',
      lastName: '  Smith  ',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.firstName).toBe('Mary Anne');
    expect(dto.lastName).toBe('Smith');
  });

  it.each([
    [{ firstName: 'Mariam' }, 'lastName'],
    [{ firstName: 'Mariam', lastName: '   ' }, 'lastName'],
  ])(
    'rejects an admin create name without a non-empty last name',
    async (name, expectedProperty) => {
      const errors = await validate(
        plainToInstance(CreateAdminUserDto, { ...createBase, ...name }),
      );

      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ property: expectedProperty }),
        ]),
      );
    },
  );

  it('rejects an admin create name whose composed value exceeds 120 characters', async () => {
    const errors = await validate(
      plainToInstance(CreateAdminUserDto, {
        ...createBase,
        firstName: 'A'.repeat(60),
        lastName: 'B'.repeat(60),
      }),
    );

    const lastNameError = errors.find((error) => error.property === 'lastName');
    expect(typeof lastNameError?.constraints?.isComposedNameMaxLength).toBe(
      'string',
    );
  });

  it('accepts a composed non-BMP name within the 120-character limit', async () => {
    // '𠮷' (U+20BB7) is one code point but two UTF-16 code units. A raw
    // .length check would over-count and wrongly reject this valid name;
    // the composed limit must match @MaxLength's surrogate-pair-aware count.
    // Composed code points: 60 + 1 (space) + 59 = 120 (at the limit).
    const errors = await validate(
      plainToInstance(CreateAdminUserDto, {
        ...createBase,
        firstName: '𠮷'.repeat(60),
        lastName: '𠮷'.repeat(59),
      }),
    );

    expect(errors).toHaveLength(0);
  });

  it('allows update-me to omit both name fields', async () => {
    await expect(
      validate(plainToInstance(UpdateMeDto, { phone: '+201000000003' })),
    ).resolves.toHaveLength(0);
  });

  it('accepts and trims a complete update-me name pair', async () => {
    const dto = plainToInstance(UpdateMeDto, {
      firstName: '  Mariam  ',
      lastName: '  Hassan  ',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.firstName).toBe('Mariam');
    expect(dto.lastName).toBe('Hassan');
  });

  it.each([
    [{ firstName: 'Mariam' }, 'lastName'],
    [{ lastName: 'Hassan' }, 'firstName'],
    [{ firstName: 'Mariam', lastName: '   ' }, 'lastName'],
  ])(
    'rejects an incomplete update-me name pair',
    async (name, expectedProperty) => {
      const errors = await validate(plainToInstance(UpdateMeDto, name));

      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ property: expectedProperty }),
        ]),
      );
    },
  );
});
