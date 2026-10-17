import http from 'node:http';
import {openDiary} from './diary-store.mjs';
import {spawn} from 'node:child_process';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
const port=Number(process.env.HUB_PORT??8000),quizPort=Number(process.env.QUIZ_PORT??4317);
const quizRoot=resolve(root,'퀴즈경주');
const diary=openDiary(resolve(root,'data/diary.sqlite'));
const headers={'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cache-Control':'no-store'};
let child,stopping=false,ready=false;
const server=http.createServer(async(req,res)=>{
 try{
  const apiPath=new URL(req.url,'http://localhost').pathname;
  if(apiPath==='/api/diary'||apiPath.startsWith('/api/diary/')){
   const json=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8',...headers});res.end(JSON.stringify(data));};
   if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host)||(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)||req.headers['sec-fetch-site']==='cross-site'){json(403,{error:'허용되지 않은 요청입니다.'});return;}
   const id=apiPath==='/api/diary'?null:apiPath.slice('/api/diary/'.length);
   if(req.method==='GET'&&!id){json(200,diary.list());return;}
   if(req.method==='DELETE'&&id){const removed=diary.remove(id);json(removed?200:404,removed?{ok:true}:{error:'일기를 찾을 수 없어요.'});return;}
   if((req.method==='POST'&&!id)||(req.method==='PUT'&&id)){
    if(!req.headers['content-type']?.startsWith('application/json')){json(415,{error:'JSON 요청이 필요합니다.'});return;}
    const chunks=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>500000){json(413,{error:'내용이 너무 큽니다.'});return;}chunks.push(chunk);}
    try{const value=diary.save(JSON.parse(Buffer.concat(chunks).toString('utf8')),id);json(value?200:404,value??{error:'일기를 찾을 수 없어요.'});}catch{json(400,{error:'날짜, 제목(120자 이내), 기분, 내용(10만 자 이내)을 확인해 주세요.'});}return;
   }
   json(405,{error:'지원하지 않는 요청입니다.'});return;
  }
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,headers);res.end();return;}
  const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(path==='/quiz-race'){
   if(!ready){res.writeHead(503,{'Content-Type':'text/plain; charset=utf-8',...headers});res.end('퀴즈 경주 서버를 준비하는 중입니다. 잠시 후 다시 열어 주세요.');return;}
   res.writeHead(302,{Location:`http://127.0.0.1:${quizPort}/teacher`,...headers});res.end();return;
  }
  const publicFile=path==='/'?'index.html':path==='/diary'?'diary.html':path.slice(1);
  const allowed=['index.html','app.js','style.css','icon.svg','diary.html','diary.js','diary.css'].includes(publicFile)||/^(js|vendor)\/[a-zA-Z0-9_./-]+$/.test(publicFile);
  const filename=resolve(root,publicFile);
  if(!allowed||!filename.startsWith(root.endsWith(sep)?root:root+sep)||publicFile.split('/').some(p=>p==='..'||p.startsWith('.'))){res.writeHead(404,headers);res.end('Not found');return;}
  const data=await readFile(filename);
  const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.wasm':'application/wasm','.bcmap':'application/octet-stream','.ttf':'font/ttf','.otf':'font/otf','.woff':'font/woff','.woff2':'font/woff2','.pfb':'application/octet-stream'};
  res.writeHead(200,{'Content-Type':mime[extname(filename)]??'application/octet-stream',...headers});res.end(req.method==='HEAD'?undefined:data);
 }catch{res.writeHead(404,headers);res.end('Not found');}
});
async function stop(code=0){if(stopping)return;stopping=true;ready=false;child?.kill();server.close();process.exitCode=code;const timeout=setTimeout(()=>process.exit(code),3000);timeout.unref();}
process.on('SIGINT',()=>void stop());process.on('SIGTERM',()=>void stop());
server.on('error',error=>{console.error(`허브 서버를 열지 못했습니다 (${error.code??'Error'}). 기존 실행 창을 닫거나 HUB_PORT를 변경하세요.`);void stop(1);});
try{
 if(Number(process.versions.node.split('.')[0])<24)throw new Error('Node.js 24 이상이 필요합니다.');
 await stat(resolve(quizRoot,'node_modules/pg/package.json'));await stat(resolve(quizRoot,'dist/index.html'));
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>resolve());});
 child=spawn(process.execPath,['--env-file-if-exists=.env','server/index.ts'],{cwd:quizRoot,env:{...process.env,PORT:String(quizPort),HOST:'127.0.0.1',APP_ORIGIN:`http://127.0.0.1:${quizPort}`},stdio:['ignore','inherit','inherit'],windowsHide:true});
 child.on('error',error=>{console.error('퀴즈 경주 실행 실패:',error.message);void stop(1);});
 child.on('exit',()=>{if(!stopping){console.error('퀴즈 경주 서버가 종료되어 허브도 종료합니다.');void stop(1);}});
 for(let i=0;i<60&&!stopping;i++){
  try{const response=await fetch(`http://127.0.0.1:${quizPort}/api/health`,{signal:AbortSignal.timeout(500)});if(response.ok){ready=true;break;}}catch{}
  await new Promise(r=>setTimeout(r,200));
 }
 if(!ready)throw new Error('퀴즈 경주가 준비되지 않았습니다. 실행 메시지와 포트를 확인하세요.');
 console.log(`\n교실 도구함 준비 완료: http://127.0.0.1:${port}\n타이머 · PDF 글자 수 · 모둠 퀴즈 레이스\n종료: Ctrl+C (두 서버를 함께 종료합니다.)`);
}catch(error){console.error(error.message);console.error('처음 실행할 때는 이 폴더의 실행.bat를 사용하세요.');await stop(1);}
