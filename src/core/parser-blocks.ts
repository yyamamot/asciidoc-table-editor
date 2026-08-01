export function openDelimitedBlockDelimiter(contentRaw: string): string | undefined {
  let stack: readonly string[] = [];
  for (const line of contentRaw.split(/\r\n|\n|\r/u)) {
    stack = updateDelimitedBlockStack(stack, line);
  }
  return stack.at(-1);
}

export function blockDelimiter(line: string): string | undefined {
  const token = line.trim();
  return /^(?:--|-{4,}|\.{4,}|={4,}|_{4,}|\*{4,}|\+{4,}|\/{4,})$/u.test(token) ? token : undefined;
}

export function updateDelimitedBlockStack(stack: readonly string[], line: string): readonly string[] {
  const delimiter = blockDelimiter(line);
  if (delimiter === undefined) {
    return stack;
  }
  if (stack.at(-1) === delimiter) {
    return stack.slice(0, -1);
  }
  return [...stack, delimiter];
}
