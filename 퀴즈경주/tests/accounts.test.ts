import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openStore} from '../server/db.ts';
import {Accounts} from '../server/accounts.ts';
import {Game} from '../server/game.ts';
import {SAMPLE} from '../shared/rules.ts';
test('ID accounts: teacher ownership, student signup, durable server scores and teacher reset',async()=>{
 const store=await openStore(':memory:');const accounts=new Accounts(store),game=new Game(store);
 try{
  await accounts.register({username:'teacher_one',password:'example-pass-123',role:'teacher'});
  await assert.rejects(()=>accounts.register({username:'teacher_one',password:'example-pass-123',role:'teacher'}));
  const teacher=await accounts.user((await accounts.login({username:'teacher_one',password:'example-pass-123'})).token);
  await assert.rejects(()=>accounts.login({username:'teacher_one',password:'incorrect'}));
  const set=await game.teacherAction(teacher.teacher_id,'save-set',{title:'기록 검증',questions:SAMPLE.slice(0,1)});
  await game.teacherAction(teacher.teacher_id,'create-room',{id:set.id});const room=(await game.teacherState(teacher.teacher_id)).room!;
  await accounts.register({username:'student_one',password:'example-pass-123',role:'student',code:room.code});
  const login=await accounts.login({username:'student_one',password:'example-pass-123'}),student=await accounts.user(login.token);
  await assert.rejects(()=>accounts.register({username:'student_bad',password:'example-pass-123',role:'student',code:'000000'}));
  const team=await game.join(room.code,'별빛 모둠',student as any);
  await assert.rejects(()=>game.join(room.code,'중복 계정',student as any));
  await game.teacherAction(teacher.teacher_id,'start-room',{id:room.id});
  await game.submit(team.token,{ordinal:1,choice:SAMPLE[0].answer,requestId:randomUUID()});
  const records=await accounts.history(student.id);assert.equal(records.length,1);assert.equal(records[0].score,1);assert.equal(records[0].total,1);
  await assert.rejects(()=>accounts.reset('another-teacher',student.id,'new-password-123'));
  await accounts.reset(teacher.teacher_id,student.id,'new-password-123');await assert.rejects(()=>accounts.user(login.token));
  assert.equal((await accounts.login({username:'student_one',password:'new-password-123'})).role,'student');
  await game.teacherAction(teacher.teacher_id,'close-room',{id:room.id});assert.equal((await accounts.history(student.id)).length,1);
  assert.equal((await accounts.history(teacher.id)).length,0);assert.equal((await accounts.roster(teacher.teacher_id))[0].username,'student_one');
  const raw=await store.tx(q=>q.get('SELECT password_hash FROM account WHERE id=?',[student.id]));assert.notEqual(raw!.password_hash,'new-password-123');
 }finally{await store.close();}
});
