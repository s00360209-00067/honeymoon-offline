const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');

const source=fs.readFileSync('vault.js','utf8');
function instance(initial={}){
 const map=new Map(Object.entries(initial));
 const localStorage={getItem(k){return map.has(k)?map.get(k):null},setItem(k,v){map.set(k,String(v))},removeItem(k){map.delete(k)}};
 const window={};
 const context={window,crypto:webcrypto,TextEncoder,TextDecoder,structuredClone,isSecureContext:true,localStorage,btoa,atob,console};
 const modified=source.replace('window.HoneymoonVault=Object.freeze','window.__testOpen=open;window.HoneymoonVault=Object.freeze');
 assert.notEqual(modified,source,'vault needs test harness injection');
 vm.runInNewContext(modified,context,{filename:'vault.js'});
 return {vault:window.HoneymoonVault,open:window.__testOpen,map,localStorage};
}

test('AES-256-GCM vault encrypts private records and survives a restart',async()=>{
 const a=instance();await a.open('secure device passphrase with words');
 assert.equal(a.vault.set('honeymoon_cache_2026_v1',{guests:['Guest A'],notes:'sensitive-example-842'}),true);
 await a.vault.flush();
 const serialized=a.localStorage.getItem('honeymoon_aes_gcm_v1');
 assert.ok(serialized);assert.ok(!serialized.includes('Guest A'));assert.ok(!serialized.includes('sensitive-example-842'));
 assert.equal(JSON.parse(serialized).v,1);assert.ok(JSON.parse(serialized).cipher);
 const b=instance(Object.fromEntries(a.map));await b.open('secure device passphrase with words');
 assert.equal(b.vault.get('honeymoon_cache_2026_v1').notes,'sensitive-example-842');
 assert.equal(b.vault.get('honeymoon_cache_2026_v1').guests[0],'Guest A');
});
test('Incorrect passphrase cannot decrypt saved personal records',async()=>{
 const a=instance();await a.open('secure device passphrase with words');
 a.vault.set('sensitive',{value:'one'});await a.vault.flush();
 const b=instance(Object.fromEntries(a.map));
 await assert.rejects(b.open('an incorrect 12 character password'));
 assert.equal(b.vault.get('sensitive'),null);
});
test('Legacy plaintext cache and queue are migrated and deleted',async()=>{
 const old={'honeymoon_cache_2026_v1':JSON.stringify({tasks:[{id:'T001',title:'private data'}],packing:[]}),
'honeymoon_queue_2026_v1':JSON.stringify([{kind:'task',id:'T001',value:'완료'}])};
 const a=instance(old);await a.open('secure device passphrase with words');
 assert.equal(a.localStorage.getItem('honeymoon_cache_2026_v1'),null);
 assert.equal(a.localStorage.getItem('honeymoon_queue_2026_v1'),null);
 assert.equal(a.vault.get('honeymoon_cache_2026_v1').tasks[0].title,'private data');
 assert.ok(!a.localStorage.getItem('honeymoon_aes_gcm_v1').includes('private data'));
});
test('Static PWA ships only generic content and caches vault for offline restart',()=>{
 const html=fs.readFileSync('index.html','utf8'),worker=fs.readFileSync('sw.js','utf8');
 for(const secret of ['광현','진옥','Kwanghyun','Jinok','2026-11-07','2026-11-17','9259898','89PCAL','gh9503@gmail.com'])assert.equal(html.includes(secret),false,secret+' in public HTML');
 assert.ok(html.includes('HoneymoonVault.boot(init)'));
 assert.ok(worker.includes("'./vault.js'"));
 assert.ok(!html.includes('localStorage.setItem(key,JSON.stringify(value))'));
 const inline=html.match(/<script>\s*([\s\S]*?)<\/script>/);
 assert.ok(inline);new vm.Script(inline[1]);new vm.Script(fs.readFileSync('vault.js','utf8'));new vm.Script(worker);
});
