'use client';

import { BecaAvatar } from '@/components/shared/beca-avatar';
import { useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

const SUGGESTIONS = [
  'Como tá minha carteira?',
  'O que significa dividend yield?',
  'Quando recebo meus próximos proventos?',
] as const;

export function ChatPanel() {
  const [input, setInput] = useState('');
  const { messages, sendMessage, status, error } = useChat({
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
      <div className="flex flex-1 flex-col gap-4">
        {messages.length === 0 && (
          <div className="card-lg">
            <div className="flex items-start gap-3.5">
              <BecaAvatar size={44} />
              <div>
                <p className="font-bold">
                  Oi! Pode perguntar o que quiser sobre tua carteira.
                </p>
                <p className="mt-1 text-[0.95rem] font-medium text-muted-foreground">
                  Eu explico teus números sem economês. Só não te digo o que
                  comprar ou vender — essa decisão é sua, sempre.
                </p>
              </div>
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
                className={`max-w-[85%] whitespace-pre-wrap rounded-card px-4 py-3 text-[0.97rem] shadow-soft ${
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
              Beca tá escrevendo…
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-panel bg-negative-tint px-4 py-3 text-sm font-semibold text-negative-deep">
            Não consegui responder agora. Tenta de novo daqui a pouco.
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
          placeholder="Pergunta pra Beca…"
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
