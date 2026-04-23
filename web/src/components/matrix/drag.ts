import type { DragEvent as ReactDragEvent } from 'react';

export const MIME_SLOT = 'application/x-matrix-slot';
export const MIME_RESULT = 'application/x-matrix-result';

/** Package a slot index onto a drag event. */
export function setSlotDrag(ev: ReactDragEvent, index: number) {
  ev.dataTransfer.setData(MIME_SLOT, String(index));
  ev.dataTransfer.setData('text/plain', `S${index}`);
  ev.dataTransfer.effectAllowed = 'copy';
}

/** Read the slot index from a drop event. Returns null if absent. */
export function getSlotDrag(ev: ReactDragEvent): number | null {
  const raw = ev.dataTransfer.getData(MIME_SLOT);
  if (raw === '') return null;
  const idx = parseInt(raw, 10);
  return Number.isNaN(idx) ? null : idx;
}

/** Flag the drag as carrying the current result atom. */
export function setResultDrag(ev: ReactDragEvent) {
  ev.dataTransfer.setData(MIME_RESULT, '1');
  ev.dataTransfer.setData('text/plain', 'matrix result');
  ev.dataTransfer.effectAllowed = 'copy';
}

/** True when the event's dataTransfer declares a slot payload. */
export function isSlotDrag(ev: ReactDragEvent): boolean {
  return Array.from(ev.dataTransfer.types).includes(MIME_SLOT);
}

/** True when the event's dataTransfer declares a result payload. */
export function isResultDrag(ev: ReactDragEvent): boolean {
  return Array.from(ev.dataTransfer.types).includes(MIME_RESULT);
}
