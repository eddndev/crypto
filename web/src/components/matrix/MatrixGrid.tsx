type Props = {
  rows: number;
  cols: number;
  data: number[][];
  highlightCols?: number[];
  caption?: string;
  /** Visual size variant. `lg` is used for the result panel. */
  size?: 'sm' | 'md' | 'lg';
};

export default function MatrixGrid({
  rows,
  cols,
  data,
  highlightCols,
  caption,
  size = 'md',
}: Props) {
  const cellFont = size === 'lg' ? 'text-[1.1rem]' : size === 'sm' ? 'text-[0.85rem]' : 'text-[0.95rem]';
  const cellPad = size === 'lg' ? 'px-3 py-1.5' : size === 'sm' ? 'px-1 py-0.5' : 'px-2 py-1';
  const bracketW = size === 'lg' ? 'w-2.5' : 'w-2';
  const gap = size === 'lg' ? 'gap-x-2 gap-y-1' : 'gap-x-2 gap-y-0.5';
  void rows;

  return (
    <div className="inline-block">
      {caption && (
        <span className="block font-mono text-[0.7rem] text-[#a0a0aa] uppercase tracking-wider mb-2">
          {caption}
        </span>
      )}
      <div className="relative inline-block py-1.5 px-3">
        {/* Left bracket */}
        <span
          aria-hidden="true"
          className={`absolute left-0 top-0 bottom-0 ${bracketW} border-l-2 border-t-2 border-b-2 border-accent/70`}
        />
        {/* Right bracket */}
        <span
          aria-hidden="true"
          className={`absolute right-0 top-0 bottom-0 ${bracketW} border-r-2 border-t-2 border-b-2 border-accent/70`}
        />
        <div
          className={`grid ${gap} font-mono ${cellFont}`}
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(2ch, auto))` }}
        >
          {data.flatMap((row, i) =>
            row.map((v, j) => (
              <span
                key={`${i}-${j}`}
                className={`${cellPad} text-right tabular-nums ${
                  highlightCols?.includes(j)
                    ? 'text-accent font-semibold'
                    : 'text-text-primary'
                }`}
              >
                {v}
              </span>
            )),
          )}
        </div>
      </div>
    </div>
  );
}
