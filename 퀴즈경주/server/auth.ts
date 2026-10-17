import {scryptSync,timingSafeEqual,randomBytes,randomUUID} from 'node:crypto';
import nodemailer from 'nodemailer';
import type {Store} from './db.ts';
import {secret,hash} from './game.ts';
import {requireValue,text,AppError} from '../shared/rules.ts';
export const SESSION_MS=12*3600000;
export type AuthConfig={supabaseUrl?:string;supabaseKey?:string;teacherEmail?:string;origin:string;smtpUrl?:string;mailFrom?:string;production:boolean};
const passwordHash=(password:string,salt=randomBytes(16).toString('hex'))=>`${salt}:${scryptSync(password,salt,64).toString('hex')}`;
function checkPassword(value:string,stored:string){const [salt,digest]=stored.split(':');const actual=passwordHash(value,salt).split(':')[1];return timingSafeEqual(Buffer.from(actual,'hex'),Buffer.from(digest,'hex'));}
export class Auth {
  store:Store;config:AuthConfig;
  constructor(store:Store,config:AuthConfig){this.store=store;this.config=config;}
  get cloud(){return !!this.config.supabaseUrl;}
  async configured(){return this.cloud||this.store.tx(async q=>!!await q.get('SELECT id FROM teacher LIMIT 1'));}
  credentials(data:any){const email=text(data.email,254).toLowerCase(),password=typeof data.password==='string'?data.password:'';
    requireValue(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),'INVALID_EMAIL','올바른 이메일을 입력하세요.');
    requireValue(password.length>=12&&password.length<=128,'INVALID_PASSWORD','비밀번호는 12~128자로 입력하세요.');return {email,password};}
  async setup(data:any){requireValue(!this.cloud&&!this.config.production,'UNAUTHORIZED','초기 설정을 사용할 수 없습니다.',403);const {email,password}=this.credentials(data);
    return this.store.tx(async q=>{requireValue(!await q.get('SELECT id FROM teacher LIMIT 1'),'ALREADY_CONFIGURED','이미 교사 계정이 등록되어 있습니다.');
      await q.run('INSERT INTO teacher(id,email,password_hash,created_at) VALUES(?,?,?,?)',[randomUUID(),email,passwordHash(password),Date.now()]);return {ok:true};});}
  async supabase(path:string,body?:unknown,token?:string,method='POST'){
    const response=await fetch(`${this.config.supabaseUrl}/auth/v1/${path}`,{method,headers:{apikey:this.config.supabaseKey!,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)});
    requireValue(response.ok,'AUTH_FAILED','인증 요청을 완료하지 못했습니다. 이메일·비밀번호 또는 메일 설정을 확인해 주세요.',401);return response.json();
  }
  async login(data:any){const email=text(data.email,254).toLowerCase(),password=typeof data.password==='string'?data.password:'';
    requireValue(email.length<=254&&password.length<=128,'AUTH_FAILED','이메일 또는 비밀번호를 확인해 주세요.',401);
    let teacher:any;
    if(this.cloud){requireValue(email===this.config.teacherEmail,'AUTH_FAILED','이메일 또는 비밀번호를 확인해 주세요.',401);
      const result=await this.supabase('token?grant_type=password',{email,password});const user=await this.supabase('user',undefined,result.access_token,'GET');
      requireValue(user.email?.toLowerCase()===this.config.teacherEmail,'UNAUTHORIZED','접근 권한이 없습니다.',403);
      teacher=await this.store.tx(async q=>{let item=await q.get('SELECT * FROM teacher WHERE id=?',[user.id]);if(!item){await q.run('INSERT INTO teacher(id,email,created_at) VALUES(?,?,?)',[user.id,email,Date.now()]);item={id:user.id,email};}return item;});
    }else{teacher=await this.store.tx(q=>q.get('SELECT * FROM teacher WHERE email=?',[email]));
      // Run a password derivation even for an unknown email.
      const valid=checkPassword(password,teacher?.password_hash??passwordHash('dummy-password-constant','00000000000000000000000000000000'));
      requireValue(teacher&&valid,'AUTH_FAILED','이메일 또는 비밀번호를 확인해 주세요.',401);
    }
    const token=secret();await this.store.tx(q=>q.run('INSERT INTO teacher_session(token_hash,teacher_id,expires_at) VALUES(?,?,?)',[hash(token),teacher.id,Date.now()+SESSION_MS]));return {token,email:teacher.email};
  }
  async teacher(token:string){requireValue(token&&token.length<=100,'UNAUTHORIZED','교사 로그인이 필요합니다.',401);
    const user=await this.store.tx(q=>q.get('SELECT t.id,t.email FROM teacher_session s JOIN teacher t ON t.id=s.teacher_id WHERE s.token_hash=? AND s.expires_at>?',[hash(token),Date.now()]));
    requireValue(user,'UNAUTHORIZED','로그인 시간이 끝났습니다. 다시 로그인해 주세요.',401);return user;
  }
  async logout(token:string){await this.store.tx(q=>q.run('DELETE FROM teacher_session WHERE token_hash=?',[hash(token)]));}
  async forgot(data:any){
    const email=text(data.email,254).toLowerCase();requireValue(email&&email.length<=254,'INVALID_EMAIL','이메일을 입력하세요.');
    if(this.cloud){if(email===this.config.teacherEmail)await this.supabase(`recover?redirect_to=${encodeURIComponent(this.config.origin+'/teacher?recovery=1')}`,{email});}
    else{
      requireValue(this.config.smtpUrl&&this.config.mailFrom,'MAIL_NOT_CONFIGURED','비밀번호 재설정 메일 발송이 설정되지 않았습니다. 실행 안내의 SMTP 설정을 확인해 주세요.',503);
      const teacher=await this.store.tx(q=>q.get('SELECT id FROM teacher WHERE email=?',[email]));
      if(teacher){const token=secret();await this.store.tx(async q=>{await q.run('DELETE FROM password_reset WHERE teacher_id=?',[teacher.id]);await q.run('INSERT INTO password_reset(token_hash,teacher_id,expires_at) VALUES(?,?,?)',[hash(token),teacher.id,Date.now()+30*60000]);});
        const transport=nodemailer.createTransport(this.config.smtpUrl!);
        await transport.sendMail({from:this.config.mailFrom,to:email,subject:'모둠 퀴즈 레이스 비밀번호 재설정',text:`30분 이내에 아래 주소에서 새 비밀번호를 설정하세요.\n${this.config.origin}/teacher#reset=${token}`});
      }
    }
    return {message:'등록된 교사 이메일이면 재설정 안내가 발송됩니다.'};
  }
  async reset(data:any){const password=typeof data.password==='string'?data.password:'';
    requireValue(password.length>=12&&password.length<=128,'INVALID_PASSWORD','비밀번호는 12~128자로 입력하세요.');
    const token=text(data.token,4096);requireValue(token,'RESET_EXPIRED','재설정 링크가 유효하지 않습니다.');
    if(this.cloud){const user=await this.supabase('user',undefined,token,'GET');requireValue(user.email?.toLowerCase()===this.config.teacherEmail,'UNAUTHORIZED','접근 권한이 없습니다.',403);
      await this.supabase('user',{password},token,'PUT');await this.store.tx(q=>q.run('DELETE FROM teacher_session WHERE teacher_id=?',[user.id]));
    }else await this.store.tx(async q=>{const reset=await q.get('SELECT * FROM password_reset WHERE token_hash=? AND expires_at>?',[hash(token),Date.now()]);
      requireValue(reset,'RESET_EXPIRED','재설정 링크가 만료되었거나 이미 사용되었습니다.');
      await q.run('UPDATE teacher SET password_hash=? WHERE id=?',[passwordHash(password),reset.teacher_id]);
      await q.run('DELETE FROM password_reset WHERE teacher_id=?',[reset.teacher_id]);await q.run('DELETE FROM teacher_session WHERE teacher_id=?',[reset.teacher_id]);
    });return {ok:true};
  }
}
