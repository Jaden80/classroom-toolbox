import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openStore} from './db.ts';
import {Game,hash,secret} from './game.ts';
import {Auth,SESSION_MS} from './auth.ts';
import {AppError,requireValue} from '../shared/rules.ts';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const production=process.env.NODE_ENV==='production';
const port=Number(process.env.PORT??4317),host=process.env.HOST??'127.0.0.1';
const origin=process.env.APP_ORIGIN??`http://localhost:${port}`;
if(production&&(!process.env.DATABASE_URL||!process.env.SUPABASE_URL||!process.env.SUPABASE_ANON_KEY||!process.env.TEACHER_EMAIL||!origin.startsWith('https://'))){
  throw new Error('운영 실행에는 DATABASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY, TEACHER_EMAIL, HTTPS APP_ORIGIN이 필요합니다.');
}
const store=await openStore(process.env.SQLITE_PATH??resolve(root,'data/quiz.sqlite'),process.env.DATABASE_URL);
const game=new Game(store),auth=new Auth(store,{origin,production,supabaseUrl:process.env.SUPABASE_URL,supabaseKey:process.env.SUPABASE_ANON_KEY,teacherEmail:process.env.TEACHER_EMAIL?.toLowerCase(),smtpUrl:process.env.SMTP_URL,mailFrom:process.env.MAIL_FROM});
let cleanupFailed=false;
async function cleanup(){try{await game.cleanup();cleanupFailed=false;}catch{cleanupFailed=true;console.error('정리 작업 실패: 데이터베이스 연결과 상태를 확인하세요.');}}
await cleanup();const timer=setInterval(cleanup,300000);timer.unref();
const built=await stat(resolve(root,'dist/index.html')).then(()=>true,()=>false);
const vite=built?null:await (await import('vite')).createServer({root,configFile:resolve(root,'vite.config.ts'),configLoader:'native',server:{middlewareMode:true},appType:'custom'});
const cookie=(req:http.IncomingMessage)=>req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('quiz_teacher='))?.slice(13)??'';
const bearer=(req:http.IncomingMessage)=>req.headers.authorization?.replace(/^Bearer /,'')??'';
const salt=secret();
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), microphone=(), geolocation=()'};
function json(res:http.ServerResponse,body:unknown,status=200){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',...headers});res.end(JSON.stringify(body));}
async function body(req:http.IncomingMessage){requireValue(req.headers['content-type']?.startsWith('application/json'),'INVALID_REQUEST','JSON 형식으로 요청해 주세요.',415);let size=0;const chunks:Buffer[]=[];
  for await(const chunk of req){size+=chunk.length;requireValue(size<=600000,'TOO_LARGE','요청 데이터가 너무 큽니다.',413);chunks.push(chunk);}
  try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw new AppError('INVALID_REQUEST','요청 형식이 올바르지 않습니다.');}}
