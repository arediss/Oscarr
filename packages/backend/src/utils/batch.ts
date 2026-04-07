/** Split an array into chunks to stay within SQLite's parameter limit (999 max) */
export function chunk<T>(arr: T[], size = 500): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
