import { useState } from 'react';
import type { DragEvent as ReactDragEvent } from 'react';
import type { SlotBank, SlotValue } from './types';
import { isResultDrag, setSlotDrag } from './drag';

type Props = {
  slots: SlotBank;
  onClear: (index: number) => void;
  onInspect?: (index: number) => void;
  /** True when there is a current result the user can drop here. */
  hasResult: boolean;
  /** Invoked when the user drops the current result onto slot `index`. */
  onSaveResult: (index: number) => void;
};

export default function SlotBankView({
  slots,
  onClear,
  onInspect,
  hasResult,
  onSaveResult,
}: Props) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[0.75rem] text-[#a0a0aa] uppercase tracking-[0.08em]">
          Slots
        </span>
        <span className="font-mono text-[0.7rem] text-text-secondary/70">
          drag a tile into a matrix cell · drop the result here to save
        </span>
      </div>
      <div className="grid grid-cols-5 max-md:grid-cols-2 gap-2">
        {slots.map((s, i) => (
          <SlotTile
            key={i}
            index={i}
            value={s}
            onClear={() => onClear(i)}
            onInspect={onInspect ? () => onInspect(i) : undefined}
            hasResult={hasResult}
            onSaveResult={() => onSaveResult(i)}
          />
        ))}
      </div>
    </div>
  );
}

function SlotTile({
  index,
  value,
  onClear,
  onInspect,
  hasResult,
  onSaveResult,
}: {
  index: number;
  value: SlotValue;
  onClear: () => void;
  onInspect?: () => void;
  hasResult: boolean;
  onSaveResult: () => void;
}) {
  const [acceptingResult, setAcceptingResult] = useState(false);
  const isEmpty = value.kind === 'empty';
  const isSquare = value.kind === 'matrix' && value.rows === value.cols;
  const draggable = !isEmpty;

  function handleDragStart(ev: ReactDragEvent) {
    if (isEmpty) {
      ev.preventDefault();
      return;
    }
    setSlotDrag(ev, index);
  }

  function handleDragOver(ev: ReactDragEvent) {
    if (!hasResult || !isResultDrag(ev)) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'copy';
    setAcceptingResult(true);
  }

  function handleDrop(ev: ReactDragEvent) {
    if (!hasResult || !isResultDrag(ev)) return;
    ev.preventDefault();
    setAcceptingResult(false);
    onSaveResult();
  }

  return (
    <div
      draggable={draggable}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={() => setAcceptingResult(false)}
      onDrop={handleDrop}
      className={`group relative p-2.5 border transition-colors duration-200 select-none ${
        isEmpty
          ? 'border-dashed border-[#3a3a42]/60'
          : `border-[#3a3a42] bg-[#0c0c12] ${
              draggable ? 'cursor-grab active:cursor-grabbing hover:border-accent' : ''
            }`
      } ${acceptingResult ? 'ring-2 ring-accent bg-accent/5' : ''}`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-[0.75rem] font-semibold text-accent">S{index}</span>
        {!isEmpty && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {onInspect && (
              <button
                type="button"
                onClick={onInspect}
                className="font-mono text-[0.65rem] text-text-secondary hover:text-accent"
                aria-label={`inspect S${index}`}
              >
                view
              </button>
            )}
            <button
              type="button"
              onClick={onClear}
              className="font-mono text-[0.65rem] text-text-secondary hover:text-red-400"
              aria-label={`clear S${index}`}
            >
              ×
            </button>
          </div>
        )}
      </div>
      {value.kind === 'empty' && (
        <span className="font-mono text-[0.7rem] text-text-secondary/40">
          {hasResult ? 'drop result here' : 'empty'}
        </span>
      )}
      {value.kind === 'scalar' && (
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[0.7rem] text-text-secondary">scalar</span>
          <span className="font-mono text-[0.95rem] text-text-primary tabular-nums">
            {value.value}
          </span>
        </div>
      )}
      {value.kind === 'matrix' && (
        <div className="flex items-center gap-2">
          <span className="font-mono text-[0.7rem] text-text-secondary">
            {value.rows}×{value.cols}
          </span>
          {isSquare && (
            <span
              className="font-mono text-[0.65rem] text-accent-deep border border-accent-deep/60 px-1"
              title="square"
            >
              □
            </span>
          )}
        </div>
      )}
      {draggable && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-1 right-1.5 font-mono text-[0.6rem] text-text-secondary/40 group-hover:text-accent/70 transition-colors"
        >
          ⋮⋮
        </span>
      )}
    </div>
  );
}
