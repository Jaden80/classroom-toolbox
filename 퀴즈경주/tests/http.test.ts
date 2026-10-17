import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,rm,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {SAMPLE} from '../shared/rules.ts';
test('HTTP 통합: 인증·출처·XSS·실제 6세션·재접속·전체 완료·삭제', {timeout:30000},async t=>{
 const root=fileURLToPath(new URL('..',import.meta.url));await mkdir(resolve(root,'test-results'),{recursive:true});
 const dir=await mkdtemp(resolve(root,'test-results/http-'));const port=4328;
 const child=spawn(process.execPath,['server/index.ts'],{cwd:root,env:{...process.env,PORT:String(port),HOST:'127.0.0.1',APP_ORIGIN:`http://127.0.0.1:${port}`,SQLITE_PATH:resolve(dir,'quiz.sqlite'),DATABASE_URL:'',SUPABASE_URL:'',NODE_ENV:'test'},stdio:['ignore','pipe','pipe'],windowsHide:true});
 let output='';child.stdout!.on('data',x=>output+=x);child.stderr!.on('data',x=>output+=x);
 const base=`http://127.0.0.1:${port}/api/`;let cookie='';
 async function request(path:string,data?:unknown,token?:string,teacher=false,extra:Record<string,string>={}){
  const response=await fetch(base+path,{method:data?'POST':'GET',headers:{...(data?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`} :{}),...(teacher?{Cookie:cookie}:{}),...extra},...(data?{body:JSON.stringify(data)}:{})});return {response,value:await response.json()};
 }
 try{
  for(let i=0;i<80;i++){if(child.exitCode!==null)throw new Error(output);try{if((await fetch(base+'health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  await t.test('비로그인 접근과 다른 사이트의 쓰기 요청 차단',async()=>{
   assert.equal((await request('teacher')).response.status,401);
   assert.equal((await request('auth/setup',{email:'teacher@example.com',password:'integration-password-123'},undefined,false,{Origin:'https://evil.example'})).response.status,403);
  });
  assert.equal((await request('auth/setup',{email:'teacher@example.com',password:'integration-password-123'})).response.status,200);
  const login=await request('auth/login',{email:'teacher@example.com',password:'integration-password-123'});assert.equal(login.response.status,200);cookie=login.response.headers.get('set-cookie')!.split(';')[0];
  const set=await request('action',{action:'save-set',title:'<script>수업</script>',questions:SAMPLE.slice(0,2)},undefined,true);assert.equal(set.response.status,200);
  await request('action',{action:'create-room',id:set.value.id},undefined,true);
  const waiting=(await request('teacher',undefined,undefined,true)).value.room;
  const joins=await Promise.all(Array.from({length:6},(_,i)=>request('join',{code:waiting.code,name:`${i+1}모둠`})));
  assert.ok(joins.every(x=>x.response.status===200));assert.equal((await request('join',{code:waiting.code,name:'7모둠'})).value.code,'ROOM_FULL');
  await request('action',{action:'start-room',id:waiting.id},undefined,true);
  const times:number[]=[];
  await t.test('6개 독립 토큰의 정답·오답·중복·재조회',async()=>{
   await Promise.all(joins.map(async(join,i)=>{
    const token=join.value.token;const question=await request('team',undefined,token);assert.equal(question.value.question.answer,undefined);
    const start=performance.now();const answer={ordinal:1,choice:i%2?'1':'3',requestId:randomUUID()};assert.equal((await request('submit',answer,token)).response.status,200);times.push(performance.now()-start);
    assert.equal((await request('submit',answer,token)).response.status,200);
    assert.equal((await request('team',undefined,token)).value.answered,1);await request('next',{ordinal:1},token);
    assert.equal((await request('team',undefined,token)).value.question.ordinal,2);
   }));
  });
  await Promise.all(joins.map(join=>request('submit',{ordinal:2,choice:'O',requestId:randomUUID()},join.value.token)));
  const final=(await request('teacher',undefined,undefined,true)).value.room;assert.equal(final.state,'results');assert.deepEqual(final.teams.map((x:any)=>x.score).sort(),[1,1,1,2,2,2]);
  assert.equal((await request('action',{action:'end-room',id:waiting.id},joins[0].value.token)).response.status,401);
  assert.equal((await request('action',{action:'close-room',id:waiting.id},undefined,true)).response.status,200);
  assert.equal((await request('team',undefined,joins[0].value.token)).response.status,410);
  assert.equal((await request('action',{action:'close-room',id:waiting.id},undefined,true)).response.status,200);
  assert.equal((await request('teacher',undefined,undefined,true)).value.sets.length,1);
  const sorted=times.sort((a,b)=>a-b);console.log(`로컬 HTTP 6모둠 동시 제출 p95: ${sorted[Math.ceil(sorted.length*.95)-1].toFixed(1)}ms (학교망 성능 검증 아님)`);
  const html=await fetch(`http://127.0.0.1:${port}/join`).then(r=>r.text());assert.ok(html.includes('모둠 퀴즈 레이스'));
  assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status,200);
  const workbook=await fetch(`http://127.0.0.1:${port}/`+encodeURIComponent('문제양식.xlsx'));assert.equal(workbook.status,200);assert.ok((await workbook.arrayBuffer()).byteLength>1000);
 }finally{
  child.kill();await new Promise<void>(r=>{if(child.exitCode!==null)r();else child.once('exit',()=>r());});
  await rm(dir,{recursive:true,force:true});
 }
});
