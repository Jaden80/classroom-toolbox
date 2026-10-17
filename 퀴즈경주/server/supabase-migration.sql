BEGIN;
CREATE SCHEMA IF NOT EXISTS quiz_private;
SET LOCAL search_path TO quiz_private;
CREATE TABLE IF NOT EXISTS teacher (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT, created_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS teacher_session (token_hash TEXT PRIMARY KEY, teacher_id TEXT NOT NULL REFERENCES teacher(id) ON DELETE CASCADE, expires_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS password_reset (token_hash TEXT PRIMARY KEY, teacher_id TEXT NOT NULL REFERENCES teacher(id) ON DELETE CASCADE, expires_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS quiz_set (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES teacher(id) ON DELETE CASCADE, title TEXT NOT NULL, created_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS question (set_id TEXT NOT NULL REFERENCES quiz_set(id) ON DELETE CASCADE, ordinal INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY(set_id,ordinal));
CREATE TABLE IF NOT EXISTS room (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL UNIQUE REFERENCES teacher(id) ON DELETE CASCADE, set_id TEXT NOT NULL REFERENCES quiz_set(id), title TEXT NOT NULL, code TEXT NOT NULL UNIQUE, state TEXT NOT NULL CHECK(state IN ('waiting','running','results')), created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL, started_at BIGINT, ended_at BIGINT);
CREATE TABLE IF NOT EXISTS room_question (room_id TEXT NOT NULL REFERENCES room(id) ON DELETE CASCADE, ordinal INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY(room_id,ordinal));
CREATE TABLE IF NOT EXISTS team (id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES room(id) ON DELETE CASCADE, name TEXT NOT NULL, lane INTEGER NOT NULL CHECK(lane BETWEEN 1 AND 6), token_hash TEXT UNIQUE NOT NULL, next_ordinal INTEGER NOT NULL DEFAULT 1, feedback_ordinal INTEGER, finished_at BIGINT, UNIQUE(room_id,name), UNIQUE(room_id,lane));
CREATE TABLE IF NOT EXISTS answer (team_id TEXT NOT NULL REFERENCES team(id) ON DELETE CASCADE, ordinal INTEGER NOT NULL, request_id TEXT NOT NULL, choice TEXT NOT NULL, correct INTEGER NOT NULL CHECK(correct IN (0,1)), accepted_at BIGINT NOT NULL, PRIMARY KEY(team_id,ordinal), UNIQUE(team_id,request_id));
CREATE TABLE IF NOT EXISTS request_limit (bucket TEXT PRIMARY KEY, hits INTEGER NOT NULL, expires_at BIGINT NOT NULL);
CREATE INDEX IF NOT EXISTS room_expiry ON room(expires_at);
CREATE INDEX IF NOT EXISTS team_room ON team(room_id);
CREATE TABLE IF NOT EXISTS account (id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('teacher','student')),teacher_id TEXT NOT NULL REFERENCES teacher(id) ON DELETE CASCADE,created_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS account_session (token_hash TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,expires_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS student_team (account_id TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,team_id TEXT UNIQUE NOT NULL REFERENCES team(id) ON DELETE CASCADE,room_id TEXT NOT NULL REFERENCES room(id) ON DELETE CASCADE,PRIMARY KEY(account_id,room_id));
CREATE TABLE IF NOT EXISTS learning_record (id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,room_id TEXT NOT NULL,title TEXT NOT NULL,team_name TEXT NOT NULL,score INTEGER NOT NULL,total INTEGER NOT NULL,answered INTEGER NOT NULL,elapsed_ms BIGINT NOT NULL,finished_at BIGINT NOT NULL,UNIQUE(account_id,room_id));
CREATE INDEX IF NOT EXISTS record_account ON learning_record(account_id,finished_at);

REVOKE ALL ON SCHEMA quiz_private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA quiz_private FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA quiz_private REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER TABLE teacher ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_set ENABLE ROW LEVEL SECURITY;
ALTER TABLE question ENABLE ROW LEVEL SECURITY;
ALTER TABLE room ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_question ENABLE ROW LEVEL SECURITY;
ALTER TABLE team ENABLE ROW LEVEL SECURITY;
ALTER TABLE answer ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_limit ENABLE ROW LEVEL SECURITY;
ALTER TABLE account ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_team ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_record ENABLE ROW LEVEL SECURITY;
-- Keep durable results even when DB cron removes an expired classroom while
-- Vercel is asleep. This function is private and uses the caller's privileges.
CREATE OR REPLACE FUNCTION quiz_private.archive_room_learning() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, quiz_private AS $archive$
BEGIN
  IF OLD.started_at IS NOT NULL THEN
    INSERT INTO quiz_private.learning_record
      (id,account_id,room_id,title,team_name,score,total,answered,elapsed_ms,finished_at)
    SELECT gen_random_uuid()::text,m.account_id,OLD.id,OLD.title,t.name,
      COALESCE(SUM(a.correct),0)::integer,
      (SELECT COUNT(*)::integer FROM quiz_private.room_question WHERE room_id=OLD.id),
      COUNT(a.ordinal)::integer,
      GREATEST(0,COALESCE(t.finished_at,OLD.ended_at,LEAST(OLD.expires_at,(extract(epoch from now())*1000)::bigint))-OLD.started_at),
      COALESCE(OLD.ended_at,LEAST(OLD.expires_at,(extract(epoch from now())*1000)::bigint))
    FROM quiz_private.team t JOIN quiz_private.student_team m ON m.team_id=t.id
    LEFT JOIN quiz_private.answer a ON a.team_id=t.id
    WHERE t.room_id=OLD.id GROUP BY m.account_id,t.id,t.name,t.finished_at
    ON CONFLICT(account_id,room_id) DO NOTHING;
  END IF;
  RETURN OLD;
END;
$archive$;
REVOKE ALL ON FUNCTION quiz_private.archive_room_learning() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS archive_room_before_delete ON quiz_private.room;
CREATE TRIGGER archive_room_before_delete BEFORE DELETE ON quiz_private.room
FOR EACH ROW EXECUTE FUNCTION quiz_private.archive_room_learning();
COMMIT;
