import type { LosslessTable, SourceRange, TableAttributeEntry, TableDiagnostic } from "./types";

const COLUMN_STYLE_VALUES = "adehlms";
const COLUMN_SPEC_PATTERN = new RegExp(
  `^(?:\\d+(?:\\.\\d+)?%?)?(?:[<^>])?(?:\\.[<^>])?[${COLUMN_STYLE_VALUES}]?$`,
  "u"
);

export type ColumnMetadataEdit =
  | {
      kind: "insert";
      anchorColumn: number;
      insertColumn: number;
    }
  | {
      kind: "delete";
      deleteColumn: number;
    };

export interface ColumnMetadataReplacement {
  start: number;
  end: number;
  text: string;
}

export type ColumnMetadataPlan =
  | {
      ok: true;
      replacement?: ColumnMetadataReplacement;
    }
  | {
      ok: false;
      diagnostic: TableDiagnostic;
    };

/**
 * Plans the `cols` portion of a column structure edit without changing source.
 * This helper intentionally is not re-exported from the public emitter barrel.
 */
export function planColumnMetadataEdit(
  table: LosslessTable,
  gridColumnCount: number,
  edit: ColumnMetadataEdit
): ColumnMetadataPlan {
  const entries = table.attributes.entries.filter(
    (entry): entry is TableAttributeEntry & { kind: "named" } => entry.kind === "named" && entry.name === "cols"
  );
  if (entries.length === 0) {
    return { ok: true };
  }
  if (entries.length !== 1) {
    return unsafeMetadata(entries[0]?.range, "Column structure edit requires exactly one cols attribute");
  }
  if (!Number.isInteger(gridColumnCount) || gridColumnCount <= 0) {
    return unsafeMetadata(entries[0].range, "Column metadata cannot be matched to an invalid table grid");
  }

  const entry = entries[0];
  if (entry.value === undefined || entry.valueRange === undefined) {
    return unsafeMetadata(entry.range, "Column structure edit requires a source-addressable cols value");
  }

  const multiplier = parseSingleMultiplier(entry.value);
  if (multiplier !== undefined) {
    if (multiplier.count !== gridColumnCount) {
      return countMismatch(entry.range, multiplier.count, gridColumnCount);
    }
    if (!validEditIndexes(edit, gridColumnCount)) {
      return unsafeMetadata(entry.range, "Column structure edit uses an invalid logical column index");
    }
    const nextCount = edit.kind === "insert" ? multiplier.count + 1 : multiplier.count - 1;
    if (nextCount <= 0) {
      return unsafeMetadata(entry.range, "Column structure edit cannot produce empty cols metadata");
    }
    return replacement(entry, `${nextCount}*${multiplier.spec}`);
  }

  if (entry.value.includes("*")) {
    return unsafeMetadata(entry.range, "Mixed multiplier cols metadata cannot be edited safely");
  }

  const specs = entry.value.split(",");
  if (specs.some((spec) => spec.trim().length === 0)) {
    return unsafeMetadata(entry.range, "Empty cols segments cannot be edited safely");
  }
  if (specs.some((spec) => !isSupportedColumnSpec(spec.trim()))) {
    return unsafeMetadata(entry.range, "Unknown cols tokens cannot be edited safely");
  }
  if (specs.length !== gridColumnCount) {
    return countMismatch(entry.range, specs.length, gridColumnCount);
  }
  if (!validEditIndexes(edit, gridColumnCount)) {
    return unsafeMetadata(entry.range, "Column structure edit uses an invalid logical column index");
  }

  const updated = [...specs];
  if (edit.kind === "insert") {
    updated.splice(edit.insertColumn, 0, specs[edit.anchorColumn]);
  } else {
    updated.splice(edit.deleteColumn, 1);
  }
  if (updated.length === 0) {
    return unsafeMetadata(entry.range, "Column structure edit cannot produce empty cols metadata");
  }
  return replacement(entry, updated.join(","));
}

function parseSingleMultiplier(value: string): { count: number; spec: string } | undefined {
  const match = value.match(/^(\d+)\*([^,]*)$/u);
  if (match === null) {
    return undefined;
  }
  const count = Number.parseInt(match[1], 10);
  const spec = match[2];
  if (!Number.isSafeInteger(count) || count <= 0 || !isSupportedColumnSpec(spec)) {
    return undefined;
  }
  return { count, spec };
}

function isSupportedColumnSpec(spec: string): boolean {
  return COLUMN_SPEC_PATTERN.test(spec);
}

function validEditIndexes(edit: ColumnMetadataEdit, columnCount: number): boolean {
  if (edit.kind === "delete") {
    return Number.isInteger(edit.deleteColumn) && edit.deleteColumn >= 0 && edit.deleteColumn < columnCount;
  }
  return Number.isInteger(edit.anchorColumn)
    && edit.anchorColumn >= 0
    && edit.anchorColumn < columnCount
    && Number.isInteger(edit.insertColumn)
    && edit.insertColumn >= 0
    && edit.insertColumn <= columnCount;
}

function replacement(entry: TableAttributeEntry, text: string): ColumnMetadataPlan {
  if (entry.valueRange === undefined) {
    return unsafeMetadata(entry.range, "Column structure edit requires a source-addressable cols value");
  }
  return {
    ok: true,
    replacement: {
      start: entry.valueRange.start.offset,
      end: entry.valueRange.end.offset,
      text
    }
  };
}

function countMismatch(range: SourceRange, metadataCount: number, gridColumnCount: number): ColumnMetadataPlan {
  return unsafeMetadata(
    range,
    `Column metadata count ${metadataCount} does not match grid column count ${gridColumnCount}`
  );
}

function unsafeMetadata(range: SourceRange | undefined, message: string): ColumnMetadataPlan {
  return {
    ok: false,
    diagnostic: {
      code: "writeback.unsafe-column-metadata",
      severity: "error",
      message,
      range
    }
  };
}
