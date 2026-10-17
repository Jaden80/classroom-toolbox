# 교실 도구함 온라인 배포

## 허브 · 타이머 · PDF

- 주소: https://jaden80.github.io/classroom-toolbox/
- `main`에 push하면 `.github/workflows/pages.yml`이 공개 자원만 `_site/`에 모아 배포합니다.
- 서버 소스·일기·퀴즈 데이터베이스·환경변수는 정적 사이트에 포함하지 않습니다.
- `js/deployments.js`에는 실제 배포를 확인한 공개 URL만 입력합니다. 비밀키를 넣지 않습니다.
- 일기·퀴즈 주소가 아직 설정되지 않으면 준비 중으로 표시합니다.

## 일기장

`cloud-diary/`는 Google 로그인 일기장 준비 작업입니다. Firebase 프로젝트와 저장 지역 선택이 필요하며, 아직 배포가 완료되지 않았습니다. 기존 로컬 일기 데이터는 자동으로 외부에 옮기지 않습니다.

## 퀴즈 레이스 아이디 모드

1. `AUTH_MODE=id`로 실행합니다. 로컬 시험에는 SQLite를, 운영에는 Supabase PostgreSQL을 사용합니다.
2. `/teacher`에서 교사 계정으로 가입하고 로그인합니다. 각 교사는 자신의 문제·수업·학생만 관리합니다.
3. 문제를 등록하고 수업을 열어 6자리 코드를 안내합니다.
4. 학생은 `/join`에서 별명 아이디·비밀번호·담당 교사의 수업 코드로 가입합니다. 가입 후에는 아이디·비밀번호만으로 로그인합니다.
5. 모둠 대표 계정으로 입장해 풉니다. 학습 기록은 대표 계정의 모둠 결과이며 모든 모둠원의 개인 성적을 뜻하지 않습니다.
6. 서버가 수업 종료 시 정답 수·전체 문항 수·응답 수·풀이 시간을 기록합니다. 수업을 닫아 실시간 답안을 삭제해도 `/history`의 기록은 남습니다.
7. 비밀번호 분실 시 담당 교사에게 문의합니다. 교사는 `/students`에서 담당 학생의 비밀번호를 재설정합니다. 기존 로그인과 참여 연결은 무효화됩니다. 교사는 자신의 비밀번호를 별도로 안전하게 보관해야 합니다.

### Supabase · Vercel 준비

- Supabase 전용 프로젝트의 SQL Editor 또는 마이그레이션 도구로 `퀴즈경주/server/supabase-migration.sql`을 적용합니다. `quiz_private`를 Data API 공개 스키마에 추가하지 마세요. 모든 테이블에 RLS와 공개 역할 접근 거절을 적용합니다.
- Vercel Root Directory는 `퀴즈경주`, Node는 24.x입니다. 빌드·경로는 해당 폴더의 `vercel.json`을 사용합니다.
- Vercel 서버 Secret: `DATABASE_URL`(Supabase 트랜잭션 풀러), `RATE_LIMIT_SALT`(32자 이상의 고정 무작위 값). 일반 서버 환경변수: `AUTH_MODE=id`, `NODE_ENV=production`, `APP_ORIGIN=https://실제배포주소`.
- 서버 인증서 체인에 별도 CA가 필요하면 `PGSSL_CA` Secret을 설정합니다. TLS 검증을 끄지 마세요.
- 프런트엔드에는 DB 접속 문자열이나 서비스 키를 전달하지 않습니다. 이 모드는 Supabase를 PostgreSQL 백엔드로 사용하고 계정 인증은 서버가 수행합니다.
- DB 정리 cron을 사용하는 경우 새 마이그레이션의 삭제 전 학습 기록 보관 트리거를 먼저 적용합니다.
- 현재 실제 Supabase 연결, 마이그레이션, Vercel 배포는 미완료입니다. 로컬 테스트 성공을 운영 검증으로 해석하지 마세요.

검증 명령: 루트 `npm test`, 퀴즈 폴더 `npm run check`.
