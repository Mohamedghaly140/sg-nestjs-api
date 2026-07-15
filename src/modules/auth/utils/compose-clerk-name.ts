export function composeClerkName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string {
  return [firstName, lastName].filter(Boolean).join(' ').trim();
}
