interface InfoNoteProps {
  /** Rótulo curto acima do texto. Sem ele a nota é só o parágrafo. */
  title?: string;
  children: React.ReactNode;
}

/**
 * Nota informativa do sistema.
 *
 * Substituiu a caixa que trazia o avatar e a assinatura da Beca. O conteúdo
 * continua sendo o mesmo tipo de informação — o que aquele número quer dizer,
 * qual é o próximo passo —, mas apresentado como saída da ferramenta, não como
 * fala de uma pessoa.
 *
 * A barra em ouro à esquerda é o que sobrou de marca aqui: identifica sem
 * personificar.
 */
export function InfoNote({ title, children }: InfoNoteProps) {
  return (
    <div className="rounded-panel border-l-4 border-primary bg-panel px-4 py-3.5">
      {title && (
        <strong className="block text-[0.78rem] font-extrabold uppercase tracking-[0.08em] text-primary">
          {title}
        </strong>
      )}
      <p className="text-[0.95rem] font-medium text-foreground/90">{children}</p>
    </div>
  );
}
