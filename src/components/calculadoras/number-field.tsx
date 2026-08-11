'use client';

import { useState } from 'react';

/**
 * Campo numérico das calculadoras.
 *
 * Nasceu para consertar um defeito que as quatro calculadoras repetiam: o
 * input era controlado por `value={numero}` com
 * `onChange={Number(e.target.value) || 0}`. Em todo estado intermediário
 * inválido — campo vazio, `"9,"`, `"12."` — o navegador entrega string vazia,
 * o `|| 0` vira zero e o React reescreve o campo. Digitando "9,43" da esquerda
 * para a direita, sobrava "43". Na calculadora de FII isso corrompia a
 * simulação inteira; na de renda passiva, zerava o rendimento e a tela
 * anunciava patrimônio necessário de R$ 0,00.
 *
 * A correção é manter o TEXTO em estado local e só propagar número quando ele
 * é finito. O pai continua recebendo `number`, sem saber de nada disso.
 */

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  prefix?: string;
  suffix?: string;
  step?: number | 'any';
  /** Teto opcional — sem ele, "juros compostos por 9999 anos" trava a aba. */
  max?: number;
}

export function NumberField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  step = 'any',
  max,
}: NumberFieldProps) {
  const [text, setText] = useState(() => String(value));
  const [lastValue, setLastValue] = useState(value);

  // Quando o valor chega de fora (escolher um ativo preenche cotação e
  // rendimento), o texto acompanha. Ajuste durante a renderização, e não em
  // efeito: efeito repintaria a tela com o texto antigo antes de corrigir.
  if (value !== lastValue) {
    setLastValue(value);
    if (Number(text) !== value) setText(String(value));
  }

  function handleChange(raw: string) {
    setText(raw);

    // Vírgula é o separador decimal que a usuária digita.
    const parsed = Number(raw.replace(',', '.'));
    if (raw.trim() === '' || !Number.isFinite(parsed)) return;

    const clamped = Math.max(0, max === undefined ? parsed : Math.min(max, parsed));
    onChange(clamped);
  }

  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-bold">{label}</span>
      <span className="flex items-center gap-2 rounded-panel border border-border bg-surface px-4 focus-within:border-primary">
        {prefix && (
          <span className="text-sm font-bold text-muted-foreground">{prefix}</span>
        )}
        <input
          type="number"
          min="0"
          max={max}
          step={step}
          inputMode="decimal"
          value={text}
          onChange={(event) => handleChange(event.target.value)}
          // Sai do campo em estado inválido: volta pro último número válido.
          onBlur={() => setText(String(value))}
          className="num w-full bg-transparent py-3 text-base outline-none"
        />
        {suffix && (
          <span className="text-sm font-bold text-muted-foreground">{suffix}</span>
        )}
      </span>
    </label>
  );
}