function sameOrigin(req:http.IncomingMessage){const requestOrigin=req.headers.origin;
  const localOrigins=new Set([origin,...(!production?[`http://127.0.0.1:${port}`,`http://localhost:${port}`]:[])]);
  requireValue(!requestOrigin||localOrigins.has(requestOrigin),'UNAUTHORIZED','허용되지 않은 요청 출처입니다.',403);
  requireValue(req.headers['sec-fetch-site']!=='cross-site','UNAUTHORIZED','다른 사이트에서 요청할 수 없습니다.',403);
}
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url??'/',origin),path=url.pathname;
    if(path.startsWith('/api/')){
      sameOrigin(req);Object.entries(headers).forEach(([k,v])=>res.setHeader(k,v));
      const ip=req.socket.remoteAddress??'unknown';const ipKey=hash(salt+ip);
      if(path==='/api/config'&&req.method==='GET'){return json(res,{configured:await auth.configured(),authMode:auth.cloud?'supabase':'local',mailConfigured:auth.cloud||!!process.env.SMTP_URL,production,cleanupHealthy:!cleanupFailed});}
      if(path==='/api/health')return json(res,{ok:!cleanupFailed,database:store.kind},cleanupFailed?503:200);
      if(req.method==='GET'){
        if(path==='/api/teacher'){const teacher=await auth.teacher(cookie(req));return json(res,{email:teacher.email,...await game.teacherState(teacher.id)});}
        if(path==='/api/team')return json(res,await game.teamState(bearer(req)));
        throw new AppError('NOT_FOUND','요청을 찾을 수 없습니다.',404);
      }
      requireValue(req.method==='POST','METHOD_NOT_ALLOWED','허용되지 않은 요청 방식입니다.',405);
      const data=await body(req);requireValue(data&&typeof data==='object'&&!Array.isArray(data),'INVALID_REQUEST','요청 형식이 올바르지 않습니다.');
      if(path.startsWith('/api/auth/')){
        await game.limit(`auth:${ipKey}`,30,15*60000);
        const action=path.split('/').pop();
        if(action==='setup'){requireValue(['127.0.0.1','::1','::ffff:127.0.0.1'].includes(ip),'UNAUTHORIZED','초기 계정은 교사 컴퓨터에서 설정하세요.',403);return json(res,await auth.setup(data));}
        if(action==='login'){
          const result=await auth.login(data);res.setHeader('Set-Cookie',`quiz_teacher=${result.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS/1000}${production?'; Secure':''}`);return json(res,{email:result.email});
        }
        if(action==='logout'){await auth.logout(cookie(req));res.setHeader('Set-Cookie',`quiz_teacher=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${production?'; Secure':''}`);return json(res,{ok:true});}
        if(action==='forgot'){await game.limit(`mail:${ipKey}`,3,3600000);return json(res,await auth.forgot(data));}
        if(action==='reset')return json(res,await auth.reset(data));
      }
      if(path==='/api/join'){await game.limit(`join:${ipKey}`,30,60000);return json(res,await game.join(data.code,data.name));}
      if(path==='/api/action'){
        const teacher=await auth.teacher(cookie(req));requireValue(typeof data.action==='string','INVALID_REQUEST','동작을 선택하세요.');
        if(data.action==='close-room'){
          const result=await store.tx(q=>q.get('SELECT owner_id FROM room WHERE id=?',[data.id]));if(!result)return json(res,{ok:true});
        }
        return json(res,await game.teacherAction(teacher.id,data.action,data));
      }
      if(path==='/api/submit'){await game.limit(`submit:${hash(bearer(req))}`,120,60000);return json(res,await game.submit(bearer(req),data));}
      if(path==='/api/next')return json(res,await game.next(bearer(req),data));
      throw new AppError('NOT_FOUND','요청을 찾을 수 없습니다.',404);
    }
    requireValue(req.method==='GET'||req.method==='HEAD','METHOD_NOT_ALLOWED','허용되지 않은 방식입니다.',405);
    if(vite){return vite.middlewares(req,res,async()=>{try{const page=await vite.transformIndexHtml(req.url!,await readFile(resolve(root,'index.html'),'utf8'));res.writeHead(200,{'Content-Type':'text/html; charset=utf-8',...headers});res.end(page);}catch{json(res,{error:'페이지를 불러오지 못했습니다.'},500);}});}
    const directory=resolve(root,'dist');const filename=resolve(directory,'.'+decodeURIComponent(path));
    requireValue(filename===directory||filename.startsWith(directory+sep),'NOT_FOUND','파일을 찾을 수 없습니다.',404);
    const isAsset=!!extname(path);const target=isAsset?filename:resolve(directory,'index.html');
    const data=await readFile(target).catch(()=>{throw new AppError('NOT_FOUND','파일을 찾을 수 없습니다.',404);});
    const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.png':'image/png'};
    res.writeHead(200,{...headers,'Content-Type':mime[extname(target)]??'application/octet-stream',...(production?{'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"}:{})});res.end(req.method==='HEAD'?undefined:data);
  }catch(e){if(res.headersSent){res.end();return;}if(e instanceof AppError)return json(res,{code:e.code,message:e.message},e.status);
    console.error('요청 처리 실패:',e instanceof Error?e.name:'Error');json(res,{code:'SERVER_ERROR',message:'서버가 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'},500);}
});
server.listen(port,host,()=>console.log(`모둠 퀴즈 레이스: http://localhost:${port}\n교사: http://localhost:${port}/teacher\n모둠: http://localhost:${port}/join\n저장 방식: ${store.kind} / ${auth.cloud?'Supabase 인증':'로컬 교사 계정'}`));
async function stop(){clearInterval(timer);await new Promise<void>(resolve=>server.close(()=>resolve()));await vite?.close();await store.close();process.exit(0);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
