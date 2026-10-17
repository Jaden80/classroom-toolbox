import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,updateDoc,deleteDoc,collection,query,limit,getDocs,serverTimestamp} from 'firebase/firestore';
const env=await initializeTestEnvironment({projectId:'demo-classroom-diary',firestore:{host:'127.0.0.1',port:18080,rules:await readFile(new URL('firestore.rules',import.meta.url),'utf8')}});
const claims={firebase:{sign_in_provider:'google.com'}};
const alice=env.authenticatedContext('alice',claims).firestore(),bob=env.authenticatedContext('bob',claims).firestore(),guest=env.unauthenticatedContext().firestore();
const data=()=>({date:'2026-10-17',title:'합성 일기',mood:'평온',content:'보안 규칙 검증 전용',createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
try{
 await env.clearFirestore();const a=doc(alice,'users/alice/entries/test');
 await assertSucceeds(setDoc(a,data()));
 await assertSucceeds(getDoc(a));
 await assertFails(getDoc(doc(bob,'users/alice/entries/test')));
 await assertFails(getDoc(doc(guest,'users/alice/entries/test')));
 await assertFails(setDoc(doc(bob,'users/alice/entries/other'),data()));
 await assertFails(updateDoc(a,{content:'다른 필드 추가',owner:'bob',updatedAt:serverTimestamp()}));
 await assertFails(updateDoc(a,{title:'',updatedAt:serverTimestamp()}));
 await assertFails(updateDoc(a,{content:'x'.repeat(100001),updatedAt:serverTimestamp()}));
 await assertFails(updateDoc(a,{createdAt:new Date(0),updatedAt:serverTimestamp()}));
 await assertFails(updateDoc(a,{mood:'invalid',updatedAt:serverTimestamp()}));
 await assertSucceeds(updateDoc(a,{title:'수정 확인',updatedAt:serverTimestamp()}));
 await assertSucceeds(getDocs(query(collection(alice,'users/alice/entries'),limit(200))));
 await assertFails(getDocs(collection(alice,'users/alice/entries')));
 await assertFails(getDocs(query(collection(bob,'users/alice/entries'),limit(200))));
 await assertFails(setDoc(doc(env.authenticatedContext('alice').firestore(),'users/alice/entries/not-google'),data()));
 await assertFails(deleteDoc(doc(bob,'users/alice/entries/test')));
 await assertSucceeds(deleteDoc(a));
 console.log('PASS 17 rules checks: owner CRUD, cross-user and anonymous denial, field limits, immutable timestamps, Google-only and bounded lists.');
}finally{await env.cleanup();}
