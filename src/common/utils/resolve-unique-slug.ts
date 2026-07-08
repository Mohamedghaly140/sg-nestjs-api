export function resolveUniqueSlug(base: string, takenSlugs: string[]): string {
  const taken = new Set(takenSlugs);
  if (!taken.has(base)) return base;

  let highestSuffix = 1;
  const suffixPattern = new RegExp(`^${escapeRegExp(base)}-(\\d+)$`);

  for (const slug of taken) {
    const match = suffixPattern.exec(slug);
    if (!match) continue;

    highestSuffix = Math.max(highestSuffix, Number(match[1]));
  }

  return `${base}-${highestSuffix + 1}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
