import { BecaAvatar } from '@/components/shared/beca-avatar';

interface BecaTipProps {
  title?: string;
  children: React.ReactNode;
}

export function BecaTip({ title = 'Dica da Beca', children }: BecaTipProps) {
  return (
    <div className="flex items-start gap-3.5 rounded-panel bg-accent p-4 shadow-soft">
      <BecaAvatar size={44} />
      <div>
        <strong className="block text-[0.8rem] font-extrabold uppercase tracking-[0.06em] text-accent-foreground">
          {title}
        </strong>
        <p className="text-[0.95rem] font-medium text-accent-text">{children}</p>
      </div>
    </div>
  );
}
