(function(){
'use strict';
const STORE='honeymoon_aes_gcm_v1',OLD=['honeymoon_cache_2026_v1','honeymoon_queue_2026_v1'];
const te=new TextEncoder(),td=new TextDecoder();
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b)));
const un64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
let key=null,salt=null,data={},queue=Promise.resolve(),lastError=null;
async function derive(pass,s){
 const material=await crypto.subtle.importKey('raw',te.encode(pass),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',salt:s,iterations:310000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function seal(){
 if(!key)throw Error('잠금 상태');
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,te.encode(JSON.stringify(data)));
 localStorage.setItem(STORE,JSON.stringify({v:1,salt:b64(salt),iv:b64(iv),cipher:b64(cipher)}));
}
async function open(pass){
 if(!isSecureContext||!crypto.subtle)throw Error('이 브라우저에서는 안전한 암호화가 지원되지 않습니다.');
 if(pass.length<12)throw Error('잠금 암호는 최소 12자여야 합니다.');
 const raw=localStorage.getItem(STORE);
 if(raw){
  try{
   const record=JSON.parse(raw);if(record.v!==1)throw Error('format');
   salt=un64(record.salt);key=await derive(pass,salt);
   const decrypted=await crypto.subtle.decrypt({name:'AES-GCM',iv:un64(record.iv)},key,un64(record.cipher));
   data=JSON.parse(td.decode(decrypted));if(!data||typeof data!=='object'||Array.isArray(data))throw Error('format');
  }catch(e){key=null;data={};throw Error('잠금 암호가 틀리거나 저장 데이터가 손상되었습니다.');}
 }else{salt=crypto.getRandomValues(new Uint8Array(16));key=await derive(pass,salt);data={};}
 let changed=!raw;
 for(const k of OLD){const v=localStorage.getItem(k);if(v!==null){if(data[k]===undefined){try{data[k]=JSON.parse(v);changed=true}catch(e){}}}}
 if(changed)await seal();
 for(const k of OLD)localStorage.removeItem(k);
 lastError=null;
}
function get(k){return key&&Object.prototype.hasOwnProperty.call(data,k)?structuredClone(data[k]):null;}
function set(k,v){
 if(!key)return false;
 try{data[k]=structuredClone(v);queue=queue.catch(()=>{}).then(()=>seal()).then(()=>{lastError=null},e=>{lastError=e;});return true}
 catch(e){lastError=e;return false}
}
async function flush(){await queue;if(lastError)throw Error('암호화 저장 실패: '+lastError.message);return true}
function reset(){
 if(!confirm('기기에 저장된 오프라인 변경이 사라집니다. 서버의 원본 시트는 유지됩니다. 계속할까요?'))return;
 if(!confirm('정말 초기화할까요? 동기화 전 변경은 복구되지 않습니다.'))return;
 localStorage.removeItem(STORE);for(const k of OLD)localStorage.removeItem(k);location.reload();
}
function boot(start){
 const hasVault=!!localStorage.getItem(STORE);
 const gate=document.createElement('div');
 gate.style.cssText='position:fixed;inset:0;z-index:999999;background:#edf3f5;display:flex;align-items:center;justify-content:center;padding:16px';
 const card=document.createElement('form');
 card.style.cssText='width:min(460px,100%);background:white;border-radius:18px;box-shadow:0 14px 38px #193b4830;padding:26px;color:#18333f;font:14px system-ui';
 const heading=document.createElement('h2');heading.textContent=hasVault?'개인 오프라인 데이터 잠금 해제':'개인 오프라인 데이터 보호 설정';
 const p=document.createElement('p');p.textContent='일정·예약정보·체크리스트는 이 기기에 AES-256-GCM으로 암호화 저장됩니다. 12자 이상의 기기용 암호를 사용하세요.';
 const input=document.createElement('input');input.type='password';input.minLength=12;input.required=true;input.autocomplete='off';input.placeholder='기기용 잠금 암호 (12자 이상)';input.style.cssText='width:100%;box-sizing:border-box;padding:13px;margin:12px 0;border:1px solid #9dbac0;border-radius:9px';
 const confirmInput=document.createElement('input');confirmInput.type='password';confirmInput.minLength=12;confirmInput.required=!hasVault;confirmInput.placeholder='잠금 암호 확인';confirmInput.autocomplete='off';confirmInput.style.cssText=input.style.cssText;if(hasVault)confirmInput.hidden=true;
 const submit=document.createElement('button');submit.type='submit';submit.textContent=hasVault?'잠금 해제':'암호화 보관함 만들기';submit.style.cssText='background:#087d82;color:white;border:0;border-radius:10px;padding:13px;width:100%;font-weight:750';
 const err=document.createElement('p');err.style.color='#b23246';err.setAttribute('role','alert');
 const note=document.createElement('p');note.textContent='암호는 서버에 저장되지 않습니다. 잊으면 이 기기의 오프라인 데이터와 미동기화 항목을 복구할 수 없습니다.';note.style.cssText='font-size:12px;line-height:1.7;color:#6b7c83';
 card.append(heading,p,input,confirmInput,submit,err,note);
 if(hasVault){const resetButton=document.createElement('button');resetButton.type='button';resetButton.textContent='이 기기의 오프라인 데이터 초기화';resetButton.style.cssText='border:0;background:none;text-decoration:underline;color:#61747a;font-size:12px';resetButton.addEventListener('click',reset);card.append(resetButton);}
 card.addEventListener('submit',async event=>{
  event.preventDefault();err.textContent='';
  if(!hasVault&&input.value!==confirmInput.value){err.textContent='확인 암호가 다릅니다.';return;}
  submit.disabled=true;try{await open(input.value);input.value='';confirmInput.value='';gate.remove();start();}
  catch(e){err.textContent=e.message;}finally{submit.disabled=false;}
 });
 gate.append(card);document.body.append(gate);
}
window.HoneymoonVault=Object.freeze({boot,get,set,flush,unlocked:()=>!!key});
})();