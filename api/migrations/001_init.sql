CREATE TABLE IF NOT EXISTS users (
  username TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  access SMALLINT NOT NULL CHECK (access IN (1, 2))
);

CREATE TABLE IF NOT EXISTS doctors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  specialty TEXT NOT NULL,
  image TEXT NOT NULL,
  availability TEXT NOT NULL,
  room_no TEXT NOT NULL,
  address TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS patients (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  dob DATE NOT NULL,
  phone TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS slots (
  id BIGSERIAL PRIMARY KEY,
  doctor_id TEXT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  time TEXT NOT NULL,
  is_booked BOOLEAN NOT NULL DEFAULT FALSE,
  is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  blocked_reason TEXT,
  patient_id BIGINT REFERENCES patients(id),
  UNIQUE (doctor_id, date, time)
);

CREATE TABLE IF NOT EXISTS holidays (
  id BIGSERIAL PRIMARY KEY,
  doctor_id TEXT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  holiday_date DATE NOT NULL,
  reason TEXT NOT NULL DEFAULT 'Vacation',
  UNIQUE (doctor_id, holiday_date)
);

CREATE TABLE IF NOT EXISTS transcripts (
  id BIGSERIAL PRIMARY KEY,
  slot_id BIGINT REFERENCES slots(id),
  patient_name TEXT,
  file_name TEXT NOT NULL UNIQUE,
  file_path TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_slots_date_doctor ON slots(date, doctor_id);
CREATE INDEX IF NOT EXISTS idx_holidays_date_doctor ON holidays(holiday_date, doctor_id);
