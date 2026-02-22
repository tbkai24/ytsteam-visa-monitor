alter table public.visa_trending_current
  add column if not exists category text not null default 'overall';

drop index if exists visa_trending_current_video_rank_idx;
create index if not exists visa_trending_current_video_rank_idx
  on public.visa_trending_current (video_id, category, rank, country);

alter table public.visa_trending_current
  drop constraint if exists visa_trending_current_video_id_country_key;

alter table public.visa_trending_current
  add constraint visa_trending_current_video_category_country_key
  unique (video_id, category, country);
