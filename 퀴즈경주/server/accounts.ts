import {randomUUID,randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
import type {Store,Query} from './db.ts';
import {hash,secret} from './game.ts';
import {requireValue,text} from '../shared/rules.ts';
export const ACCOUNT_SESSION_MS=12*3600000;
const encode=(password:string,salt=randomBytes(16).toString('hex'))=>`${salt}:${scryptSync(password,salt,64).toString('hex')}`;
const dummy=encode('not-a-real-account-password');
function verify(password:string,stored:string){const [salt,digest]=stored.split(':');return timingSafeEqual(Buffer.from(encode(password,salt).split(':')[1],'hex'),Buffer.from(digest,'hex'));}
export function accountInput(data:any){
  const username=text(data.username,24).toLowerCase(),password=typeof data.password==='string'?data.password:'';
  requireValue(/^[a-z0-9][a-z0-9_-]{3,23}$/.test(username),'INVALID_USERNAME','아이디는 영문·숫자·밑줄로 4~24자 입력하세요.');
  requireValue(password.length>=8&&password.length<=128,'INVALID_PASSWORD','비밀번호는 8~128자로 입력하세요.');
  return {username,password};
}
export class Accounts{
  store:Store;
  constructor(store:Store){this.store=store;}
  async register(data:any){const {username,password}=accountInput(data);
    requireValue(['teacher','student'].includes(data.role),'INVALID_ROLE','교사 또는 학생을 선택하세요.');
    // Password derivation is deliberately outside the database transaction.
    const passwordHash=encode(password);
    return this.store.tx(async q=>{
      requireValue(!await q.get('SELECT id FROM account WHERE username=?',[username]),'USERNAME_TAKEN','다른 아이디를 사용해 주세요.');
      let teacherId:string;
      if(data.role==='teacher'){
        teacherId=randomUUID();await q.run('INSERT INTO teacher(id,email,created_at) VALUES(?,?,?)',[teacherId,`${username}@account.invalid`,Date.now()]);
      }else{
        requireValue(typeof data.code==='string'&&/^\d{6}$/.test(data.code),'INVALID_CODE','담당 교사의 6자리 수업 코드를 입력하세요.');
        const room=await q.get('SELECT owner_id FROM room WHERE code=? AND expires_at>? AND state=?',[data.code,Date.now(),'waiting']);
        requireValue(room,'INVALID_CODE','담당 교사에게 현재 수업 코드를 확인해 주세요.');teacherId=room.owner_id;
      }
      const id=randomUUID();await q.run('INSERT INTO account(id,username,password_hash,role,teacher_id,created_at) VALUES(?,?,?,?,?,?)',[id,username,passwordHash,data.role,teacherId,Date.now()]);return {ok:true};
    });
  }
  async login(data:any){const username=text(data.username,24).toLowerCase(),password=typeof data.password==='string'&&data.password.length<=128?data.password:'';
    const user=await this.store.tx(q=>q.get('SELECT * FROM account WHERE username=?',[username]));
    const valid=verify(password,user?.password_hash??dummy);requireValue(user&&valid,'UNAUTHORIZED','아이디 또는 비밀번호를 확인하세요.',401);
    return this.store.tx(async q=>{const token=secret();await q.run('INSERT INTO account_session(token_hash,account_id,expires_at) VALUES(?,?,?)',[hash(token),user.id,Date.now()+ACCOUNT_SESSION_MS]);return {token,role:user.role,username:user.username};});
  }
  async user(token:string){requireValue(token&&token.length<=100,'UNAUTHORIZED','먼저 아이디로 로그인하세요.',401);
    const user=await this.store.tx(q=>q.get('SELECT a.id,a.username,a.role,a.teacher_id FROM account a JOIN account_session s ON s.account_id=a.id WHERE s.token_hash=? AND s.expires_at>?',[hash(token),Date.now()]));
    requireValue(user,'UNAUTHORIZED','로그인 시간이 끝났습니다. 다시 로그인하세요.',401);return user;
  }
  async logout(token:string){await this.store.tx(q=>q.run('DELETE FROM account_session WHERE token_hash=?',[hash(token)]));}
  async history(id:string){return this.store.tx(q=>q.all('SELECT id,title,team_name,score,total,answered,elapsed_ms,finished_at FROM learning_record WHERE account_id=? ORDER BY finished_at DESC LIMIT 200',[id]));}
  async roster(teacherId:string){return this.store.tx(q=>q.all("SELECT a.id,a.username,COUNT(r.id) AS lessons,COALESCE(SUM(r.score),0) AS correct FROM account a LEFT JOIN learning_record r ON r.account_id=a.id WHERE a.teacher_id=? AND a.role='student' GROUP BY a.id,a.username ORDER BY a.username",[teacherId]));}
  async reset(teacherId:string,id:string,password:string){requireValue(typeof password==='string'&&password.length>=8&&password.length<=128,'INVALID_PASSWORD','새 비밀번호는 8~128자입니다.');const value=encode(password);
    return this.store.tx(async q=>{requireValue(await q.get("SELECT id FROM account WHERE id=? AND teacher_id=? AND role='student'",[id,teacherId]),'UNAUTHORIZED','담당 학생만 관리할 수 있습니다.',403);
      await q.run('UPDATE account SET password_hash=? WHERE id=?',[value,id]);await q.run('DELETE FROM account_session WHERE account_id=?',[id]);await q.run('DELETE FROM student_team WHERE account_id=?',[id]);return {ok:true};});
  }
}
export async function archiveLearning(q:Query,room:any,now:number){
  if(!room.started_at)return;
  const total=Number((await q.get('SELECT COUNT(*) AS n FROM room_question WHERE room_id=?',[room.id]))!.n);
  const rows=await q.all('SELECT a.account_id,t.id,t.name,t.finished_at,COUNT(v.ordinal) AS answered,COALESCE(SUM(v.correct),0) AS score FROM team t JOIN student_team a ON a.team_id=t.id LEFT JOIN answer v ON v.team_id=t.id WHERE t.room_id=? GROUP BY a.account_id,t.id,t.name,t.finished_at',[room.id]);
  for(const row of rows)await q.run('INSERT INTO learning_record(id,account_id,room_id,title,team_name,score,total,answered,elapsed_ms,finished_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(account_id,room_id) DO NOTHING',[randomUUID(),row.account_id,room.id,room.title,row.name,Number(row.score),total,Number(row.answered),Math.max(0,Number(row.finished_at??room.ended_at??now)-Number(room.started_at)),Number(room.ended_at??now)]);
}
