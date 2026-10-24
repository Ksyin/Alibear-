import{auth,database,ref,get,onAuthStateChanged,signOut,ensureAdmin}from'/firebase-client.js';
const $=id=>document.getElementById(id);
const PAGES=[['home','index.html','Home'],['products','products.html','Shop'],['product','product.html','Product page'],['deals','deals.html','Offers'],['how-it-works','how-it-works.html','How it works'],['app-page','app-page.html','App page'],['about','about.html','About'],['blog','blog.html','Journal'],['news','news.html','News'],['contact','contact.html','Contact'],['account','account.html','Customer account'],['checkout','checkout.html','Checkout']];
const select=$('editor-page'),frame=$('editor-frame'),status=$('editor-status');
select.innerHTML=PAGES.map(([key,,label])=>`<option value="${key}">${label}</option>`).join('');
const requested=new URLSearchParams(location.search).get('page');
select.value=PAGES.some(([key])=>key===requested)?requested:'home';

async function pageUrl(key){
  const file=PAGES.find(([k])=>k===key)[1];
  let query='edit=1';
  if(key==='product'){
    try{const snapshot=await get(ref(database,'products')),first=Object.values(snapshot.val()||{})[0];query=`id=${encodeURIComponent(first?.id||1)}&edit=1`}catch{query='id=1&edit=1'}
  }
  return{edit:`/${file}?${query}`,live:`/${file}`};
}
async function open(key){
  const url=await pageUrl(key);
  status.textContent='Loading page…';
  frame.src=url.edit;
  $('editor-live').href=url.live.replace('product.html','product.html?id=1');
  history.replaceState(null,'',`/editor.html?page=${key}`);
}
select.addEventListener('change',()=>open(select.value));
document.querySelectorAll('[data-width]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-width]').forEach(b=>b.classList.toggle('on',b===button));$('editor-wrap').style.width=button.dataset.width}));
window.addEventListener('message',event=>{
  if(event.origin!==location.origin)return;
  if(event.data?.type==='aurum-editor-status')status.textContent=event.data.text;
  if(event.data?.type==='aurum-open-dashboard')location.href=`/admin.html?dashboard=1&tab=${encodeURIComponent(event.data.tab||'Products')}`;
});
frame.addEventListener('load',()=>{if(status.textContent==='Loading page…')status.textContent='Ready'});
$('editor-signout').addEventListener('click',()=>signOut(auth).finally(()=>location.replace('/admin.html')));

let started=false;
onAuthStateChanged(auth,async user=>{
  if(started)return;
  if(!user)return location.replace('/admin.html');
  try{
    let token=await user.getIdTokenResult(true);
    if(token.claims.admin!==true){await ensureAdmin();token=await user.getIdTokenResult(true)}
    if(token.claims.admin!==true)throw new Error('not admin');
  }catch{return location.replace('/admin.html')}
  started=true;
  open(select.value);
});
