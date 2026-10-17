import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openStore} from '../server/db.ts';
import {Game} from '../server/game.ts';
import {SAMPLE,rankTeams,position,validateQuestions,rowsToQuestions,HEADERS} from '../shared/rules.ts';
async function fixture(){const store=await openStore(':memory:');let time=1700000000000;
  const game=new Game(store,()=>time);await store.tx(q=>q.run('INSERT INTO teacher(id,email,created_at) VALUES(?,?,?)',['teacher','teacher@example.com',time]));
  const set=await game.teacherAction('teacher','save-set',{title:'수업',questions:SAMPLE.slice(0,2)});
  const room=await game.teacherAction('teacher','create-room',{id:set.id});const state=await game.teacherState('teacher');
  return {store,game,set,room,code:state.room!.code,advance:(ms:number)=>time+=ms};
}
test('엑셀 계약: 두 유형, 보기·정답·해설·연속 번호 검사',()=>{
  assert.equal(validateQuestions(SAMPLE).length,6);
  const valid=rowsToQuestions([HEADERS,[1,'객관식','덧셈','1','2','3','4','2','해설'],['','','','','','','','',''],[2,'OX','명제','','','','','X','설명']]);assert.equal(valid[1].answer,'X');
  for(const change of [{answer:'5'},{options:['a']},{explanation:''},{ordinal:2},{prompt:'x'.repeat(1001)}])assert.throws(()=>validateQuestions([{...SAMPLE[0],...change}]));
  assert.throws(()=>rowsToQuestions([['문제'],[1]]));assert.throws(()=>validateQuestions([{...SAMPLE[1],ordinal:1,options:['보기']}]))
});
test('정답수·시간·공동 순위와 자동차 비율',()=>{
  const ranked=rankTeams([{id:'a',score:2,elapsed:1000},{id:'b',score:2,elapsed:1000},{id:'c',score:2,elapsed:2000},{id:'d',score:1,elapsed:500}]);
  assert.deepEqual(ranked.map(t=>t.rank),[1,1,3,4]);assert.equal(position(2,4),.5);assert.equal(position(0,0),0);
});
test('현황 조회 중 시계가 움직여도 미완료 모둠은 공통 시각으로 비교',async()=>{const f=await fixture();try{
 await f.game.join(f.code,'1모둠');await f.game.join(f.code,'2모둠');await f.game.teacherAction('teacher','start-room',f.room);
 let now=1700000001000;f.game.now=()=>++now;const room=(await f.game.teacherState('teacher')).room!;
 assert.equal(room.teams[0].elapsed,room.teams[1].elapsed);assert.deepEqual(room.teams.map(t=>t.rank),[1,1]);
}finally{await f.store.close();}});
test('동시 7모둠 입장에서도 정원 6, 중복 이름·시작 이후 신규 입장 차단',async()=>{const f=await fixture();try{
  const results=await Promise.allSettled(Array.from({length:7},(_,i)=>f.game.join(f.code,`${i+1}모둠`)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,6);
  await assert.rejects(()=>f.game.join(f.code,'1모둠'),{code:'DUPLICATE_NAME'});
  await f.game.teacherAction('teacher','start-room',f.room);await assert.rejects(()=>f.game.join(f.code,'새모둠'),{code:'ROOM_NOT_WAITING'});
}finally{await f.store.close();}});
test('현재 문제만 노출, 중복 요청 1회 채점, 오답 해설, 새로고침 후 피드백 복원',async()=>{const f=await fixture();try{
  const team=await f.game.join(f.code,'1모둠');await f.game.teacherAction('teacher','start-room',f.room);
  const state=await f.game.teamState(team.token);assert.equal(state.question.ordinal,1);assert.equal(state.question.answer,undefined);assert.equal(state.question.explanation,undefined);assert.equal(state.teams,undefined);
  const request={ordinal:1,choice:'1',requestId:randomUUID()};
  await Promise.all([f.game.submit(team.token,request),f.game.submit(team.token,request)]);
  const after=await f.game.teamState(team.token);assert.equal(after.answered,1);assert.equal(after.score,0);assert.equal(after.feedback.answer,'3');assert.equal(after.question,undefined);
  await assert.rejects(()=>f.game.submit(team.token,{ordinal:2,choice:'O',requestId:randomUUID()}),{code:'QUESTION_CONFLICT'});
  await f.game.next(team.token,{ordinal:1});const next=await f.game.teamState(team.token);assert.equal(next.question.ordinal,2);
  f.advance(5000);await f.game.submit(team.token,{ordinal:2,choice:'O',requestId:randomUUID()});const done=await f.game.teamState(team.token);
  assert.equal(done.state,'results');assert.equal(done.score,1);assert.equal(done.elapsed,5000);assert.equal(done.rank,1);
  await f.game.next(team.token,{ordinal:1});assert.equal((await f.game.teamState(team.token)).feedback.ordinal,2,'지연된 이전 문항 이동이 새 해설을 지우면 안 됨');
  await f.game.submit(team.token,{ordinal:2,choice:'O',requestId:request.requestId}).then(()=>assert.fail(),e=>assert.equal(e.code,'REQUEST_CONFLICT'));
}finally{await f.store.close();}});
test('조기 종료, 미응답 0점, 완료 시간과 종료 시간, 늦은 제출 거절',async()=>{const f=await fixture();try{
  const a=await f.game.join(f.code,'1모둠'),b=await f.game.join(f.code,'2모둠');await f.game.teacherAction('teacher','start-room',f.room);
  f.advance(500);await f.game.submit(a.token,{ordinal:1,choice:'3',requestId:randomUUID()});await f.game.next(a.token,{ordinal:1});
  f.advance(500);await f.game.submit(a.token,{ordinal:2,choice:'X',requestId:randomUUID()});
  f.advance(500);await f.game.submit(b.token,{ordinal:1,choice:'3',requestId:randomUUID()});await f.game.next(b.token,{ordinal:1});
  f.advance(500);await f.game.teacherAction('teacher','end-room',f.room);
  const sa=await f.game.teamState(a.token),sb=await f.game.teamState(b.token);assert.equal(sa.elapsed,1000);assert.equal(sb.elapsed,2000);assert.equal(sa.rank,1);assert.equal(sb.rank,2);assert.equal(sb.score,1);
  await assert.rejects(()=>f.game.submit(b.token,{ordinal:2,choice:'O',requestId:randomUUID()}),{code:'ROOM_NOT_RUNNING'});
}finally{await f.store.close();}});
test('종료와 제출 경합은 확정된 순서대로 일관되게 처리',async()=>{const f=await fixture();try{
  const t=await f.game.join(f.code,'1모둠');await f.game.teacherAction('teacher','start-room',f.room);
  const settled=await Promise.allSettled([f.game.teacherAction('teacher','end-room',f.room),f.game.submit(t.token,{ordinal:1,choice:'3',requestId:randomUUID()})]);
  assert.equal(settled[0].status,'fulfilled');assert.equal(settled[1].status,'rejected');assert.equal((await f.game.teamState(t.token)).score,0);
}finally{await f.store.close();}});
test('권한 위조·다른 교사 접근 차단, 진행 세트 삭제 방지, 스냅샷 보존',async()=>{const f=await fixture();try{
  await assert.rejects(()=>f.game.teacherAction('other','start-room',f.room),{code:'UNAUTHORIZED'});
  await assert.rejects(()=>f.game.teamState('invalid'),{code:'UNAUTHORIZED'});
  await assert.rejects(()=>f.game.teacherAction('teacher','delete-set',{id:f.set.id}),{code:'IN_USE'});
  await f.game.teacherAction('teacher','rename-set',{id:f.set.id,title:'새 이름'});assert.equal((await f.game.teacherState('teacher')).room!.title,'수업');
}finally{await f.store.close();}});
test('결과 닫기: 모둠·답안·방 스냅샷 삭제, 문제 세트 보존',async()=>{const f=await fixture();try{
  const t=await f.game.join(f.code,'1모둠');await f.game.teacherAction('teacher','start-room',f.room);await f.game.submit(t.token,{ordinal:1,choice:'3',requestId:randomUUID()});
  await f.game.teacherAction('teacher','end-room',f.room);await f.game.teacherAction('teacher','close-room',f.room);
  await f.store.tx(async q=>{for(const table of ['room','room_question','team','answer'])assert.equal(Number((await q.get(`SELECT COUNT(*) AS n FROM ${table}`))!.n),0);assert.equal(Number((await q.get('SELECT COUNT(*) AS n FROM question'))!.n),2);});
  await assert.rejects(()=>f.game.teamState(t.token),{code:'ROOM_EXPIRED'});
}finally{await f.store.close();}});
test('만료 즉시 접근 차단 후 정리, 연결 중단 시간도 계속 경과',async()=>{const f=await fixture();try{
  const t=await f.game.join(f.code,'1모둠');await f.game.teacherAction('teacher','start-room',f.room);f.advance(10000);
  assert.equal((await f.game.teamState(t.token)).elapsed,10000);await f.game.teacherAction('teacher','end-room',f.room);f.advance(30*60000+1);
  await assert.rejects(()=>f.game.teamState(t.token),{code:'ROOM_EXPIRED'});assert.equal(await f.game.cleanup(),1);
}finally{await f.store.close();}});
test('요청 제한은 창이 지나면 초기화',async()=>{const f=await fixture();try{await f.game.limit('test',2,1000);await f.game.limit('test',2,1000);await assert.rejects(()=>f.game.limit('test',2,1000),{code:'RETRY_LATER'});f.advance(1001);await f.game.limit('test',2,1000);}finally{await f.store.close();}});
test('모둠 없는 시작 차단·방 절대 만료·교사 계정 삭제의 연쇄 처리',async()=>{const f=await fixture();try{
 await assert.rejects(()=>f.game.teacherAction('teacher','start-room',f.room),{code:'NO_TEAMS'});
 const team=await f.game.join(f.code,'1모둠');f.advance(6*3600000+1);await assert.rejects(()=>f.game.teamState(team.token),{code:'ROOM_EXPIRED'});
 await f.store.tx(q=>q.run('DELETE FROM teacher WHERE id=?',['teacher']));
 await f.store.tx(async q=>{for(const table of ['quiz_set','question','room','room_question','team','answer'])assert.equal(Number((await q.get(`SELECT COUNT(*) AS n FROM ${table}`))!.n),0);});
}finally{await f.store.close();}});
