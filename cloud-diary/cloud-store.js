import {getFirestore,collection,query,orderBy,limit,getDocsFromServer,doc,addDoc,updateDoc,deleteDoc,getDocFromServer,serverTimestamp} from 'firebase/firestore';
import {app,auth} from './firebase-client.js';
const db=getFirestore(app); // Default memory cache; never enable persistent disk cache for diaries.
function validate(value){
  const {date,title,mood,content}=value;
  if(typeof date!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||typeof title!=='string'||!title.trim()||title.length>120||typeof content!=='string'||!content.trim()||content.length>100000||!['좋음','평온','보통','지침','속상'].includes(mood))throw Error('날짜·제목·내용을 확인해 주세요.');
  return {date,title:title.trim(),mood,content};
}
const entry=snapshot=>{const data=snapshot.data();return {id:snapshot.id,...data,updated:data.updatedAt?.toDate().toISOString()??''};};
export async function diaryApi(path='',method='GET',body){
  const uid=auth.currentUser?.uid;if(!uid)throw Error('먼저 Google 계정으로 로그인해 주세요.');
  const entries=collection(db,'users',uid,'entries');
  const id=path.slice(1);if(path&&!/^[a-zA-Z0-9]{20}$/.test(id))throw Error('일기 식별자가 올바르지 않습니다.');
  if(method==='GET')return (await getDocsFromServer(query(entries,orderBy('date','desc'),orderBy('updatedAt','desc'),limit(200)))).docs.map(entry);
  if(method==='DELETE'){await deleteDoc(doc(entries,id));return {ok:true};}
  const data={...validate(body),updatedAt:serverTimestamp()};
  const target=method==='POST'?await addDoc(entries,{...data,createdAt:serverTimestamp()}):doc(entries,id);
  if(method==='PUT')await updateDoc(target,data);
  return entry(await getDocFromServer(target));
}
