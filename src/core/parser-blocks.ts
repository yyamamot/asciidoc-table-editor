export function openDelimitedBlockDelimiter(contentRaw: string): string | undefined {
  const stack: string[] = [];
  for (const line of contentRaw.split(/\r\n|\n|\r/u)) {
    const delimiter = blockDelimiter(line.trim());
    if (delimiter === undefined) {
      continue;
    }
    if (stack.at(-1) === delimiter) {
      stack.pop();
    } else {
      stack.push(delimiter);
    }
  }
  return stack.at(-1);
}

export function blockDelimiter(line: string): string | undefined {
  return new Set(["----", "....", "====", "____", "****", "++++", "////", "--"]).has(line) ? line : undefined;
}

