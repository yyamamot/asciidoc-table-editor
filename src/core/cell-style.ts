const KNOWN_CELL_STYLES = new Set(["a", "d", "e", "h", "l", "m", "s"]);

export function isKnownCellStyle(value: string): boolean {
  return KNOWN_CELL_STYLES.has(value);
}
