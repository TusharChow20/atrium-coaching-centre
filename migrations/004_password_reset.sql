begin;

create table if not exists password_reset_token (
  id            serial primary key,
  person_id     integer not null references person(id),
  token_hash    text not null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  used_at       timestamptz
);

create index if not exists idx_password_reset_token_person
  on password_reset_token (person_id) where used_at is null;

commit;