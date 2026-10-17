import {mkdir,copyFile,cp,writeFile} from 'node:fs/promises';
const root = new URL('../', import.meta.url), target = new URL('../_site/', import.meta.url);
await mkdir(target,{recursive:true});
for(const name of ['index.html','app.js','style.css','icon.svg']) await copyFile(new URL(name,root),new URL(name,target));
for(const name of ['js','vendor']) await cp(new URL(name,root),new URL(name,target),{recursive:true});
await writeFile(new URL('.nojekyll',target),'');
console.log('GitHub Pages: public assets only → _site');
