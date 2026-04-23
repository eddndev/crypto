import { groupedOperations, type OperationKind } from './operations';

type Props = {
  value: OperationKind;
  onChange: (kind: OperationKind) => void;
};

export default function OperationSelector({ value, onChange }: Props) {
  const groups = groupedOperations();
  return (
    <label className="flex flex-col gap-2">
      <span className="font-mono text-[0.75rem] text-[#a0a0aa] uppercase tracking-[0.08em]">
        Operation
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as OperationKind)}
        className="bg-[#0c0c12] border border-[#3a3a42] p-3 font-mono text-[0.9rem] text-text-primary focus:outline-none focus:border-accent transition-colors duration-200"
      >
        {Object.entries(groups).map(([key, { label, items }]) => (
          <optgroup key={key} label={label}>
            {items.map((op) => (
              <option key={op.kind} value={op.kind}>
                {op.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
