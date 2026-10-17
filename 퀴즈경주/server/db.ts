
import {mkdirSync,readFileSync} from 'node:fs';
import {dirname} from 'node:path';
import pg from 'pg';
export type Row=Record<string,any>;
export interface Query {all(sql:string,args?:any[]):Promise<Row[]>;get(sql:string,args?:any[]):Promise<Row|undefined>;run(sql:string,args?:any[]):Promise<void>;}
export interface Store {tx<T>(fn:(q:Query)=>Promise<T>):Promise<T>;close():Promise<void>;kind:string;}
const schema=readFileSync(new URL('./schema.sql',import.meta.url),'utf8');
export async function openStore(path='data/quiz.sqlite',connection?:string):Promise<Store>{
  if(connection){
    if(process.env.NODE_ENV==='production'&&(process.env.PGSSL==='disable'||/[?&]sslmode=(disable|no-verify|allow|prefer)(?:&|$)/i.test(connection)))throw new Error('운영 PostgreSQL은 인증서 검증이 필요합니다.');
    const connectionUrl=new URL(connection);
    // pg connection-string SSL options override the explicit ssl object. Remove
    // them so production always verifies the provider's certificate.
    for(const option of ['sslmode','sslcert','sslkey','sslrootcert'])connectionUrl.searchParams.delete(option);
    const pool=new pg.Pool({connectionString:connectionUrl.toString(),max:4,connectionTimeoutMillis:10000,idleTimeoutMillis:20000,ssl:process.env.PGSSL==='disable'?false:{rejectUnauthorized:true,...(process.env.PGSSL_CA?{ca:process.env.PGSSL_CA}:{})}});
    const client=await pool.connect();
    try{await client.query('CREATE SCHEMA IF NOT EXISTS quiz_private');await client.query('SET search_path TO quiz_private');await client.query(schema);
      await client.query('REVOKE ALL ON SCHEMA quiz_private FROM PUBLIC');
      await client.query('REVOKE ALL ON ALL TABLES IN SCHEMA quiz_private FROM PUBLIC');
      for(const table of ['teacher','teacher_session','password_reset','quiz_set','question','room','room_question','team','answer','request_limit','account','account_session','student_team','learning_record'])await client.query(`ALTER TABLE quiz_private.${table} ENABLE ROW LEVEL SECURITY`);
    }finally{client.release();}
    return {kind:'postgres',async tx(fn){const c=await pool.connect();try{await c.query('BEGIN');await c.query('SET LOCAL search_path TO quiz_private');
      // Single-teacher application: cross-process advisory lock serializes all state transitions.
      await c.query('SELECT pg_advisory_xact_lock(731904217)');
      const query=async(sql:string,args:any[]=[])=>{let i=0;return c.query(sql.replace(/\?/g,()=>`$${++i}`),args);};
      const q:Query={all:async(s,a)=>(await query(s,a)).rows,get:async(s,a)=>(await query(s,a)).rows[0],run:async(s,a)=>{await query(s,a);}};
      const value=await fn(q);await c.query('COMMIT');return value;
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}},async close(){await pool.end();}};
  }
  if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});
  const {DatabaseSync}=await import('node:sqlite');
  const db=new DatabaseSync(path);db.exec('PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON; PRAGMA journal_mode=DELETE;');db.exec(schema);
  let chain=Promise.resolve();
  return {kind:'sqlite',tx<T>(fn:(q:Query)=>Promise<T>):Promise<T>{
    const operation=chain.then(async()=>{db.exec('BEGIN IMMEDIATE');const q:Query={
      all:async(s,a=[])=>db.prepare(s).all(...a) as Row[],get:async(s,a=[])=>db.prepare(s).get(...a) as Row|undefined,run:async(s,a=[])=>{db.prepare(s).run(...a);}
    };try{const result=await fn(q);db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}});
    chain=operation.then(()=>{},()=>{});return operation;
  },async close(){await chain;db.close();}};
}
