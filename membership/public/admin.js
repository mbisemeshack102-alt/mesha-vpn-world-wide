'use strict';
const $=id=>document.getElementById(id);
const TOKEN_KEY='kem_admin_session';
function headers(){return {'content-type':'application/json','authorization':'Bearer '+(sessionStorage.getItem(TOKEN_KEY)||'')}}
async function request(url,options={}){const r=await fetch(url,{...options,headers:{...headers(),...(options.headers||{})}});const data=await r.json();if(!r.ok)throw Error(data.error||'Ombi limeshindikana');return data}
$('unlock').addEventListener('click',async()=>{
  const pin=$('pin').value.trim();
  if(!/^\d{6}$/.test(pin)){$('status').textContent='PIN iwe na tarakimu 6.';return}
  try{
    const r=await fetch('/api/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pin})});
    const d=await r.json();if(!r.ok)throw Error(d.error||'PIN haijakubaliwa');
    sessionStorage.setItem(TOKEN_KEY,d.token);$('pin').value='';$('status').textContent='Admin imefunguliwa kwa dakika 30.';
    $('load').click();
  }catch(e){$('status').textContent=e.message}
});
$('lock').addEventListener('click',()=>{sessionStorage.removeItem(TOKEN_KEY);$('status').textContent='Admin imefungwa.'});
$('load').addEventListener('click',async()=>{try{const d=await request('/api/admin/settings');const p=d.payment||{};$('lipa').value=p.airtelLipaNumber||'';$('recipient').value=p.recipientName||'';$('instructions').value=p.instructions||'';document.querySelectorAll('#methods input').forEach(c=>c.checked=(p.enabledMethods||[]).includes(c.value));$('plans').value=JSON.stringify(d.plans||{},null,2);$('status').textContent='Mipangilio imefunguliwa.'}catch(e){$('status').textContent=e.message}});
$('save').addEventListener('click',async()=>{try{const plans=JSON.parse($('plans').value);const enabledMethods=[...document.querySelectorAll('#methods input:checked')].map(c=>c.value);const data={payment:{airtelLipaNumber:$('lipa').value,recipientName:$('recipient').value,instructions:$('instructions').value,enabledMethods},plans};const result=await request('/api/admin/settings',{method:'PUT',body:JSON.stringify(data)});$('status').textContent=result.message||'Imehifadhiwa.'}catch(e){$('status').textContent='Hitilafu: '+e.message}});
