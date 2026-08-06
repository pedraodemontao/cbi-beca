-- Quando a brapi listou esse ticker pela última vez.
--
-- `syncCatalog` só faz upsert e nunca remove, então papel que saiu de listagem
-- ficava no banco pra sempre — com a última cotação e o último volume
-- congelados. Isso engana duas vezes: aparece no ranking de preço teto com
-- número velho, e o piso de liquidez não pega porque o volume antigo também
-- ficou gravado.
--
-- Marcar em vez de apagar de propósito: `ceiling_overrides` tem FK pra
-- `companies`, e um DELETE levaria junto o ajuste que a usuária fez. Some da
-- tela, continua no banco.

alter table public.companies
  add column last_seen_at timestamptz;

-- Todo mundo que está aí veio de uma sincronização; o carimbo inicial é o que
-- a linha já tinha.
update public.companies set last_seen_at = updated_at;

create index companies_last_seen_idx on public.companies (last_seen_at desc nulls last);
