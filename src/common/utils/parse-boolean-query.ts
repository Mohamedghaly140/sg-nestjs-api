import { TransformFnParams } from 'class-transformer';

export function parseBooleanQuery({ obj, key }: TransformFnParams): unknown {
  const raw = (obj as Record<string, unknown>)[key];
  if (raw === 'true' || raw === true) return true;
  if (raw === 'false' || raw === false) return false;
  return raw;
}
