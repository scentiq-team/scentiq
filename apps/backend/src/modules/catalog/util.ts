/**
 * The entries of `values` that are not `undefined`. An undefined field means "not provided" in a
 * patch, so it must not appear in an UPDATE (Drizzle would turn it into a default or an error).
 * `null` is kept: it means "clear this field".
 */
export function pickDefined<T extends Record<string, unknown>>(
  values: T,
): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>;
  };
}
