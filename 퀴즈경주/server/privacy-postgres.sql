-- 서버에서 DATABASE_URL로 연결하여 초기 스키마 생성 후 적용할 수 있는 추가 점검/강화 SQL.
-- quiz_private는 Supabase API exposed schemas 목록에 추가하지 않습니다.
REVOKE ALL ON SCHEMA quiz_private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA quiz_private FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA quiz_private REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER TABLE quiz_private.teacher ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_private.teacher_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_private.password_reset ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_private.quiz_set ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_private.question ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_private.room ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_private.room_question ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_private.team ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_private.answer ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_private.request_limit ENABLE ROW LEVEL SECURITY;
-- 의도적으로 공개 접근 정책을 만들지 않습니다. 서버는 소유 DB 역할만 사용합니다.
