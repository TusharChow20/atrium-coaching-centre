## 1. Defects found in the starter, and what was wrong

### 1. Passwords were stored and compared as raw SHA-256

- **What was wrong:**
  The starter used SHA-256 directly for passwords. The `hashPassword()` function in `auth.ts` used `crypto.createHash('sha256')` without a salt. The login function then compared the hashes directly. SHA-256 is very fast to brute-force and does not provide a unique salt for each user. The existing seed data also used this old hashing method.

- **What I changed:**
  I switched to `bcrypt` with a cost factor of 12 for all new and updated passwords. I also added a legacy password migration inside `verifyPassword()`. If an existing password is still stored using the old SHA-256 format, it is checked once during login. If the password is correct, it is automatically rehashed using bcrypt and saved. This means existing users can be migrated to the new, safer password system when they log in, without requiring a password reset for everyone.

### 2. `GET /api/people` had no role check

- **What was wrong:**
  The route only checked whether the user was logged in using `requireSession`. It did not check the user's role. This meant that any logged in participant or coach could access the endpoint and potentially see information about every person in the system, including email addresses and credit balances.

- **What I changed:**
  I added `requireRole('admin')` to the route. Now only administrators can access the list of people.

### 3. `POST /api/sessions/:id/cancel` had no role check

- **What was wrong:**
  The endpoint only required a valid session. Any authenticated participant could potentially cancel any coach's session. This could also trigger refunds for all participants enrolled in that session.

- **What I changed:**
  I added `requireRole('coach', 'admin')`. Coaches can only cancel their own sessions, while administrators can cancel any session.

### 4. `GET /api/sessions/:id` exposed attendee information

- **What was wrong:**
  Any logged-in user could see the full attendee list of a session, including names and email addresses. A participant could therefore see information about other people who were attending a session they were not responsible for.

- **What I changed:**
  I changed the endpoint based on the caller's identity and role.
  - Admins can see the full attendee list.
  - A participant can only see their own enrolment information.
  - Anonymous users can see session information but no attendee information.

### 5. There was no participant-level booking or cancellation endpoint

- **What was wrong:**
  The starter only supported cancelling an entire session by a coach or administrator. There was no way for a participant to book a single seat or cancel their own booking.

- **What I changed:**
  I added a dedicated `enrolments` router with endpoints for:
  - Viewing the participant's own enrolments.
  - Booking a session.
  - Cancelling their own booking.

  Ownership is also checked in the SQL query, rather than relying only on the frontend.

### 6. Room double-booking used the wrong interval logic

- **What was wrong:**
  The starter used:

  `starts_at <= $to AND ends_at >= $from`

  This treats sessions that touch at exactly the same time as overlapping. For example, a session ending at 10:00 and another starting at 10:00 should be allowed because the intervals are half-open.

- **What I changed:**
  I changed the conflict check to:

  `starts_at < $to AND ends_at > $from`

  This logic is now used for session creation, rescheduling, and coach conflict checks.

  I also added a database-level exclusion constraint so that the rule is enforced even if application code is bypassed.

### 7. Concurrent bookings could overfill a room

- **What was wrong:**
  The starter checked the number of bookings with a normal `SELECT count(*)` before inserting a new booking.

  If two users booked at the same time, both requests could see the same number of available seats and both could succeed, causing the room to be overbooked.

- **What I changed:**
  Booking, cancellation, and other session-related mutations now run inside `withSerializableTransaction`. The transaction uses `SERIALIZABLE` isolation and retries when PostgreSQL reports a serialization or deadlock error. This prevents two concurrent bookings from incorrectly exceeding the room capacity.

### 8. Credits allowed fractional values

- **What was wrong:**
  Credit-related fields were stored as `numeric(10,2)`. The requirements specify that credits should be whole numbers, but the database allowed values such as `1170.50`.

- **What I changed:**
  Migration `002` changes the credit-related columns to `integer`. I also corrected inconsistent seed data where some session fees did not match the defined fee schedule.

### 9. Duplicate active enrolments were possible

- **What was wrong:**
  There was no database constraint preventing the same participant from being added to the same session more than once. This could become especially problematic when two booking requests happened at the same time.

- **What I changed:**
  I added a partial unique index called `enrolment_no_duplicate_active`. It prevents the same person from having multiple active enrolments for the same session.

### 10. `seed-test-passwords.mjs` was missing the SQL parameter

- **What was wrong:**
  The script used `$1` in the SQL query but did not pass the parameter value to PostgreSQL. As a result, the script failed with a `there is no parameter $1` error.

- **What I changed:**
  I added the missing `[hash]` parameter to the query call.

### 11. The existing index did not match the actual queries

- **What was wrong:**
  The starter had an index on `(created_at, discipline, status)`, but the session queries mainly filter using `starts_at` and `status`. Because `created_at` was the first column, the index did not match the actual query pattern well.

- **What I changed:**
  I removed the unused index and added indexes based on the queries the application actually performs.

  These include indexes for:
  - Session start time and status.
  - Scheduled sessions by coach.
  - Enrolments by session and status.
  - Enrolments by person and status.

### Additional issues found during live testing

### 12. The AI assistant had no reliable "today" date

- **What was wrong:**
  The assistant was asked to understand relative dates such as "today", "this week", and "upcoming", but the system prompt did not tell it what the current date was. This could cause incorrect date ranges to be sent to `search_sessions`.

- **What I changed:**
  I added the current date and time to the assistant's system prompt.
