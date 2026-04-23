import { useState } from 'react';
import type { DragEvent as ReactDragEvent } from 'react';
import type { MatrixDraft, SlotBank } from './types';
import { resizeDraft, stampSlotIntoDraft } from './resolve';
import { getSlotDrag, isSlotDrag } from './drag';

type Props = {
  label: string;
  value: MatrixDraft;
  onChange: (next: MatrixDraft) => void;
  slots: SlotBank;
  minRows?: number;
  minCols?: number;
  maxRows?: number;
  maxCols?: number;
  lockCols?: number;
};

const MIN = 1;
const MAX = 6;

export default function MatrixEditor({
  label,
  value,
  onChange,
  slots,
  minRows = MIN,
  minCols = MIN,
  maxRows = MAX,
  maxCols = MAX,
  lockCols,
}: Props) {
  const [dropTarget, setDropTarget] = useState<{ row: number; col: number } | 'matrix' | null>(
    null,
  );
  const effectiveMinCols = lockCols ?? minCols;
  const effectiveMaxCols = lockCols ?? maxCols;

  function setDims(rows: number, cols: number) {
    const r = Math.max(minRows, Math.min(maxRows, rows));
    const c = Math.max(effectiveMinCols, Math.min(effectiveMaxCols, cols));
    onChange(resizeDraft(value, r, c));
  }

  function setCell(i: number, j: number, v: string) {
    const cells = value.cells.map((row) => row.slice());
    cells[i][j] = v;
    onChange({ ...value, cells });
  }

  function handleCellDragOver(ev: ReactDragEvent, row: number, col: number) {
    if (!isSlotDrag(ev)) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'copy';
    setDropTarget({ row, col });
  }

  function handleCellDrop(ev: ReactDragEvent, row: number, col: number) {
    if (!isSlotDrag(ev)) return;
    ev.preventDefault();
    ev.stopPropagation();
    setDropTarget(null);
    const idx = getSlotDrag(ev);
    if (idx === null) return;
    const slot = slots[idx];
    if (!slot || slot.kind === 'empty') return;
    onChange(stampSlotIntoDraft(value, idx, slot, row, col));
  }

  function handleMatrixDragOver(ev: ReactDragEvent) {
    if (!isSlotDrag(ev)) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'copy';
    if (!dropTarget) setDropTarget('matrix');
  }

  function handleMatrixDrop(ev: ReactDragEvent) {
    if (!isSlotDrag(ev)) return;
    ev.preventDefault();
    setDropTarget(null);
    const idx = getSlotDrag(ev);
    if (idx === null) return;
    const slot = slots[idx];
    if (!slot || slot.kind === 'empty') return;
    onChange(stampSlotIntoDraft(value, idx, slot, 0, 0));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-mono text-[0.75rem] text-[#a0a0aa] uppercase tracking-[0.08em]">
          {label}
        </span>
        <div className="flex items-center gap-3 font-mono text-[0.75rem] text-text-secondary">
          <DimControl
            label="rows"
            value={value.rows}
            min={minRows}
            max={maxRows}
            onChange={(r) => setDims(r, value.cols)}
          />
          <span className="text-[#3a3a42]">×</span>
          <DimControl
            label="cols"
            value={value.cols}
            min={effectiveMinCols}
            max={effectiveMaxCols}
            onChange={(c) => setDims(value.rows, c)}
            disabled={lockCols !== undefined}
          />
        </div>
      </div>
      <div
        onDragOver={handleMatrixDragOver}
        onDragLeave={() => setDropTarget(null)}
        onDrop={handleMatrixDrop}
        className={`inline-grid gap-1.5 bg-[#0c0c12] border p-2 transition-colors duration-150 ${
          dropTarget === 'matrix' ? 'border-accent' : 'border-[#3a3a42]'
        }`}
        style={{ gridTemplateColumns: `repeat(${value.cols}, minmax(3.5rem, 1fr))` }}
      >
        {value.cells.flatMap((row, i) =>
          row.map((cell, j) => (
            <div
              key={`${i}-${j}`}
              onDragOver={(e) => handleCellDragOver(e, i, j)}
              onDragLeave={() => setDropTarget(null)}
              onDrop={(e) => handleCellDrop(e, i, j)}
              className={`relative transition-colors duration-150 ${
                dropTarget &&
                dropTarget !== 'matrix' &&
                dropTarget.row === i &&
                dropTarget.col === j
                  ? 'ring-2 ring-accent'
                  : ''
              }`}
            >
              <input
                value={cell}
                onChange={(e) => setCell(i, j, e.target.value)}
                className="cell-input w-full bg-[#13131a] border border-transparent focus:border-accent px-2 py-1.5 font-mono text-[0.9rem] text-text-primary text-center transition-colors duration-150 outline-none"
                spellCheck={false}
                autoComplete="off"
              />
            </div>
          )),
        )}
      </div>
      <p className="font-mono text-[0.7rem] text-text-secondary/70 leading-relaxed">
        Integers, <span className="text-accent">S0…S9</span>, <span className="text-accent">S0[i,j]</span>,
        or drop a slot from the bank below.
      </p>
    </div>
  );
}

function DimControl({
  label,
  value,
  min,
  max,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="opacity-60">{label}</span>
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        disabled={disabled || value <= min}
        className="w-6 h-6 border border-[#3a3a42] hover:border-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label={`decrease ${label}`}
      >
        −
      </button>
      <span className="tabular-nums text-text-primary w-4 text-center">{value}</span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={disabled || value >= max}
        className="w-6 h-6 border border-[#3a3a42] hover:border-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label={`increase ${label}`}
      >
        +
      </button>
    </div>
  );
}
