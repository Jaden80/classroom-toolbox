// Development-only API participants for manual browser QA. Never run against a real class.
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const base=process.env.QA_BASE??'http://localhost:4317';
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base))throw new Error('로컬 시험 서버에서만 실행할 수 있습니다.');
const fixture=new URL('../test-results/browser-fixture.json',import.meta.url);
async function post(path,body,token){const r=await fetch(base+'/api/'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw new Error(data.message);return data;}
if(process.argv[2]==='join'){
 const names=['탐험 2모둠','지혜 3모둠','도전 4모둠','협력 5모둠','미소 6모둠'];const teams=[];
 for(const name of names)teams.push(await post('join',{code:process.argv[3],name}));
 await fs.mkdir(new URL('../test-results/',import.meta.url),{recursive:true});await fs.writeFile(fixture,JSON.stringify(teams));console.log('로컬 시험 모둠 5개 입장 완료');
}else if(process.argv[2]==='answer'){
 const teams=JSON.parse(await fs.readFile(fixture,'utf8'));
 for(let i=0;i<teams.length;i++){
  await post('submit',{ordinal:1,choice:i%2?'1':'3',requestId:randomUUID()},teams[i].token);
  if(i<3){await post('next',{ordinal:1},teams[i].token);await post('submit',{ordinal:2,choice:i%2?'X':'O',requestId:randomUUID()},teams[i].token);}
 }console.log('시험 모둠 답안 제출 완료');
}else throw new Error('join CODE 또는 answer를 지정하세요.');
