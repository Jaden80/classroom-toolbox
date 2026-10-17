import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDiary} from '../diary-store.mjs';
test('diary persists Korean text, updates and deletes; rejects invalid fields',()=>{const dir=mkdtempSync(join(tmpdir(),'diary-'));let db;try{const file=join(dir,'diary.sqlite');db=openDiary(file);const value={date:'2026-10-17',title:'오늘의 기록',mood:'평온',content:'한글과 이모지 🌷\n두 번째 줄'};const e=db.save(value);db.close();db=openDiary(file);assert.equal(db.list()[0].content,value.content);db.save({...value,title:'수정'},e.id);assert.equal(db.list().length,1);assert.equal(db.list()[0].title,'수정');assert.throws(()=>db.save({...value,date:'2026-02-30'}));assert.throws(()=>db.save({...value,title:''}));assert.equal(db.save(value,'missing'),null);assert.equal(db.remove(e.id),1);assert.equal(db.list().length,0);}finally{db?.close();rmSync(dir,{recursive:true,force:true});}});
