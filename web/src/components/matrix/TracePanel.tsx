import type { Step } from './types';
import { useT } from './i18n';

type Props = { steps: Step[]; n: number };

export default function TracePanel({ steps, n }: Props) {
  const t = useT();
  if (steps.length === 0) return null;
  return (
    <div className="p-4 border border-[#3a3a42] bg-[#0c0c12]">
      <span className="block font-mono text-[0.7rem] text-[#a0a0aa] uppercase tracking-wider mb-2">
        {t.trace(steps.length)}
      </span>
      <ol className="flex flex-col gap-1 font-mono text-[0.82rem]">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3">
            <span className="text-text-secondary/50 tabular-nums shrink-0 w-6 text-right">
              {i + 1}.
            </span>
            <StepLine step={s} n={n} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function StepLine({ step, n }: { step: Step; n: number }) {
  const t = useT();
  switch (step.kind) {
    case 'note':
      return <span className="text-text-secondary">{step.text}</span>;
    case 'swap':
      return (
        <span>
          <span className="text-accent">R{step.i + 1}</span>
          <span className="text-text-secondary/60"> ↔ </span>
          <span className="text-accent">R{step.j + 1}</span>
        </span>
      );
    case 'scale':
      return (
        <span>
          <span className="text-accent">R{step.row + 1}</span>
          <span className="text-text-secondary/60"> ← </span>
          <span className="text-accent">{step.by}</span>
          <span className="text-text-secondary/60"> · R{step.row + 1} </span>
          <span className="text-text-secondary/40">
            ({step.inv_of}⁻¹ mod {n})
          </span>
        </span>
      );
    case 'eliminate':
      return (
        <span>
          <span className="text-accent">R{step.target + 1}</span>
          <span className="text-text-secondary/60"> ← R{step.target + 1} − </span>
          <span className="text-accent">{step.factor}</span>
          <span className="text-text-secondary/60"> · R{step.source + 1}</span>
        </span>
      );
    case 'pivot':
      return (
        <span className="text-text-secondary">
          {t.pivotAt(step.row + 1, step.col + 1, step.value)}
        </span>
      );
    case 'cofactor':
      return (
        <span className="text-text-secondary">
          {t.cofactor(step.i + 1, step.j + 1, step.sign > 0 ? '+' : '−', step.det)}
        </span>
      );
    case 'snapshot':
      return <span className="text-text-secondary/60">{t.snapshot}</span>;
    default:
      return null;
  }
}
