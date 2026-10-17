import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {openStore} from '../server/db.ts';
import {Auth} from '../server/auth.ts';
test('초기 계정·로그인·세션 무효화·미설정 메일 명확한 오류',async()=>{
 const store=await openStore(':memory:');const auth=new Auth(store,{origin:'http://localhost:4317',production:false});try{
  assert.equal(await auth.configured(),false);await auth.setup({email:'teacher@example.com',password:'test-password-123'});
  assert.equal(await auth.configured(),true);await assert.rejects(()=>auth.setup({email:'other@example.com',password:'test-password-123'}));
  await assert.rejects(()=>auth.login({email:'teacher@example.com',password:'wrong'}),{code:'AUTH_FAILED'});
  const session=await auth.login({email:'teacher@example.com',password:'test-password-123'});assert.equal((await auth.teacher(session.token)).email,'teacher@example.com');
  await auth.logout(session.token);await assert.rejects(()=>auth.teacher(session.token),{code:'UNAUTHORIZED'});
  await assert.rejects(()=>auth.forgot({email:'teacher@example.com'}),{code:'MAIL_NOT_CONFIGURED'});
 }finally{await store.close();}
});
test('Supabase 인증 어댑터 계약 (모의 응답): 허용 교사·사용자 검증·재설정',async()=>{
 const store=await openStore(':memory:');const oldFetch=globalThis.fetch;const calls:string[]=[];
 globalThis.fetch=async(input:any,init:any)=>{const url=String(input);calls.push(`${init.method} ${url}`);
  if(url.includes('/token?'))return new Response(JSON.stringify({access_token:'mock-provider-token'}));
  if(url.endsWith('/user'))return new Response(JSON.stringify({id:'cloud-teacher',email:'teacher@example.com'}));
  return new Response('{}');
 };
 const auth=new Auth(store,{origin:'https://quiz.example.com',production:true,supabaseUrl:'https://mock.example.com',supabaseKey:'mock-public-key',teacherEmail:'teacher@example.com'});
 try{
  await assert.rejects(()=>auth.login({email:'other@example.com',password:'test-password-123'}),{code:'AUTH_FAILED'});
  assert.equal(calls.length,0);const login=await auth.login({email:'teacher@example.com',password:'test-password-123'});
  assert.ok(calls.some(c=>c.startsWith('GET ')&&c.endsWith('/user')));assert.equal((await auth.teacher(login.token)).id,'cloud-teacher');
  await auth.forgot({email:'teacher@example.com'});assert.ok(calls.some(c=>c.includes('/recover?redirect_to=')));
  await auth.reset({token:'mock-recovery-token',password:'new-test-password-456'});assert.ok(calls.some(c=>c.startsWith('PUT ')&&c.endsWith('/user')));
  await assert.rejects(()=>auth.teacher(login.token),{code:'UNAUTHORIZED'});
 }finally{globalThis.fetch=oldFetch;await store.close();}
});
test('SMTP 시험 서버로 재설정 발송·토큰 1회 사용·기존 세션 무효화',async()=>{
 let message='';const server=createServer(socket=>{socket.write('220 localhost ESMTP\r\n');let input='',dataMode=false;
  socket.on('data',chunk=>{input+=chunk.toString();while(input.includes('\r\n')){const index=input.indexOf('\r\n');const line=input.slice(0,index);input=input.slice(index+2);
   if(dataMode){if(line==='.'){dataMode=false;socket.write('250 queued\r\n');}else message+=line+'\n';continue;}
   if(/^EHLO|^HELO/.test(line))socket.write('250-localhost\r\n250 OK\r\n');else if(line==='DATA'){dataMode=true;socket.write('354 End with .\r\n');}else if(line==='QUIT'){socket.end('221 Bye\r\n');}else socket.write('250 OK\r\n');
  }});
 });await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const port=(server.address() as any).port;
 const store=await openStore(':memory:');const auth=new Auth(store,{origin:'http://localhost:4317',production:false,smtpUrl:`smtp://127.0.0.1:${port}`,mailFrom:'race@example.com'});
 try{await auth.setup({email:'teacher@example.com',password:'test-password-123'});const old=await auth.login({email:'teacher@example.com',password:'test-password-123'});
 await auth.forgot({email:'teacher@example.com'});
 // Nodemailer uses quoted-printable for Korean content; decode soft wraps and =XX escapes.
 const decoded=message.replace(/=\n/g,'').replace(/=([0-9A-F]{2})/g,(_,hex)=>String.fromCharCode(parseInt(hex,16)));
 const token=decoded.match(/#reset=([A-Za-z0-9_-]+)/)?.[1];assert.ok(token,'메일에 재설정 링크가 있어야 함');
 await auth.reset({token,password:'new-test-password-456'});await assert.rejects(()=>auth.reset({token,password:'new-test-password-456'}),{code:'RESET_EXPIRED'});
 await assert.rejects(()=>auth.teacher(old.token),{code:'UNAUTHORIZED'});assert.ok((await auth.login({email:'teacher@example.com',password:'new-test-password-456'})).token);
 }finally{await store.close();await new Promise<void>(r=>server.close(()=>r()));}
});
