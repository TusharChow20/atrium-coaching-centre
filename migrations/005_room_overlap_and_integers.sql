-- 005: room-overlap protection, integer credit columns, and correct indexing
--
-- These fixes existed as a commented-out block inside 002 and were never
-- actually applied to the database — the exclusion constraint, the integer
-- credit columns, and the supporting indexes all silently never ran.
-- This migration applies them for real, as its own tracked file, without
-- touching 002.

begin;

create extension if not exists btree_gist;

-- --- integers, not numeric(10,2) — the brief requires whole-credit money.
alter table person
  alter column credits type integer using round(credits)::integer;

alter table session
  alter column room_fee_credits type integer using round(room_fee_credits)::integer,
  alter column seat_fee_credits type integer using round(seat_fee_credits)::integer;

alter table enrolment
  alter column credits_charged type integer using round(credits_charged)::integer,
  alter column credits_refunded type integer using round(credits_refunded)::integer;

-- --- Data defect: session 821 is an exact duplicate of session 1
-- (room 12, 2027-02-02 02:00–03:00, identical slot down to the minute).
-- This is what the missing exclusion constraint below was supposed to
-- prevent. Cancelling the duplicate (821) rather than the original (1):
-- session 1 is the lower id and the one the seed data's other tables
-- reference more heavily. Full refund throughout — this was never a
-- legitimate booking a real person cancelled, so none of the tiered
-- refund policies apply; the centre is unwinding its own data error.
update person p
set credits = credits + s.room_fee_credits
from session s
where s.id = 821 and p.id = s.coach_id and s.status = 'scheduled';

update person p
set credits = credits + e.credits_charged
from enrolment e
where e.session_id = 821 and e.status = 'active' and p.id = e.person_id;

update enrolment
set status = 'cancelled',
    credits_refunded = credits_charged,
    cancelled_at = now()
where session_id = 821 and status = 'active';

update session
set status = 'cancelled'
where id = 821 and status = 'scheduled';

-- --- Room-overlap protection at the database level.
alter table session
  add column if not exists during tstzrange
    generated always as (tstzrange(starts_at, ends_at, '[)')) stored;

alter table session
  add constraint session_room_no_overlap
  exclude using gist (room_id with =, during with &&)
  where (status = 'scheduled');

-- --- One active enrolment per person per session, enforced.
create unique index if not exists enrolment_no_duplicate_active
  on enrolment (session_id, person_id)
  where status = 'active';

-- --- Indexing: the original idx_session_created_discipline_status matched
-- nothing our queries actually filter/sort by.
drop index if exists idx_session_created_discipline_status;

create index if not exists idx_session_starts_at_status
  on session (starts_at, status);

create index if not exists idx_session_coach_id
  on session (coach_id) where status = 'scheduled';

create index if not exists idx_enrolment_session_id_status
  on enrolment (session_id, status);

create index if not exists idx_enrolment_person_id_status
  on enrolment (person_id, status);

commit;