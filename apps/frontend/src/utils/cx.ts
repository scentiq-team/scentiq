/** Joins class names, skipping anything falsy. Small on purpose: no clsx dependency needed. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
