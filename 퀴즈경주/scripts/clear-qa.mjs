// Removes only the synthetic account created for this implementation's browser QA.
// Stop the local preview server first. This is not a general account deletion tool.
import {stat,rm} from 'node:fs/promises';
import {openStore} from '../server/db.ts';
const path=new URL('../data/quiz.sqlite',import.meta.url);await stat(path);
const store=await openStore((await import('node:url')).fileURLToPath(path));
try{await store.tx(async q=>{
 const rows=await q.all('SELECT email FROM teacher');
 if(rows.some(x=>x.email!=='qa-teacher@example.com'))throw new Error('다른 계정이 있어 시험 초기화를 중단했습니다.');
 await q.run('DELETE FROM teacher WHERE email=?',['qa-teacher@example.com']);
 const count=await q.get('SELECT COUNT(*) AS n FROM teacher');console.log(`시험 계정 정리 완료. 남은 교사 계정: ${count.n}`);
});}finally{await store.close();}
await rm(new URL('../test-results/browser-fixture.json',import.meta.url),{force:true});
