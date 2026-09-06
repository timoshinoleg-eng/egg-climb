-- 0001_leaderboard.sql — Egg Climb Daily Tower leaderboard
-- Target: Postgres 15+ (Neon recommended; Supabase-compatible).
-- Idempotent: safe to re-run.

begin;

-- Игроки. Храним только идентификатор MAX и отображаемое имя —
-- initData и прочие запускные данные не сохраняем (privacy by design).
create table if not exists players (
  id            bigint generated always as identity primary key,
  max_user_id   text not null unique,        -- id из валидированного MAX initData; text, т.к. id может не помещаться в JS number
  display_name  text not null default 'Игрок',
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

-- Дневные вышки: одна запись на день, детерминированный сид уровня.
-- Сид + версия генератора позволяют серверу пересоздать уровень и
-- перепрогнать реплей при приёмке результата.
create table if not exists daily_towers (
  tower_date    date primary key,            -- день вышки (UTC)
  seed          bigint not null,
  level_version integer not null,
  created_at    timestamptz not null default now(),
  unique (seed, level_version)
);

-- Принятые прогоны. Высота и fingerprint вычисляются СЕРВЕРОМ при
-- перепрогоне реплея, клиентские значения не доверяются.
create table if not exists runs (
  id              bigint generated always as identity primary key,
  player_id       bigint not null references players (id),
  tower_date      date not null references daily_towers (tower_date),
  max_height_m    numeric(10, 2) not null check (max_height_m >= 0),
  finish_tick     integer not null check (finish_tick > 0),
  fingerprint     text not null,             -- отпечаток мира после серверного перепрогона
  replay          jsonb not null,            -- полный реплей: повторная проверка и будущие «призраки»
  replay_sha256   text not null,             -- хеш содержимого реплея (НЕ глобальный ключ идемпотентности)
  client_platform text not null default 'unknown',
  created_at      timestamptz not null default now(),
  -- Идемпотентность per-игрок-per-вышка. Глобальный UNIQUE по replay_sha256
  -- неправилен: детерминированная симуляция делает одинаковые реплеи у
  -- разных игроков легальными (одинаковый ввод → одинаковый реплей).
  unique (player_id, tower_date, replay_sha256)
);

create index if not exists runs_tower_date_height_idx on runs (tower_date, max_height_m desc);
create index if not exists runs_player_idx on runs (player_id);

-- Лучший прогон каждого игрока за вышку: выше → лучше; при равенстве — быстрее (меньше тиков).
create or replace view daily_leaderboard as
select distinct on (r.tower_date, r.player_id)
  r.tower_date,
  r.player_id,
  p.display_name,
  r.max_height_m,
  r.finish_tick,
  r.created_at
from runs r
join players p on p.id = r.player_id
order by r.tower_date, r.player_id, r.max_height_m desc, r.finish_tick asc;

-- Типовой запрос таблицы дня:
--   select row_number() over (order by max_height_m desc, finish_tick asc) as rank,
--          display_name, max_height_m, finish_tick
--   from daily_leaderboard
--   where tower_date = $1
--   order by rank
--   limit 50;

commit;
