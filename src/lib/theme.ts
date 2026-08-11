/**
 * Chave e cores do tema.
 *
 * Mora num módulo NEUTRO — sem `'use client'` — de propósito. Constante
 * exportada de um módulo cliente não chega ao servidor como valor: o bundler
 * entrega uma referência, e interpolar isso numa string do layout produz o
 * corpo de uma função que lança "Attempted to call X() from the server". Foi
 * exatamente o que aconteceu com o script que aplica o tema salvo: ele nasceu
 * procurando essa mensagem inteira como chave do localStorage, achava nada, e
 * a escolha da usuária era ignorada a cada recarregamento — sem erro nenhum
 * no console.
 */

export const THEME_STORAGE_KEY = 'cbi-theme';

/** Cor da barra do navegador em cada tema — os mesmos hex do design system. */
export const THEME_COLOR = { light: '#faf8f3', dark: '#08080a' } as const;

export type Theme = keyof typeof THEME_COLOR;
