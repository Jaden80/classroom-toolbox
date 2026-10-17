import {createInterface} from 'node:readline/promises';
import {stdin,stdout} from 'node:process';
import {Writable} from 'node:stream';
import {openStore} from './db.ts';
import {Auth} from './auth.ts';
// Operator-only maintenance. Never invoked by startup or tests.
let muted=false;const terminalOutput=new Writable({write(chunk,_encoding,done){if(!muted)stdout.write(chunk);done();}});
const cli=createInterface({input:stdin,output:terminalOutput,terminal:!!stdin.isTTY});
try{
 console.log('교사 계정 및 해당 문제·수업 전체 삭제 도구입니다. 복구할 수 없습니다.');
 const email=(await cli.question('삭제할 교사 이메일: ')).trim().toLowerCase();
 const confirmation=await cli.question(`이 계정의 모든 자료를 삭제하려면 DELETE ${email} 를 입력하세요: `);
 if(confirmation!==`DELETE ${email}`){console.log('취소했습니다.');process.exitCode=1;}
 else{
  const store=await openStore(process.env.SQLITE_PATH??'data/quiz.sqlite',process.env.DATABASE_URL);
  try{
   if(!stdin.isTTY)throw new Error('비밀번호 재인증을 위해 대화형 터미널에서 실행하세요.');
   stdout.write('현재 교사 비밀번호 (표시되지 않음): ');muted=true;
   let password='';try{password=await cli.question('');}finally{muted=false;stdout.write('\n');}
   const auth=new Auth(store,{origin:process.env.APP_ORIGIN??'http://localhost:4317',production:process.env.NODE_ENV==='production',supabaseUrl:process.env.SUPABASE_URL,supabaseKey:process.env.SUPABASE_ANON_KEY,teacherEmail:process.env.TEACHER_EMAIL?.toLowerCase()});
   const session=await auth.login({email,password});password='';await auth.logout(session.token);
   if(process.env.SUPABASE_URL){
    console.log('먼저 Supabase Auth에서 해당 계정을 비활성화·삭제하세요. 이 도구는 앱 DB 자료만 삭제합니다.');
    const check=await cli.question('Auth 계정 삭제를 확인했으면 AUTH-DELETED 를 입력하세요: ');if(check!=='AUTH-DELETED')throw new Error('취소했습니다.');
   }
   await store.tx(async q=>{const teacher=await q.get('SELECT id FROM teacher WHERE email=?',[email]);if(!teacher)throw new Error('해당 교사 계정이 없습니다.');await q.run('DELETE FROM teacher WHERE id=?',[teacher.id]);});
   console.log('앱 DB에서 교사·문제·수업 자료를 삭제했습니다. 제공자 백업 보관은 별도 정책을 확인하세요.');
  }finally{await store.close();}
 }
}finally{cli.close();}
