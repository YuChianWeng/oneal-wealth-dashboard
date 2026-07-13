const PUBLIC_SOURCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;

/**
 * Convert source provenance into a stable public identifier.
 * Filesystem paths and free-form text are never public provenance.
 */
export function sanitizePublicSource(
  value: unknown,
  fallback: string,
): string {
  const source = typeof value === "string" ? value.trim() : "";
  return PUBLIC_SOURCE_PATTERN.test(source) ? source : fallback;
}

export function isPublicSource(value: string): boolean {
  return PUBLIC_SOURCE_PATTERN.test(value);
}
