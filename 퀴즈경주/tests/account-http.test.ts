import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SAMPLE} from '../shared/rules.ts';
test('ID HTTP: sessions, role separation, teacher ownership and forged score rejection',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'quiz-id-http-'));
 const child=spawn(process.execPath,['server/index.ts'],{cwd:import.meta.dirname+'/..',env:{...process.env,AUTH_MODE:'id',NODE_ENV:'test',PORT:'14337',HOST:'127.0.0.1',APP_ORIGIN:'http://127.0.0.1:14337',SQLITE_PATH:join(dir,'test.sqlite'),DATABASE_URL:'',SUPABASE_URL:''},stdio:'ignore',windowsHide:true});
 const base='http://127.0.0.1:14337/api/';
 const req=async(path:string,data?:any,cookie='')=>{const response=await fetch(base+path,{method:data?'POST':'GET',headers:{Cookie:cookie,...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]??'',rawCookie:response.headers.get('set-cookie')??''};};
 try{
  let ready=false;for(let i=0;i<80;i++){if(child.exitCode!==null)throw Error('test server exited');try{ready=(await fetch(base+'health')).ok;if(ready)break;}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
  assert.equal((await req('history')).status,401);
  assert.equal((await req('account/register',{username:'teacher_http',password:'http-test-pass-123',role:'teacher'})).status,200);
  const login=await req('account/login',{username:'teacher_http',password:'http-test-pass-123'});assert.match(login.rawCookie,/HttpOnly/);assert.match(login.rawCookie,/SameSite=Strict/);const teacher=login.cookie;
  const set=await req('action',{action:'save-set',title:'HTTP 기록 검증',questions:SAMPLE.slice(0,1)},teacher);await req('action',{action:'create-room',id:set.data.id},teacher);
  const state=await req('teacher',undefined,teacher);const room=state.data.room;
  await req('account/register',{username:'student_http',password:'http-test-pass-123',role:'student',code:room.code});const student=(await req('account/login',{username:'student_http',password:'http-test-pass-123'})).cookie;
  assert.equal((await req('teacher',undefined,student)).status,403);assert.equal((await req('students',undefined,student)).status,403);
  assert.equal((await req('join',{code:room.code,name:'대표 모둠'})).status,401);
  const team=await req('join',{code:room.code,name:'대표 모둠'},student);assert.equal(team.status,200);
  assert.equal((await req('submit',{score:999},student)).status,401);
  await req('action',{action:'start-room',id:room.id},teacher);await req('action',{action:'end-room',id:room.id},teacher);
  const records=await req('history',undefined,student);assert.equal(records.data.length,1);assert.equal(records.data[0].score,0);assert.equal((await req('history',undefined,teacher)).data.length,0);
  const roster=await req('students',undefined,teacher);assert.equal(roster.data[0].username,'student_http');
  await req('account/reset-student',{id:roster.data[0].id,password:'http-new-password-123'},teacher);assert.equal((await req('account',undefined,student)).status,401);
  await req('action',{action:'close-room',id:room.id},teacher);const newStudent=(await req('account/login',{username:'student_http',password:'http-new-password-123'})).cookie;assert.equal((await req('history',undefined,newStudent)).data.length,1);
 }finally{if(child.exitCode===null){child.kill();await new Promise(r=>child.once('exit',r));}await rm(dir,{recursive:true,force:true});}
});
