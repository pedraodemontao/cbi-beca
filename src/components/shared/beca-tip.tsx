interface BecaTipProps {
  title?: string;
  children: React.ReactNode;
}

export function BecaTip({ title = 'Dica da Beca', children }: BecaTipProps) {
  return (
    <div className="flex items-start gap-3.5 rounded-panel bg-accent p-4 shadow-soft">
      <span
        aria-hidden
        className="grid size-11 flex-none place-items-center rounded-full border-[3px] border-white bg-gradient-to-br from-[#2E9463] to-primary-deep text-lg font-extrabold text-white shadow-sm"
      >
        B
      </span>
      <div>
        <strong className="block text-[0.8rem] font-extrabold uppercase tracking-[0.06em] text-accent-foreground">
          {title}
        </strong>
        <p className="text-[0.95rem] font-medium text-accent-text">{children}</p>
      </div>
    </div>
  );
}
