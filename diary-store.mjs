import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
export function openDiary(filename){
 mkdirSync(dirname(filename),{recursive:true});
 const db=new DatabaseSync(filename);
 db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS entries (id TEXT PRIMARY KEY,date TEXT NOT NULL,title TEXT NOT NULL,mood TEXT NOT NULL,content TEXT NOT NULL,updated TEXT NOT NULL)');
 return {close:()=>db.close(),list:()=>db.prepare('SELECT * FROM entries ORDER BY date DESC, updated DESC').all(),save(value,id){
  const {date,title,mood,content}=value;
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date).toISOString().slice(0,10)!==date||typeof title!=='string'||!title.trim()||title.length>120||typeof content!=='string'||!content.trim()||content.length>100000||!['좋음','평온','보통','지침','속상'].includes(mood))throw Error('날짜, 제목(120자 이내), 기분, 내용(10만 자 이내)을 확인해 주세요.');
  if(id&&!db.prepare('SELECT id FROM entries WHERE id=?').get(id))return null;
  const entry={id:id??randomUUID(),date,title:title.trim(),mood,content,updated:new Date().toISOString()};
  db.prepare('INSERT INTO entries VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET date=excluded.date,title=excluded.title,mood=excluded.mood,content=excluded.content,updated=excluded.updated').run(entry.id,date,entry.title,mood,content,entry.updated);return entry;
 },remove:id=>db.prepare('DELETE FROM entries WHERE id=?').run(id).changes};
}
