-- Supabase SQL Editor에서 스키마 생성 후 1회 적용.
-- 앱 호스트가 휴면이어도 DB가 실행 중이면 5분마다 정리합니다.
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('quiz-race-expiry', '*/5 * * * *', $job$
  DELETE FROM quiz_private.room WHERE expires_at <= floor(extract(epoch from now()) * 1000)::bigint;
  DELETE FROM quiz_private.teacher_session WHERE expires_at <= floor(extract(epoch from now()) * 1000)::bigint;
  DELETE FROM quiz_private.password_reset WHERE expires_at <= floor(extract(epoch from now()) * 1000)::bigint;
  DELETE FROM quiz_private.request_limit WHERE expires_at <= floor(extract(epoch from now()) * 1000)::bigint;
$job$);
-- 점검: SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'quiz-race-expiry';
-- 실행 이력: SELECT status, return_message FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;
-- 제공 DB 자체의 휴면/장애 중에는 물리 삭제 시각을 보장하지 않습니다.
