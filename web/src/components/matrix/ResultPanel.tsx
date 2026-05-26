import { useState } from 'react';
import type { DragEvent as ReactDragEvent } from 'react';
import type { Atom, OpResponse, SlotValue } from './types';
import { atomToSlotValue, SLOT_COUNT } from './resolve';
import { setResultDrag } from './drag';
import MatrixGrid from './MatrixGrid';
import { useT } from './i18n';

type Props = {
  response: OpResponse | null;
  onSave: (index: number, value: SlotValue) => void;
};

export default function ResultPanel({ response, onSave }: Props) {
  const [slotIdx, setSlotIdx] = useState<number>(0);
  const t = useT();
  if (!response) {
    return (
      <div className="p-6 border border-dashed border-[#3a3a42] bg-[#0c0c12]/40">
        <span className="font-mono text-[0.8rem] text-text-secondary/60">
          {t.resultPlaceholder}
        </span>
      </div>
    );
  }

  const { result, warnings, n } = response;
  const savable = atomToSlotValue(result);

  return (
    <div className="flex flex-col gap-4">
      {warnings.length > 0 && (
        <div className="p-3 border border-yellow-500/40 bg-yellow-500/5">
          <span className="block font-mono text-[0.7rem] text-yellow-400 uppercase tracking-wider mb-1">
            {t.warnings}
          </span>
          <ul className="list-disc list-inside font-mono text-[0.78rem] text-yellow-200/80 space-y-0.5">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="relative p-5 border border-accent/40 bg-gradient-to-br from-[#13131a] to-[#0c0c12] flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-[0.7rem] text-accent uppercase tracking-[0.12em]">
              {t.result}
            </span>
            <span className="font-mono text-[0.7rem] text-text-secondary/70">{t.modShort(n)}</span>
          </div>
          {savable && (
            <div className="flex items-center gap-2">
              <span className="font-mono text-[0.65rem] text-text-secondary/70 uppercase tracking-wider hidden md:inline">
                {t.dropOnSlotHint}
              </span>
              <select
                value={slotIdx}
                onChange={(e) => setSlotIdx(parseInt(e.target.value, 10))}
                className="bg-[#13131a] border border-[#3a3a42] px-2 py-1 font-mono text-[0.75rem]"
              >
                {Array.from({ length: SLOT_COUNT }).map((_, i) => (
                  <option key={i} value={i}>
                    S{i}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => onSave(slotIdx, savable)}
                className="font-mono text-[0.7rem] uppercase tracking-[0.1em] px-3 py-1.5 bg-accent-deep text-white hover:bg-accent transition-colors"
              >
                {t.saveToSlot(slotIdx)}
              </button>
            </div>
          )}
        </div>
        <DraggableResult atom={result} savable={!!savable} />
      </div>
    </div>
  );
}

function DraggableResult({ atom, savable }: { atom: Atom; savable: boolean }) {
  const [dragging, setDragging] = useState(false);
  const t = useT();

  function handleDragStart(ev: ReactDragEvent) {
    if (!savable) {
      ev.preventDefault();
      return;
    }
    setResultDrag(ev);
    setDragging(true);
  }

  return (
    <div
      draggable={savable}
      onDragStart={handleDragStart}
      onDragEnd={() => setDragging(false)}
      className={`relative ${savable ? 'cursor-grab active:cursor-grabbing' : ''} ${
        dragging ? 'opacity-50' : ''
      }`}
    >
      {savable && (
        <span
          aria-hidden="true"
          className="absolute -top-1 -left-1 font-mono text-[0.65rem] text-accent/60"
          title={t.dragToSlotTooltip}
        >
          ⋮⋮
        </span>
      )}
      <ResultBody atom={atom} />
    </div>
  );
}

function ResultBody({ atom }: { atom: Atom }) {
  if (atom.type === 'scalar') {
    return (
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[1rem] text-text-secondary">=</span>
        <span className="font-mono text-[1.8rem] text-accent font-semibold tabular-nums">
          {atom.value}
        </span>
      </div>
    );
  }
  if (atom.type === 'matrix') {
    return <MatrixGrid rows={atom.rows} cols={atom.cols} data={atom.data} size="lg" />;
  }
  if (atom.type === 'rref') {
    return <RrefResult atom={atom} />;
  }
  if (atom.type === 'system') {
    return <SystemResult atom={atom} />;
  }
  return null;
}

function SystemResult({
  atom,
}: {
  atom: Extract<Atom, { type: 'system' }>;
}) {
  const t = useT();
  const pivots = atom.pivot_cols.map((c) => c + 1).join(', ') || '—';
  const free = atom.free_cols.map((c) => c + 1).join(', ') || '—';
  return (
    <div className="flex flex-col gap-3 font-mono text-[0.88rem]">
      <div className="flex items-center gap-2">
        <span
          className={`w-2 h-2 rounded-full ${atom.consistent ? 'bg-green-500' : 'bg-red-500'}`}
        />
        <span className={atom.consistent ? 'text-green-400' : 'text-red-400'}>
          {atom.consistent ? t.consistent : t.inconsistent}
        </span>
      </div>
      {atom.consistent && atom.particular && (
        <div>
          <span className="block text-[0.7rem] text-text-secondary uppercase tracking-wider mb-1">
            {t.particularSolution}
          </span>
          <VectorLine values={atom.particular} />
        </div>
      )}
      {atom.homogeneous_basis.length > 0 && (
        <div>
          <span className="block text-[0.7rem] text-text-secondary uppercase tracking-wider mb-1">
            {t.homogeneousBasis(atom.homogeneous_basis.length)}
          </span>
          <div className="flex flex-col gap-1">
            {atom.homogeneous_basis.map((v, i) => (
              <VectorLine key={i} values={v} prefix={`v${i + 1}`} />
            ))}
          </div>
        </div>
      )}
      <div className="text-[0.72rem] text-text-secondary/70">{t.pivotsFree(pivots, free)}</div>
    </div>
  );
}

function RrefResult({ atom }: { atom: Extract<Atom, { type: 'rref' }> }) {
  const t = useT();
  const cols = atom.pivot_cols.map((c) => c + 1).join(', ') || '—';
  return (
    <div className="flex flex-col gap-2">
      <MatrixGrid
        rows={atom.rows}
        cols={atom.cols}
        data={atom.data}
        highlightCols={atom.pivot_cols}
        size="lg"
        caption={t.rrefCaption(atom.rank, cols)}
      />
    </div>
  );
}

function VectorLine({ values, prefix }: { values: number[]; prefix?: string }) {
  return (
    <div className="flex items-center gap-2">
      {prefix && <span className="text-accent text-[0.78rem]">{prefix} =</span>}
      <span className="text-text-secondary">(</span>
      {values.map((v, i) => (
        <span key={i} className="tabular-nums">
          {v}
          {i < values.length - 1 && <span className="text-text-secondary/60">,&nbsp;</span>}
        </span>
      ))}
      <span className="text-text-secondary">)</span>
    </div>
  );
}
