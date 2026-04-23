export type Scalar = { type: 'scalar'; value: number };
export type MatrixAtom = { type: 'matrix'; rows: number; cols: number; data: number[][] };
export type SystemAtom = {
  type: 'system';
  consistent: boolean;
  particular: number[] | null;
  homogeneous_basis: number[][];
  pivot_cols: number[];
  free_cols: number[];
  rref: number[][];
};
export type RrefAtom = {
  type: 'rref';
  rows: number;
  cols: number;
  data: number[][];
  pivot_cols: number[];
  rank: number;
};

export type Atom = Scalar | MatrixAtom | SystemAtom | RrefAtom;

export type SlotValue =
  | { kind: 'empty' }
  | { kind: 'scalar'; value: number }
  | { kind: 'matrix'; rows: number; cols: number; data: number[][] };

export type SlotBank = SlotValue[]; // length 10

export type MatrixDraft = {
  rows: number;
  cols: number;
  /** Each cell holds a user-entered string: literal integer, `S3`, or `S3[1,2]`. */
  cells: string[][];
};

export type Step =
  | { kind: 'note'; text: string }
  | { kind: 'swap'; i: number; j: number }
  | { kind: 'scale'; row: number; by: number; inv_of: number }
  | { kind: 'eliminate'; target: number; source: number; factor: number }
  | { kind: 'pivot'; row: number; col: number; value: number }
  | { kind: 'snapshot'; data: number[][] }
  | { kind: 'cofactor'; i: number; j: number; sign: number; minor: number[][]; det: number };

export type OpResponse = {
  n: number;
  result: Atom;
  trace: Step[];
  warnings: string[];
};
