-- =============================================================================
-- SALES TRAINING OPS DASHBOARD — Supabase / Postgres schema
-- Run in Supabase SQL Editor (or psql). Idempotent.
-- =============================================================================

create extension if not exists "pgcrypto";

-- ─── Lookups ────────────────────────────────────────────────────────────────
create table if not exists reporting_managers (
  id    serial primary key,
  name  text unique not null,
  zone  text,
  email text
);

create table if not exists trainers (
  id             serial primary key,
  name           text unique not null,
  specialization text,
  email          text
);

-- ─── Master roster ──────────────────────────────────────────────────────────
create table if not exists employees (
  id                uuid primary key default gen_random_uuid(),
  email             text unique not null,
  name              text not null,
  batch             int  not null check (batch between 1 and 5),
  zone              text not null,
  area              text not null,
  role              text not null check (role in ('ZM','BDM','BDA','Exit')),
  reporting_manager text,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists employees_batch_idx on employees(batch);
create index if not exists employees_rm_idx on employees(reporting_manager);

-- ─── Sessions ───────────────────────────────────────────────────────────────
create table if not exists sessions (
  id             serial primary key,
  session_code   text unique not null,                -- "Basics 1", "Deep Dive 3"
  topic          text not null,
  session_number int  not null,                       -- 1..14
  session_type   text check (session_type in ('Basics','Deep Dive','Ceremony')),
  created_at     timestamptz not null default now()
);

create table if not exists batch_sessions (
  id             serial primary key,
  session_id     int  not null references sessions(id) on delete cascade,
  batch          int  not null check (batch between 1 and 5),
  scheduled_date date,
  trainer_name   text,
  time_slot      text,
  status         text not null default 'scheduled'
                  check (status in ('scheduled','completed','cancelled','rescheduled')),
  recording_url  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (session_id, batch)
);
create index if not exists batch_sessions_batch_idx on batch_sessions(batch);
create index if not exists batch_sessions_date_idx  on batch_sessions(scheduled_date);

-- ─── Attendance ─────────────────────────────────────────────────────────────
create table if not exists attendance (
  id                       serial primary key,
  employee_id              uuid not null references employees(id) on delete cascade,
  session_id               int  not null references sessions(id) on delete cascade,
  batch                    int  not null,
  status                   text check (status in ('present','absent','rescheduled','excused')),
  rescheduled_to_batch     int,
  rescheduled_session_date date,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (employee_id, session_id)
);
create index if not exists attendance_session_idx on attendance(session_id);
create index if not exists attendance_employee_idx on attendance(employee_id);

-- ─── Assessments ────────────────────────────────────────────────────────────
-- NULL score = not assessed.  0 = assessed and scored zero.
create table if not exists assessments (
  id                      serial primary key,
  employee_id             uuid not null references employees(id) on delete cascade,
  session_id              int  not null references sessions(id) on delete cascade,
  competency              text not null,
  score                   numeric(3,1) check (score is null or (score >= 0 and score <= 10)),
  score_band              text generated always as (
    case
      when score is null            then null
      when score between 0 and 2    then 'bad'
      when score between 3 and 5    then 'average'
      when score between 6 and 7    then 'good'
      when score between 8 and 10   then 'perfect'
    end
  ) stored,
  is_reassessment         boolean not null default false,
  original_assessment_id  int references assessments(id) on delete set null,
  created_at              timestamptz not null default now(),
  unique (employee_id, session_id, competency, is_reassessment)
);
create index if not exists assessments_band_idx on assessments(score_band);

-- ─── Session quality (recordings analysis — Phase 7) ────────────────────────
create table if not exists session_quality (
  id                    serial primary key,
  batch_session_id      int references batch_sessions(id) on delete cascade,
  overall_sentiment     text check (overall_sentiment in ('positive','neutral','negative')),
  engagement_score      numeric(3,1),
  trainer_rating        numeric(3,1),
  key_topics_discussed  jsonb,
  pain_points           jsonb,
  source                text check (source in ('fireflies','whisper_analysis','manual')),
  analyzed_at           timestamptz,
  created_at            timestamptz not null default now()
);

-- =============================================================================
-- VIEWS — every view answers "what should I do next?"
-- =============================================================================

create or replace view v_employee_training_summary as
with att as (
  select
    a.employee_id,
    count(*) filter (where a.status = 'present')                          as sessions_attended,
    count(*) filter (where a.status in ('present','absent','rescheduled','excused')) as sessions_held,
    count(*) filter (where a.status = 'absent')                           as sessions_missed
  from attendance a
  group by a.employee_id
),
asm as (
  select
    s.employee_id,
    round(avg(s.score)::numeric, 1)                                       as avg_score,
    count(*) filter (where s.score_band = 'bad')                          as bad_count,
    count(*) filter (where s.score_band = 'perfect')                      as perfect_count,
    count(*) filter (where s.score is not null)                           as assessed_count
  from assessments s
  where s.is_reassessment = false
  group by s.employee_id
)
select
  e.id                       as employee_id,
  e.name,
  e.email,
  e.batch,
  e.zone,
  e.area,
  e.role,
  e.reporting_manager,
  e.is_active,
  coalesce(att.sessions_attended, 0)                                       as sessions_attended,
  coalesce(att.sessions_held, 0)                                           as sessions_held,
  coalesce(att.sessions_missed, 0)                                         as sessions_missed,
  case when coalesce(att.sessions_held,0) = 0 then null
       else round(att.sessions_attended::numeric / att.sessions_held * 100, 1)
  end                                                                      as attendance_pct,
  asm.avg_score,
  coalesce(asm.bad_count, 0)                                               as bad_band_count,
  coalesce(asm.perfect_count, 0)                                           as perfect_band_count,
  case
    when asm.avg_score is null              then null
    when asm.avg_score between 0 and 2      then 'bad'
    when asm.avg_score between 3 and 5      then 'average'
    when asm.avg_score between 6 and 7      then 'good'
    when asm.avg_score between 8 and 10     then 'perfect'
  end                                                                      as overall_band
from employees e
left join att on att.employee_id = e.id
left join asm on asm.employee_id = e.id;

create or replace view v_manager_dashboard as
select
  coalesce(nullif(trim(e.reporting_manager), ''), 'UNASSIGNED — Batch ' || e.batch) as reporting_manager,
  count(*)                                                                  as team_size,
  round(avg(v.attendance_pct), 1)                                           as avg_attendance_pct,
  round(avg(v.avg_score), 1)                                                as avg_assessment_score,
  count(*) filter (where v.bad_band_count > 0)                              as employees_at_risk,
  count(*) filter (where v.sessions_missed >= 2)                            as employees_missed_2plus,
  count(*) filter (where v.attendance_pct = 100)                            as employees_perfect_attendance
from employees e
left join v_employee_training_summary v on v.employee_id = e.id
where e.is_active
group by 1
order by avg_attendance_pct nulls last;

create or replace view v_trainer_utilization as
with delivered as (
  select trim(initcap(trainer_name)) as trainer_name,
         count(*) as sessions_delivered,
         count(distinct batch) as batches_covered
  from batch_sessions
  where status = 'completed'
    and trainer_name is not null and trim(trainer_name) <> ''
  group by 1
),
assigned as (
  select trim(initcap(trainer_name)) as trainer_name,
         count(*) as sessions_assigned
  from batch_sessions
  where trainer_name is not null and trim(trainer_name) <> ''
  group by 1
)
select
  coalesce(d.trainer_name, a.trainer_name)                                  as trainer_name,
  coalesce(a.sessions_assigned, 0)                                          as sessions_assigned,
  coalesce(d.sessions_delivered, 0)                                         as sessions_delivered,
  coalesce(d.batches_covered, 0)                                            as batches_covered,
  coalesce(d.sessions_delivered, 0) * 2                                     as hours_delivered,
  case when coalesce(a.sessions_assigned, 0) = 0 then 0
       else round(coalesce(d.sessions_delivered, 0)::numeric
                  / a.sessions_assigned * 100, 1)
  end                                                                       as utilization_pct
from delivered d
full outer join assigned a on a.trainer_name = d.trainer_name
order by utilization_pct desc nulls last;

create or replace view v_attendance_matrix as
select
  e.id        as employee_id,
  e.name,
  e.batch,
  e.reporting_manager,
  s.id        as session_id,
  s.session_number,
  s.session_code,
  a.status,
  a.rescheduled_to_batch
from employees e
cross join sessions s
left join attendance a
       on a.employee_id = e.id and a.session_id = s.id;

create or replace view v_retraining_tracker as
select
  e.id              as employee_id,
  e.name,
  e.batch           as home_batch,
  e.reporting_manager,
  s.session_code,
  s.session_number,
  a.status,
  a.rescheduled_to_batch,
  a.rescheduled_session_date,
  case
    when a.status = 'absent' and a.rescheduled_to_batch is null then 'NEEDS_SCHEDULING'
    when a.status = 'absent' and a.rescheduled_to_batch is not null
         and a.rescheduled_session_date >= current_date then 'SCHEDULED'
    when a.status = 'rescheduled' then 'COMPLETED'
    when a.status = 'absent' and a.rescheduled_session_date < current_date then 'OVERDUE'
    else 'OK'
  end as retraining_state
from attendance a
join employees e on e.id = a.employee_id
join sessions  s on s.id = a.session_id
where a.status in ('absent','rescheduled');

create or replace view v_assessment_gaps as
select
  s.competency,
  count(*) filter (where s.score_band = 'bad')          as bad_count,
  count(*) filter (where s.score_band = 'average')      as average_count,
  count(*) filter (where s.score_band = 'good')         as good_count,
  count(*) filter (where s.score_band = 'perfect')      as perfect_count,
  count(*) filter (where s.score is not null)           as assessed_count,
  round(avg(s.score)::numeric, 2)                       as avg_score
from assessments s
where s.is_reassessment = false
group by s.competency
order by avg_score asc nulls last;

-- =============================================================================
-- Seed the 10 known competencies + 14 session shells (idempotent)
-- =============================================================================
insert into sessions (session_code, topic, session_number, session_type) values
 ('Basics 1',       'Orientation & Sales Basics / Buyer Psychology & School Decision Journey', 1,  'Basics'),
 ('Basics 2',       'Advance Sales Skills / Territory Mapping',                                 2,  'Basics'),
 ('Deep Dive 3',    'Our SKUs and their Differentiating Factors',                               3,  'Deep Dive'),
 ('Deep Dive 4',    'QBG & Digital Platform Training and Demo',                                 4,  'Deep Dive'),
 ('Deep Dive 5',    'DEMO — QBG / Digital Platform and Components Clarity',                     5,  'Deep Dive'),
 ('Deep Dive 6',    'Step-by-Step Series — ECCE',                                               6,  'Deep Dive'),
 ('Deep Dive 7',    'Semester Series Part 2 (Golden Rules)',                                    7,  'Deep Dive'),
 ('Deep Dive 8',    'Sapphire Series — Science / EVS',                                          8,  'Deep Dive'),
 ('Deep Dive 9',    'Sapphire Series — Maths',                                                  9,  'Deep Dive'),
 ('Deep Dive 10',   'Sapphire Series — English Literature / Grammar',                          10,  'Deep Dive'),
 ('Deep Dive 11',   'Sapphire Series — SST / GK',                                              11,  'Deep Dive'),
 ('Deep Dive 12',   'Sapphire Series — CS / AI',                                               12,  'Deep Dive'),
 ('Deep Dive 13',   'Sapphire Series — Hindi Literature / Grammar',                            13,  'Deep Dive'),
 ('Deep Dive 14',   'Award Ceremony / Certification / Award Declaration Day',                  14,  'Ceremony')
on conflict (session_code) do nothing;

-- =============================================================================
-- Row Level Security (open by default for Phase 1; lock down in Phase 8)
-- =============================================================================
alter table employees       enable row level security;
alter table sessions        enable row level security;
alter table batch_sessions  enable row level security;
alter table attendance      enable row level security;
alter table assessments     enable row level security;
alter table session_quality enable row level security;
alter table trainers        enable row level security;
alter table reporting_managers enable row level security;

-- Allow anon read for dashboard (Phase 1). Writes happen only via service-role.
do $$
declare
  t text;
begin
  foreach t in array array[
    'employees','sessions','batch_sessions','attendance',
    'assessments','session_quality','trainers','reporting_managers'
  ] loop
    execute format('drop policy if exists "read_all_%1$s" on %1$I',  t, t);
    execute format('create policy "read_all_%1$s" on %1$I for select using (true)', t, t);
  end loop;
end $$;
