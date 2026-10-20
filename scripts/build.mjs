import { mkdir, rm, copyFile, cp, readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
await rm('dist', {recursive:true, force:true});
await mkdir('dist', {recursive:true});
for (const file of ['index.html','styles.css','manifest.webmanifest','sw.js']) await copyFile(file, `dist/${file}`);
await cp('src','dist/src',{recursive:true});
await cp('public/icons','dist/icons',{recursive:true});
await copyFile('.nojekyll','dist/.nojekyll');
const hash=createHash('sha256');
async function digest(directory) {
  for(const entry of (await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
    const file=directory+'/'+entry.name;
    if(entry.isDirectory())await digest(file);else{hash.update(file);hash.update(await readFile(file));}
  }
}
await digest('dist');
const buildId=hash.digest('hex').slice(0,16);
await writeFile('dist/sw.js',(await readFile('sw.js','utf8')).replace('__BUILD_ID__',buildId));
console.log(`Built static PWA ${buildId} in dist/ (no production dependencies).`);
