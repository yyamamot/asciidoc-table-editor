export function tableDelimiterRaw(text: string): string | undefined {
  return /^\|={3,}$/u.test(text) ? text : undefined;
}

export function countTableDelimiterLines(source: string): number {
  return source.split(/\r\n|\n|\r/u).filter((line) => tableDelimiterRaw(line.trim()) !== undefined).length;
}

export function hasTableDelimiterLine(source: string): boolean {
  return countTableDelimiterLines(source) > 0;
}
