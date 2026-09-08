// Ponte real congelada; a árvore atual contém o app v2.
const {execFileSync}=require('node:child_process');
const cache=new Map();
const bridgeCommit='7c75410';
function versionFile(commit,file){
  const key=`${commit}:${file}`;
  if(!cache.has(key)){
    try { cache.set(key,execFileSync('git',['-c',`safe.directory=${process.cwd().replaceAll('\\','/')}`,'show',key],{stdio:['ignore','pipe','ignore']})); }
    catch {cache.set(key,null);}
  }
  return cache.get(key);
}
const bridgeFile=file=>versionFile(bridgeCommit,file);
module.exports={bridgeFile,bridgeCommit,versionFile};
