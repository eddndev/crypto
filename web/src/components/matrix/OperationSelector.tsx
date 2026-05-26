import { groupedOperations, type OperationKind, type OperationMeta } from './operations';
import { useT } from './i18n';

type Props = {
  value: OperationKind;
  onChange: (kind: OperationKind) => void;
};

export default function OperationSelector({ value, onChange }: Props) {
  const groups = groupedOperations();
  const t = useT();

  const groupLabel = (key: string, fallback: string) => {
    switch (key) {
      case 'arithmetic': return t.groupArithmetic;
      case 'structure':  return t.groupStructure;
      case 'square':     return t.groupSquare;
      case 'systems':    return t.groupSystems;
      default:           return fallback;
    }
  };

  const opLabel = (op: OperationMeta) => {
    switch (op.kind) {
      case 'submatrix':     return t.opSubmatrix;
      case 'right_inverse': return t.opRightInv;
      case 'left_inverse':  return t.opLeftInv;
      default:              return op.label;
    }
  };

  return (
    <label className="flex flex-col gap-2">
      <span className="font-mono text-[0.75rem] text-[#a0a0aa] uppercase tracking-[0.08em]">
        {t.operation}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as OperationKind)}
        className="bg-[#0c0c12] border border-[#3a3a42] p-3 font-mono text-[0.9rem] text-text-primary focus:outline-none focus:border-accent transition-colors duration-200"
      >
        {Object.entries(groups).map(([key, { label, items }]) => (
          <optgroup key={key} label={groupLabel(key, label)}>
            {items.map((op) => (
              <option key={op.kind} value={op.kind}>
                {opLabel(op)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
