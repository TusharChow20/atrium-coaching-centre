
-- fixes there had fructuation in values we need integeer


begin;

create extension if not exists btree_gist;

-- --- fee-schedule data defects, corrected (not just rounded.........)
update session set room_fee_credits = 30, seat_fee_credits = 15
  where session_type = 'short' and (room_fee_credits <> 30 or seat_fee_credits <> 15);

update session set room_fee_credits = 40, seat_fee_credits = 20
  where session_type = 'standard' and (room_fee_credits <> 40 or seat_fee_credits <> 20);

update session set room_fee_credits = 120, seat_fee_credits = 60
  where session_type = 'intensive' and (room_fee_credits <> 120 or seat_fee_credits <> 60);

update enrolment e
   set credits_charged = s.seat_fee_credits
  from session s
 where e.session_id = s.id
   and e.status = 'active'
   and e.credits_charged <> s.seat_fee_credits;

-- --- integers, not numeric(10,2) needed to chnage it
alter table person
  alter column credits type integer using round(credits)::integer;

alter table session
  alter column room_fee_credits type integer using round(room_fee_credits)::integer,
  alter column seat_fee_credits type integer using round(seat_fee_credits)::integer;

alter table enrolment
  alter column credits_charged type integer using round(credits_charged)::integer,
  alter column credits_refunded type integer using round(credits_refunded)::integer;

alter table session
  add column if not exists during tstzrange
    generated always as (tstzrange(starts_at, ends_at, '[)')) stored;

alter table session
  add constraint session_room_no_overlap
  exclude using gist (room_id with =, during with &&)
  where (status = 'scheduled');

create unique index if not exists enrolment_no_duplicate_active
  on enrolment (session_id, person_id)
  where status = 'active';

drop index if exists idx_session_created_discipline_status;

create index idx_session_starts_at_status on session (starts_at, status);
create index idx_session_coach_id on session (coach_id) where status = 'scheduled';
create index idx_enrolment_session_id_status on enrolment (session_id, status);
create index idx_enrolment_person_id_status on enrolment (person_id, status);

commit;