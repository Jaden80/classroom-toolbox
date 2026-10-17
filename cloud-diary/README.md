# 하루의 조각 · Google 로그인 일기장

배포 주소: https://classroom-diary-jaden80.web.app/

Firebase Authentication의 Google 로그인과 서울(`asia-northeast3`) Standard Firestore를 사용합니다. 유료 요금제를 활성화하지 않았습니다. 각 계정은 `users/{uid}/entries`의 자기 일기만 읽고 쓸 수 있습니다. 일기 원문은 브라우저 디스크 캐시에 영구 저장하지 않으며, 로그인은 현재 브라우저 세션 동안 유지됩니다. 공용 기기에서는 로그아웃하세요.

일기 작성·수정·삭제, 날짜·기분 저장과 최근 200개 기록의 제목·본문 검색을 제공합니다. 기존 로컬 SQLite 일기는 자동 이전하지 않습니다. 계정 간 공유·교사 열람·종단간 암호화는 제공하지 않습니다. Google 계정과 Firebase 프로젝트 관리 권한을 안전하게 관리하세요.

## 빌드와 배포

Node.js 24 이상에서 이 폴더의 `npm ci`, `npm run build`를 실행한 뒤 다음 명령으로 배포합니다.

```powershell
npx -y firebase-tools@latest deploy --only firestore,hosting --project classroom-diary-jaden80
```

Google 로그인 제공자와 OAuth 클라이언트는 해당 Firebase 프로젝트에 이미 설정했습니다. 저장소에는 관리자의 실제 이메일이나 운영 로그인 자격정보를 넣지 않습니다. `/__/firebase/init.json`의 Firebase 웹 설정은 공개 클라이언트 설정이며, 데이터 권한은 Firestore 규칙에서 검사합니다.

## 검증

```powershell
npx -y firebase-tools@latest emulators:exec --only firestore --project demo-classroom-diary "node rules.test.mjs"
```

소유자 CRUD, 익명·다른 사용자 차단, 필드 추가·길이 제한, 생성 시각 변경 차단, Google 계정 제한, 목록 조회 크기 제한 등 17개 검사를 통과했습니다. 이 검사는 실제 Google 계정 로그인과 운영 저장 흐름 전체를 대신하지 않습니다. 보안 규칙은 초기 설계이며 광범위한 사용 전에 검토가 필요합니다.
