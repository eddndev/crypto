export type OperationKind =
  | 'add'
  | 'sub'
  | 'scalar_mul'
  | 'mul'
  | 'transpose'
  | 'det'
  | 'adj'
  | 'inv'
  | 'pow'
  | 'rref'
  | 'rank'
  | 'concat_h'
  | 'concat_v'
  | 'augment'
  | 'submatrix'
  | 'solve'
  | 'right_inverse'
  | 'left_inverse';

export type OperationMeta = {
  kind: OperationKind;
  label: string;
  group: 'arithmetic' | 'structure' | 'square' | 'systems';
  groupLabel: string;
  needsB: boolean;
  needsK: boolean;
  needsP: boolean;
  needsSel: boolean;
  requiresSquareA: boolean;
  /** If true, B must be a column vector (cols = 1). */
  bIsVector: boolean;
};

export const OPERATIONS: OperationMeta[] = [
  { kind: 'add',           label: 'A + B',         group: 'arithmetic', groupLabel: 'Arithmetic', needsB: true,  needsK: false, needsP: false, needsSel: false, requiresSquareA: false, bIsVector: false },
  { kind: 'sub',           label: 'A − B',         group: 'arithmetic', groupLabel: 'Arithmetic', needsB: true,  needsK: false, needsP: false, needsSel: false, requiresSquareA: false, bIsVector: false },
  { kind: 'scalar_mul',    label: 'k · A',         group: 'arithmetic', groupLabel: 'Arithmetic', needsB: false, needsK: true,  needsP: false, needsSel: false, requiresSquareA: false, bIsVector: false },
  { kind: 'mul',           label: 'A · B',         group: 'arithmetic', groupLabel: 'Arithmetic', needsB: true,  needsK: false, needsP: false, needsSel: false, requiresSquareA: false, bIsVector: false },
  { kind: 'transpose',     label: 'Aᵀ',            group: 'structure',  groupLabel: 'Structure',  needsB: false, needsK: false, needsP: false, needsSel: false, requiresSquareA: false, bIsVector: false },
  { kind: 'concat_h',      label: '[A | B]',       group: 'structure',  groupLabel: 'Structure',  needsB: true,  needsK: false, needsP: false, needsSel: false, requiresSquareA: false, bIsVector: false },
  { kind: 'concat_v',      label: '[A ; B]',       group: 'structure',  groupLabel: 'Structure',  needsB: true,  needsK: false, needsP: false, needsSel: false, requiresSquareA: false, bIsVector: false },
  { kind: 'augment',       label: '[A | b]',       group: 'structure',  groupLabel: 'Structure',  needsB: true,  needsK: false, needsP: false, needsSel: false, requiresSquareA: false, bIsVector: true  },
  { kind: 'submatrix',     label: 'submatrix(A)',  group: 'structure',  groupLabel: 'Structure',  needsB: false, needsK: false, needsP: false, needsSel: true,  requiresSquareA: false, bIsVector: false },
  { kind: 'det',           label: 'det A',         group: 'square',     groupLabel: 'Square-only',needsB: false, needsK: false, needsP: false, needsSel: false, requiresSquareA: true,  bIsVector: false },
  { kind: 'adj',           label: 'adj A',         group: 'square',     groupLabel: 'Square-only',needsB: false, needsK: false, needsP: false, needsSel: false, requiresSquareA: true,  bIsVector: false },
  { kind: 'inv',           label: 'A⁻¹',           group: 'square',     groupLabel: 'Square-only',needsB: false, needsK: false, needsP: false, needsSel: false, requiresSquareA: true,  bIsVector: false },
  { kind: 'pow',           label: 'Aᵖ',            group: 'square',     groupLabel: 'Square-only',needsB: false, needsK: false, needsP: true,  needsSel: false, requiresSquareA: true,  bIsVector: false },
  { kind: 'rref',          label: 'rref(A)',       group: 'systems',    groupLabel: 'Systems',    needsB: false, needsK: false, needsP: false, needsSel: false, requiresSquareA: false, bIsVector: false },
  { kind: 'rank',          label: 'rank(A)',       group: 'systems',    groupLabel: 'Systems',    needsB: false, needsK: false, needsP: false, needsSel: false, requiresSquareA: false, bIsVector: false },
  { kind: 'solve',         label: 'solve Ax = b',  group: 'systems',    groupLabel: 'Systems',    needsB: true,  needsK: false, needsP: false, needsSel: false, requiresSquareA: false, bIsVector: true  },
  { kind: 'right_inverse', label: 'A⁻¹ right',     group: 'systems',    groupLabel: 'Systems',    needsB: false, needsK: false, needsP: false, needsSel: false, requiresSquareA: false, bIsVector: false },
  { kind: 'left_inverse',  label: 'A⁻¹ left',      group: 'systems',    groupLabel: 'Systems',    needsB: false, needsK: false, needsP: false, needsSel: false, requiresSquareA: false, bIsVector: false },
];

export function getOp(kind: OperationKind): OperationMeta {
  const op = OPERATIONS.find((o) => o.kind === kind);
  if (!op) throw new Error(`unknown operation ${kind}`);
  return op;
}

export function groupedOperations() {
  const groups: Record<string, { label: string; items: OperationMeta[] }> = {};
  for (const op of OPERATIONS) {
    if (!groups[op.group]) groups[op.group] = { label: op.groupLabel, items: [] };
    groups[op.group].items.push(op);
  }
  return groups;
}
