
begin;

alter table person
  add constraint person_email_unique unique (email);

alter table person
  add constraint person_kind_check check (kind in ('admin', 'coach', 'participant'));

alter table session
  add constraint session_type_check check (session_type in ('short', 'standard', 'intensive'));

alter table session
  add constraint session_status_check check (status in ('scheduled', 'cancelled', 'completed'));

alter table enrolment
  add constraint enrolment_status_check check (status in ('active', 'cancelled'));

commit;