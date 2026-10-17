import { deployments } from './deployments.js';
const local = ['localhost','127.0.0.1'].includes(globalThis.location?.hostname ?? 'localhost');
export const tools = [
  { id: 'diary', name: '하루의 조각 · 일기장', description: '오늘의 기분과 이야기를 남겨요. 기록은 이 컴퓨터의 로컬 폴더에 저장됩니다.', route: '/diary', label: 'MY LOCAL DIARY', number: '04' },
  { id: 'timer', name: '교실 타이머', description: '활동 시간도, 정리 시간도. 함께 보는 커다란 타이머.', route: '#/timer', label: 'TIME & FOCUS', number: '01' },
  { id: 'pdf', name: 'PDF 글자 수', description: '파일 업로드 없이, 이 기기에서 공백 포함·제외 글자 수를 확인해요.', route: '#/pdf', label: 'LOCAL & PRIVATE', number: '02' },
  { id: 'quiz-race', name: '모둠 퀴즈 레이스', description: '정답을 모아 달리는 6모둠 퀴즈 경주. 교사 로그인 · 새 창으로 열려요.', route: '/quiz-race', label: 'TEAM QUIZ RACE', number: '03', newWindow: true }
].map(tool => {
  const url = tool.id === 'diary' ? deployments.diary : tool.id === 'quiz-race' ? deployments.quiz : null;
  if (url) return {...tool, label: tool.id === 'diary' ? 'MY PRIVATE DIARY' : tool.label, route: url, newWindow: true, description: tool.id === 'diary' ? 'Google 로그인으로 나만의 일기를 저장하고 다른 기기에서 이어 보세요.' : '아이디로 가입하고 모둠 경주와 나의 학습 기록을 확인해요.'};
  if (!local && url === '') return {...tool, route: '#/', unavailable: true, description: '온라인 서비스 연결을 준비하고 있습니다.'};
  return tool;
});
