create table if not exists public.visa_trending_current (
  id bigint generated always as identity primary key,
  video_id text not null,
  category text not null default 'overall',
  country text not null,
  rank integer not null check (rank > 0),
  source text,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (video_id, category, country)
);

create index if not exists visa_trending_current_video_rank_idx
  on public.visa_trending_current (video_id, category, rank, country);

alter table public.visa_trending_current enable row level security;

drop policy if exists "Public can read visa trending current" on public.visa_trending_current;
create policy "Public can read visa trending current"
  on public.visa_trending_current
  for select
  using (true);
