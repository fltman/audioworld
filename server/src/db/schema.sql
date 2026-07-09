-- AudioWorld schema. Idempotent: safe to run on every boot.
-- gen_random_uuid() is built into Postgres 13+ core; no extension needed.

CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role          text NOT NULL DEFAULT 'basic' CHECK (role IN ('basic','superuser','admin')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS courses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  owner_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audio_points (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id         uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  name              text NOT NULL,
  type              text NOT NULL CHECK (type IN ('static','static_circling','path','follow_user','path_triggered')),
  audio_kind        text NOT NULL CHECK (audio_kind IN ('url','upload')),
  audio_url         text NOT NULL,
  audio_title       text,
  audio_description text,
  audio_tags        text[],
  volume            double precision NOT NULL DEFAULT 1 CHECK (volume >= 0 AND volume <= 1),
  playback          jsonb NOT NULL DEFAULT '{"loop":true,"stopAfter":false,"reload":false}',
  config            jsonb NOT NULL DEFAULT '{}',
  sync              text NOT NULL DEFAULT 'individual' CHECK (sync IN ('individual','global')),
  start_at          timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Sound-library metadata, keyed by on-disk filename. Files remain the source of
-- truth for existence; this table only carries an author-set description.
CREATE TABLE IF NOT EXISTS uploads (
  filename    text PRIMARY KEY,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Migrate existing tables (columns added after the first release).
ALTER TABLE audio_points
  ADD COLUMN IF NOT EXISTS sync text NOT NULL DEFAULT 'individual' CHECK (sync IN ('individual','global')),
  ADD COLUMN IF NOT EXISTS start_at timestamptz;

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS show_start_wayfinding boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS eyes_up boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS zones jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS published jsonb,
  ADD COLUMN IF NOT EXISTS analytics jsonb NOT NULL DEFAULT '{"cells":{},"reached":{},"sessions":0}';

CREATE INDEX IF NOT EXISTS audio_points_course_id_idx ON audio_points(course_id);
CREATE INDEX IF NOT EXISTS courses_owner_id_idx ON courses(owner_id);
