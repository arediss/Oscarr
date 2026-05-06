export function parseId(value: string): number | null {
  const id = Number.parseInt(value, 10);
  return Number.isNaN(id) || id < 1 ? null : id;
}

export function parsePage(value?: string): number {
  const page = Number.parseInt(value || '1', 10);
  return page > 0 ? page : 1;
}

export const VALID_MEDIA_TYPES: readonly string[] = ['movie', 'tv'];
