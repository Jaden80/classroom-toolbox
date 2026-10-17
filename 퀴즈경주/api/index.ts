// A single shared handler preserves the existing server's raw HTTP body parsing.
import type {IncomingMessage,ServerResponse} from 'node:http';
const ready=import('../server/index.ts');
export default async function handler(req:IncomingMessage,res:ServerResponse){
  const {server}=await ready;
  await new Promise<void>(resolve=>{
    res.once('finish',resolve);res.once('close',resolve);
    server.emit('request',req,res);
  });
}
