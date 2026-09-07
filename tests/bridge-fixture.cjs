// Ponte real congelada; a árvore atual contém o app v2.
const {execFileSync}=require('node:child_process');
const cache=new Map();
const bridgeCommit='7c75410';
function bridgeFile(file){
  if(!cache.has(file)){
    try { cache.set(file,execFileSync('git',['-c',`safe.directory=${process.cwd().replaceAll('\\','/')}`,'show',`${bridgeCommit}:${file}`],{stdio:['ignore','pipe','ignore']})); }
    catch {cache.set(file,null);}
  }
  return cache.get(file);
}
module.exports={bridgeFile,bridgeCommit};
