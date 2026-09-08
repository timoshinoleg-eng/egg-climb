-- 0001_leaderboard.sql — Daily Tower contract foundation
-- Target: PostgreSQL 15+. No provider is provisioned by this migration.

begin;

create table if not exists players (
  id                  bigint generated always as identity primary key,
  max_user_id         text not null unique,
  public_display_name text null,
  created_at          timestamptz not null default now(),
  last_seen_at        timestamptz not null default now(),
  check (max_user_id ~ '^(0|[1-9][0-9]*)$' and char_length(max_user_id) <= 19),
  check (public_display_name is null or char_length(public_display_name) between 1 and 64)
);

-- One immutable published Daily per canonical UTC date. seed is provenance;
-- canonical_level + hashes are the source of truth for competitive identity.
create table if not exists daily_towers (
  id                   bigint generated always as identity primary key,
  tower_date           date not null unique,
  level_id             text not null,
  level_version        integer not null check (level_version > 0),
  seed                 bigint not null,
  generator_version    integer not null check (generator_version > 0),
  level_format_version integer not null check (level_format_version > 0),
  level_hash           text not null check (level_hash ~ '^[0-9a-f]{64}$'),
  ruleset_hash         text not null check (ruleset_hash ~ '^[0-9a-f]{64}$'),
  canonical_level      text not null check (octet_length(canonical_level) between 2 and 262144),
  created_at           timestamptz not null default now()
);

create or replace function reject_daily_tower_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'published daily_towers rows are immutable';
end;
$$;

drop trigger if exists daily_towers_immutable on daily_towers;
create trigger daily_towers_immutable
before update or delete on daily_towers
for each row execute function reject_daily_tower_mutation();

-- Accepted attempts only. Every score field below is server-derived from the
-- authoritative replay. replay_canonical is the exact text hashed by replay_sha256.
create table if not exists runs (
  id                       bigint generated always as identity primary key,
  player_id                bigint not null references players (id) on delete restrict,
  daily_tower_id           bigint not null references daily_towers (id) on delete restrict,
  max_height_mm            bigint not null,
  first_tick_at_max_height integer not null check (first_tick_at_max_height > 0),
  completed                boolean not null default false,
  completion_tick          integer null,
  replay_finish_tick       integer not null check (replay_finish_tick > 0),
  fingerprint              text not null check (fingerprint ~ '^[0-9a-f]{8}$'),
  -- Worst-case admitted replay: 10_000 move events x <=105 bytes (25-char
  -- doubles, 5-digit tick, 2-digit seq, comma) + ~800-byte header < 1.01 MiB.
  -- 2 MiB leaves ~2x headroom over the admission-limits maximum.
  replay_canonical         text not null check (octet_length(replay_canonical) between 2 and 2097152),
  replay_sha256            text not null check (replay_sha256 ~ '^[0-9a-f]{64}$'),
  client_platform          text not null default 'unknown',
  created_at               timestamptz not null default now(),
  check (first_tick_at_max_height <= replay_finish_tick),
  check (
    (completed and completion_tick is not null and completion_tick > 0 and completion_tick <= replay_finish_tick)
    or (not completed and completion_tick is null)
  ),
  -- Accepted-attempt uniqueness, not global replay uniqueness and not HTTP idempotency.
  unique (player_id, daily_tower_id, replay_sha256)
);

create index if not exists runs_player_idx on runs (player_id);
create index if not exists runs_completed_rank_idx
  on runs (daily_tower_id, completion_tick asc, id asc)
  where completed;
create index if not exists runs_incomplete_rank_idx
  on runs (daily_tower_id, max_height_mm desc, first_tick_at_max_height asc, id asc)
  where not completed;

-- Best accepted attempt per player per Daily, then deterministic global rank.
-- Completed beats incomplete. Completed: completion tick asc. Incomplete:
-- height desc, first tick at that height asc. run_id is the final stable tie-breaker.
create or replace view daily_leaderboard as
with per_player as (
  select
    r.*,
    row_number() over (
      partition by r.daily_tower_id, r.player_id
      order by
        r.completed desc,
        case when r.completed then r.completion_tick end asc nulls last,
        case when not r.completed then r.max_height_mm end desc nulls last,
        case when not r.completed then r.first_tick_at_max_height end asc nulls last,
        r.id asc
    ) as player_attempt_rank
  from runs r
), best as (
  select * from per_player where player_attempt_rank = 1
)
select
  dt.tower_date,
  b.daily_tower_id,
  row_number() over (
    partition by b.daily_tower_id
    order by
      b.completed desc,
      case when b.completed then b.completion_tick end asc nulls last,
      case when not b.completed then b.max_height_mm end desc nulls last,
      case when not b.completed then b.first_tick_at_max_height end asc nulls last,
      b.id asc
  ) as rank,
  b.id as run_id,
  b.player_id,
  coalesce(p.public_display_name, 'Egg') as display_name,
  b.max_height_mm,
  b.first_tick_at_max_height,
  b.completed,
  b.completion_tick,
  b.replay_finish_tick,
  b.fingerprint,
  b.created_at
from best b
join players p on p.id = b.player_id
join daily_towers dt on dt.id = b.daily_tower_id;

commit;
