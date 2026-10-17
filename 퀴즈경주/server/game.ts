import {randomBytes,randomInt,randomUUID,createHash} from 'node:crypto';
import type {Query,Store,Row} from './db.ts';
import {AppError,requireValue,text,validateQuestions,rankTeams} from '../shared/rules.ts';
import {archiveLearning} from './accounts.ts';
export const hash=(token:string)=>createHash('sha256').update(token).digest('hex');
export const secret=()=>randomBytes(32).toString('base64url');
export class Game {
  store:Store;now:()=>number;
  constructor(store:Store,now=()=>Date.now()){this.store=store;this.now=now;}
  async cleanup(){return this.store.tx(async q=>{
    const expired=await q.all('SELECT id FROM room WHERE expires_at<=?',[this.now()]);
    for(const item of expired){const room=await q.get('SELECT * FROM room WHERE id=?',[item.id]);await archiveLearning(q,room!,Math.min(Number(room!.expires_at),this.now()));}
    await q.run('DELETE FROM room WHERE expires_at<=?',[this.now()]);
    for(const table of ['teacher_session','account_session','password_reset','request_limit'])await q.run(`DELETE FROM ${table} WHERE expires_at<=?`,[this.now()]);
    return expired.length;
  });}
  async limit(bucket:string,max:number,windowMs:number){return this.store.tx(async q=>{
    let item=await q.get('SELECT * FROM request_limit WHERE bucket=?',[bucket]);
    if(item&&Number(item.expires_at)<=this.now()){await q.run('DELETE FROM request_limit WHERE bucket=?',[bucket]);item=undefined;}
    requireValue(!item||item.hits<max,'RETRY_LATER','요청이 많습니다. 잠시 후 다시 시도해 주세요.',429);
    if(item)await q.run('UPDATE request_limit SET hits=hits+1 WHERE bucket=?',[bucket]);
    else await q.run('INSERT INTO request_limit(bucket,hits,expires_at) VALUES(?,?,?)',[bucket,1,this.now()+windowMs]);
  });}
  async room(q:Query,id:string,owner?:string){
    const r=await q.get('SELECT * FROM room WHERE id=?',[id]);
    requireValue(r&&Number(r.expires_at)>this.now(),'ROOM_EXPIRED','수업이 닫혔거나 유효 시간이 끝났습니다.',410);
    if(owner)requireValue(r.owner_id===owner,'UNAUTHORIZED','접근 권한이 없습니다.',403);return r;
  }
  async team(q:Query,token:string){
    requireValue(typeof token==='string'&&token.length>=32&&token.length<=100,'UNAUTHORIZED','참여 정보가 없습니다. 다시 입장해 주세요.',401);
    const t=await q.get('SELECT * FROM team WHERE token_hash=?',[hash(token)]);
    requireValue(t,'ROOM_EXPIRED','수업이 닫혔거나 참여 정보가 만료되었습니다.',410);
    return {t,r:await this.room(q,t.room_id)};
  }
  async snapshot(q:Query,r:Row){
    const snapshotTime=this.now();
    const count=await q.get('SELECT COUNT(*) AS n FROM room_question WHERE room_id=?',[r.id]);
    const teams=await q.all('SELECT t.id,t.name,t.lane,t.next_ordinal,t.finished_at,COUNT(a.ordinal) AS answered,COALESCE(SUM(a.correct),0) AS score FROM team t LEFT JOIN answer a ON a.team_id=t.id WHERE t.room_id=? GROUP BY t.id,t.name,t.lane,t.next_ordinal,t.finished_at ORDER BY t.lane',[r.id]);
    const summaries=[];
    for(const t of teams){
      summaries.push({id:t.id,name:t.name,lane:t.lane,score:Number(t.score),answered:Number(t.answered),current:Math.min(Number(count!.n),Number(t.next_ordinal)),finishedAt:t.finished_at==null?null:Number(t.finished_at),elapsed:r.started_at?Math.max(0,Number(t.finished_at??r.ended_at??snapshotTime)-Number(r.started_at)):0});
    }
    return {id:r.id,title:r.title,code:r.code,state:r.state,startedAt:r.started_at==null?null:Number(r.started_at),endedAt:r.ended_at==null?null:Number(r.ended_at),expiresAt:Number(r.expires_at),serverTime:snapshotTime,total:Number(count!.n),teams:rankTeams(summaries)};
  }
  async teacherState(owner:string){return this.store.tx(async q=>{
    for(const expired of await q.all('SELECT * FROM room WHERE owner_id=? AND expires_at<=?',[owner,this.now()]))await archiveLearning(q,expired,Number(expired.expires_at));
    await q.run('DELETE FROM room WHERE owner_id=? AND expires_at<=?',[owner,this.now()]);
    const sets=await q.all('SELECT s.id,s.title,s.created_at, COUNT(p.ordinal) AS count FROM quiz_set s LEFT JOIN question p ON p.set_id=s.id WHERE s.owner_id=? GROUP BY s.id,s.title,s.created_at ORDER BY s.created_at DESC',[owner]);
    const r=await q.get('SELECT * FROM room WHERE owner_id=?',[owner]);
    return {sets:sets.map(s=>({...s,count:Number(s.count)})),room:r?await this.snapshot(q,r):null};
  });}
  async teacherAction(owner:string,action:string,data:any){return this.store.tx(async q=>{
    if(action==='save-set'){
      const title=text(data.title,80);requireValue(title&&title.length<=80,'INVALID_TITLE','문제 세트 이름을 1~80자로 입력하세요.');
      const questions=validateQuestions(data.questions),id=randomUUID();
      await q.run('INSERT INTO quiz_set(id,owner_id,title,created_at) VALUES(?,?,?,?)',[id,owner,title,this.now()]);
      for(const question of questions)await q.run('INSERT INTO question(set_id,ordinal,body) VALUES(?,?,?)',[id,question.ordinal,JSON.stringify(question)]);
      return {id};
    }
    if(['rename-set','delete-set','get-set','create-room'].includes(action)){
      const set=await q.get('SELECT * FROM quiz_set WHERE id=? AND owner_id=?',[data.id,owner]);
      requireValue(set,'NOT_FOUND','문제 세트를 찾을 수 없습니다.',404);
      if(action==='get-set')return {title:set.title,questions:(await q.all('SELECT body FROM question WHERE set_id=? ORDER BY ordinal',[set.id])).map(x=>JSON.parse(x.body))};
      if(action==='rename-set'){
        const title=text(data.title,80);requireValue(title&&title.length<=80,'INVALID_TITLE','이름은 1~80자로 입력하세요.');
        await q.run('UPDATE quiz_set SET title=? WHERE id=?',[title,set.id]);return {ok:true};
      }
      for(const expired of await q.all('SELECT * FROM room WHERE owner_id=? AND expires_at<=?',[owner,this.now()]))await archiveLearning(q,expired,Number(expired.expires_at));
    await q.run('DELETE FROM room WHERE owner_id=? AND expires_at<=?',[owner,this.now()]);
      const existing=await q.get('SELECT * FROM room WHERE owner_id=?',[owner]);
      if(action==='delete-set'){
        requireValue(!existing||existing.set_id!==set.id,'IN_USE','이 문제로 열린 수업을 먼저 닫아 주세요.');
        await q.run('DELETE FROM quiz_set WHERE id=?',[set.id]);return {ok:true};
      }
      if(existing)return {id:existing.id};
      const id=randomUUID();let code='';
      do{code=String(randomInt(100000,1000000));}while(await q.get('SELECT id FROM room WHERE code=?',[code]));
      await q.run('INSERT INTO room(id,owner_id,set_id,title,code,state,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)',[id,owner,set.id,set.title,code,'waiting',this.now(),this.now()+6*3600000]);
      const questions=await q.all('SELECT * FROM question WHERE set_id=? ORDER BY ordinal',[set.id]);
      for(const item of questions)await q.run('INSERT INTO room_question(room_id,ordinal,body) VALUES(?,?,?)',[id,item.ordinal,item.body]);return {id};
    }
    const r=await this.room(q,data.id,owner);
    if(action==='start-room'){
      if(r.state==='running')return {ok:true};
      requireValue(r.state==='waiting','ROOM_NOT_RUNNING','이미 종료된 수업입니다.');
      const count=await q.get('SELECT COUNT(*) AS n FROM team WHERE room_id=?',[r.id]);
      requireValue(Number(count!.n)>0,'NO_TEAMS','한 모둠 이상 입장해야 시작할 수 있습니다.');
      await q.run('UPDATE room SET state=?,started_at=? WHERE id=?',['running',this.now(),r.id]);return {ok:true};
    }
    if(action==='end-room'){
      if(r.state!=='results')await this.end(q,r);return {ok:true};
    }
    if(action==='close-room'){await archiveLearning(q,r,this.now());await q.run('DELETE FROM room WHERE id=?',[r.id]);return {ok:true};}
    throw new AppError('UNKNOWN_ACTION','지원하지 않는 요청입니다.',404);
  });}
  async end(q:Query,r:Row){const now=this.now();await q.run('UPDATE room SET state=?,ended_at=?,expires_at=? WHERE id=?',['results',now,Math.min(Number(r.expires_at),now+30*60000),r.id]);await archiveLearning(q,{...r,ended_at:now},now);}
  async join(code:unknown,name:unknown,account?:{id:string;teacher_id:string}){
    requireValue(typeof code==='string'&&/^\d{6}$/.test(code),'INVALID_CODE','6자리 참여 코드를 입력하세요.');
    const clean=text(name,12);requireValue(clean.length>=2&&clean.length<=12&&!/[\u0000-\u001f\u007f]/.test(clean),'INVALID_NAME','모둠 이름은 2~12자로 입력하세요.');
    return this.store.tx(async q=>{
      const r=await q.get('SELECT * FROM room WHERE code=?',[code]);
      requireValue(r&&Number(r.expires_at)>this.now(),'INVALID_CODE','참여 코드를 확인해 주세요.');
      requireValue(r.state==='waiting','ROOM_NOT_WAITING','이미 시작했거나 종료된 수업입니다.');
      if(account){requireValue(account.teacher_id===r.owner_id,'UNAUTHORIZED','담당 교사의 수업에만 참여할 수 있습니다.',403);requireValue(!await q.get('SELECT team_id FROM student_team WHERE account_id=? AND room_id=?',[account.id,r.id]),'ALREADY_JOINED','이미 참여한 수업입니다. 기존 기기에서 이어서 참여하세요.');}
      const teams=await q.all('SELECT * FROM team WHERE room_id=?',[r.id]);
      requireValue(!teams.some(t=>t.name===clean),'DUPLICATE_NAME','이미 있는 모둠 이름입니다. 기존 기기라면 이어서 참여해 주세요.');
      requireValue(teams.length<6,'ROOM_FULL','6모둠이 모두 입장했습니다.');
      const token=secret(),id=randomUUID();const lane=[1,2,3,4,5,6].find(n=>!teams.some(t=>t.lane===n));
      await q.run('INSERT INTO team(id,room_id,name,lane,token_hash) VALUES(?,?,?,?,?)',[id,r.id,clean,lane,hash(token)]);
      if(account)await q.run('INSERT INTO student_team(account_id,team_id,room_id) VALUES(?,?,?)',[account.id,id,r.id]);
      return {token,id};
    });
  }
  async teamState(token:string){return this.store.tx(async q=>{
    const {t,r}=await this.team(q,token),snap=await this.snapshot(q,r),self=snap.teams.find(x=>x.id===t.id)!;
    const result:any={name:t.name,lane:t.lane,state:r.state,total:snap.total,answered:self.answered,score:self.score,elapsed:self.elapsed,rank:self.rank,finishedAt:self.finishedAt,serverTime:snap.serverTime,expiresAt:snap.expiresAt,ordinal:Number(t.next_ordinal)};
    if(t.feedback_ordinal){
      const item=await q.get('SELECT body FROM room_question WHERE room_id=? AND ordinal=?',[r.id,t.feedback_ordinal]);
      const answer=await q.get('SELECT choice,correct FROM answer WHERE team_id=? AND ordinal=?',[t.id,t.feedback_ordinal]);
      if(item&&answer){const question=JSON.parse(item.body);result.feedback={ordinal:Number(t.feedback_ordinal),correct:!!answer.correct,choice:answer.choice,answer:question.answer,answerText:question.type==='OX'?question.answer:question.options[Number(question.answer)-1],explanation:question.explanation};}
    }
    if(r.state==='running'&&!t.finished_at&&!t.feedback_ordinal){
      const row=await q.get('SELECT body FROM room_question WHERE room_id=? AND ordinal=?',[r.id,t.next_ordinal]);
      const {answer,explanation,...safe}=JSON.parse(row!.body);result.question=safe;
    }
    return result;
  });}
  async submit(token:string,data:any){return this.store.tx(async q=>{
    const {t,r}=await this.team(q,token);
    requireValue(typeof data.requestId==='string'&&/^[0-9a-f-]{36}$/i.test(data.requestId),'INVALID_REQUEST','요청 식별자가 올바르지 않습니다.');
    const previous=await q.get('SELECT * FROM answer WHERE team_id=? AND request_id=?',[t.id,data.requestId]);
    if(previous){requireValue(Number(previous.ordinal)===data.ordinal&&previous.choice===data.choice,'REQUEST_CONFLICT','이미 사용된 요청입니다.');return {ok:true,replayed:true};}
    requireValue(r.state==='running','ROOM_NOT_RUNNING','진행 중인 수업이 아닙니다.');
    requireValue(!t.finished_at&&!t.feedback_ordinal&&data.ordinal===Number(t.next_ordinal),'QUESTION_CONFLICT','문제 상태가 바뀌었습니다. 현재 상태를 다시 확인해 주세요.',409);
    const item=await q.get('SELECT body FROM room_question WHERE room_id=? AND ordinal=?',[r.id,t.next_ordinal]);
    const question=JSON.parse(item!.body);
    requireValue((question.type==='OX'?['O','X']:['1','2','3','4']).includes(data.choice),'INVALID_CHOICE','보기를 선택해 주세요.');
    const acceptedTime=this.now();
    await q.run('INSERT INTO answer(team_id,ordinal,request_id,choice,correct,accepted_at) VALUES(?,?,?,?,?,?)',[t.id,data.ordinal,data.requestId,data.choice,data.choice===question.answer?1:0,acceptedTime]);
    const total=await q.get('SELECT COUNT(*) AS n FROM room_question WHERE room_id=?',[r.id]);const last=data.ordinal===Number(total!.n);
    await q.run('UPDATE team SET next_ordinal=?,feedback_ordinal=?,finished_at=? WHERE id=?',[data.ordinal+1,data.ordinal,last?acceptedTime:null,t.id]);
    const unfinished=await q.get('SELECT COUNT(*) AS n FROM team WHERE room_id=? AND finished_at IS NULL',[r.id]);
    if(!Number(unfinished!.n))await this.end(q,r);return {ok:true};
  });}
  async next(token:string,data:{ordinal:number}){return this.store.tx(async q=>{const {t,r}=await this.team(q,token);
    requireValue(r.state==='running'||r.state==='results','ROOM_NOT_RUNNING','수업이 진행 중이 아닙니다.');
    requireValue(Number.isInteger(data.ordinal)&&data.ordinal>0,'INVALID_REQUEST','이동할 문제 번호를 확인해 주세요.');
    if(Number(t.feedback_ordinal)!==data.ordinal){requireValue(data.ordinal<Number(t.next_ordinal),'QUESTION_CONFLICT','문제 상태를 다시 확인해 주세요.',409);return {ok:true,replayed:true};}
    await q.run('UPDATE team SET feedback_ordinal=NULL WHERE id=?',[t.id]);return {ok:true};
  });}
}
