'use client';

import { useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { clearChatHistory } from '@/app/chat/actions';

const SUGGESTIONS = [
  'Resumo da minha carteira',
  'O que é dividend yield?',
  'Próximos proventos a receber',
] as const;

interface ChatPanelProps {
  /** Conversa já gravada, mais antiga primeiro. */
  initialMessages: UIMessage[];
}

export function ChatPanel({ initialMessages }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const { messages, sendMessage, status, error } = useChat({
    messages: initialMessages,
    transport: new DefaultChatTransport({ api: '/api/chat' }),
  });

  const isBusy = status === 'submitted' || status === 'streaming';

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isBusy) return;
    sendMessage({ text: trimmed });
    setInput('');
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      {messages.length > 0 && (
        <form action={clearChatHistory} className="flex justify-end">
          <button
            type="submit"
            className="rounded-full px-3 py-2 text-xs font-bold text-muted-foreground transition-colors hover:text-primary"
          >
            Limpar conversa
          </button>
        </form>
      )}

      <div className="flex flex-1 flex-col gap-4">
        {messages.length === 0 && (
          <div className="card-lg">
            <div>
              <p className="font-bold">Assistente</p>
              <p className="mt-1 text-[0.95rem] font-medium text-muted-foreground">
                Consultas sobre a carteira, os proventos e os indicadores da
                plataforma, com explicação dos termos. O assistente não emite
                recomendação de compra ou venda.
              </p>
            </div>

            <ul className="mt-5 flex flex-wrap gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <li key={suggestion}>
                  <button
                    type="button"
                    onClick={() => send(suggestion)}
                    className="rounded-full border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:border-primary hover:bg-primary-wash hover:text-primary-deep"
                  >
                    {suggestion}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {messages.map((message) => {
          const isUser = message.role === 'user';
          const text = message.parts
            .map((part) => (part.type === 'text' ? part.text : ''))
            .join('');

          return (
            <div
              key={message.id}
              className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              <div
                // O balão tem teto próprio porque a tela ficou mais larga e o
                // texto não acompanha: 85% de 1024px daria linha de ~140
                // caracteres, o dobro do que se lê sem perder a linha. O
                // container cresce pra caber a interface; o texto para no
                // ponto em que já estava.
                className={`max-w-[85%] whitespace-pre-wrap rounded-card px-4 py-3 text-[0.97rem] shadow-soft sm:max-w-[38rem] ${
                  isUser
                    ? 'bg-primary font-medium text-primary-foreground'
                    : 'bg-surface font-medium text-foreground'
                }`}
              >
                {text}
              </div>
            </div>
          );
        })}

        {isBusy && (
          <div className="flex justify-start">
            <div className="rounded-card bg-surface px-4 py-3 text-sm font-medium text-muted-foreground shadow-soft">
              Gerando resposta…
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-panel bg-negative-tint px-4 py-3 text-sm font-semibold text-negative-deep">
            Não foi possível responder agora. Tente novamente em instantes.
          </p>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="sticky bottom-24 flex items-center gap-2 rounded-full border border-border bg-surface p-1.5 shadow-lift sm:bottom-4"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Digite sua pergunta"
          aria-label="Sua pergunta"
          className="flex-1 bg-transparent px-4 py-2.5 text-base outline-none placeholder:text-muted-foreground/70"
        />
        <button
          type="submit"
          disabled={isBusy || input.trim().length === 0}
          className="rounded-full bg-primary px-5 py-2.5 font-bold text-primary-foreground transition-colors hover:bg-primary-deep disabled:opacity-50"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}
