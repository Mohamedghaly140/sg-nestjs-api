import slugifyPackage from 'slugify';

export function slugify(value: string): string {
  return slugifyPackage(value, {
    lower: true,
    strict: true,
    trim: true,
  });
}
