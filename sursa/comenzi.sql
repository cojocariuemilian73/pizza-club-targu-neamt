-- Comenzi online pentru site (Supabase). Rulează o singură dată în Supabase → SQL Editor.
-- Apoi: Authentication → Sign In / Providers → dezactivează „Allow new users to sign up”,
-- Authentication → Users → Add user (e-mailul și parola patronului) și rulează la final:
--   insert into personal (user_id) select id from auth.users where email = 'EMAILUL-PATRONULUI';
-- În date-site.json pui la comenzi: supabaseUrl (Project URL) și supabaseCheie (cheia publică anon / publishable).
-- Nu pune niciodată cheia service_role în site.

create table if not exists personal (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table personal enable row level security;
create policy "personal se vede pe sine" on personal for select to authenticated using (user_id = auth.uid());

create table if not exists comenzi (
  id uuid primary key default gen_random_uuid(),
  cod text not null,
  creat timestamptz not null default now(),
  stare text not null default 'noua' check (stare in ('noua', 'acceptata', 'gata', 'finalizata', 'refuzata')),
  minute int,
  tip text not null check (tip in ('ridicare', 'livrare', 'masa')),
  masa text,
  nume text,
  telefon text,
  adresa text,
  observatii text,
  pentru text,
  produse jsonb not null,
  subtotal numeric(10, 2) not null,
  taxa numeric(10, 2) not null default 0,
  total numeric(10, 2) not null
);
create index if not exists comenzi_creat on comenzi (creat desc);
alter table comenzi enable row level security;

-- Doar personalul (contul patronului) vede și schimbă comenzile. Vizitatorii nu au acces direct la tabel.
create policy "personalul vede comenzile" on comenzi for select to authenticated
  using (exists (select 1 from personal where user_id = auth.uid()));
create policy "personalul schimba starea" on comenzi for update to authenticated
  using (exists (select 1 from personal where user_id = auth.uid()))
  with check (exists (select 1 from personal where user_id = auth.uid()));

-- Vizitatorul trimite comanda doar prin funcția asta, care verifică datele.
create or replace function plaseaza_comanda(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tip text := p->>'tip';
  v_tel text := regexp_replace(coalesce(p->>'telefon', ''), '[^0-9+]', '', 'g');
  v_cod text := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4));
  v_id uuid;
begin
  if v_tip not in ('ridicare', 'livrare', 'masa') then raise exception 'tip invalid'; end if;
  if jsonb_typeof(p->'produse') <> 'array' or jsonb_array_length(p->'produse') not between 1 and 40 then raise exception 'produse invalide'; end if;
  if v_tip <> 'masa' and v_tel !~ '^(\+?40|0)7[0-9]{8}$' then raise exception 'telefon invalid'; end if;
  if v_tip = 'livrare' and length(trim(coalesce(p->>'adresa', ''))) < 5 then raise exception 'adresa lipsa'; end if;
  if (p->>'total')::numeric not between 1 and 5000 then raise exception 'total invalid'; end if;
  -- Frână anti-spam: cel mult 3 comenzi pe același telefon în 10 minute.
  if v_tip <> 'masa' and (select count(*) from comenzi where telefon = v_tel and creat > now() - interval '10 minutes') >= 3 then
    raise exception 'prea multe comenzi';
  end if;
  insert into comenzi (cod, tip, masa, nume, telefon, adresa, observatii, pentru, produse, subtotal, taxa, total)
  values (v_cod, v_tip, left(p->>'masa', 3), left(p->>'nume', 40), v_tel, left(p->>'adresa', 140), left(p->>'observatii', 200),
          left(p->>'pentru', 40), p->'produse', (p->>'subtotal')::numeric, coalesce((p->>'taxa')::numeric, 0), (p->>'total')::numeric)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'cod', v_cod);
end $$;

-- Clientul își vede doar starea comenzii lui (id-ul e lung și greu de ghicit).
create or replace function stare_comanda(p_id uuid) returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object('stare', stare, 'minute', minute) from comenzi where id = p_id and creat > now() - interval '1 day';
$$;

revoke all on function plaseaza_comanda(jsonb) from public;
revoke all on function stare_comanda(uuid) from public;
grant execute on function plaseaza_comanda(jsonb) to anon, authenticated;
grant execute on function stare_comanda(uuid) to anon, authenticated;
