let D=Store.load(),cart=[],cat='All',kw='';try{cart=JSON.parse(sessionStorage.getItem('cart'))||[]}catch(e){}
const card=p=>{const off=p.old?Math.round((1-p.price/p.old)*100):0;return `<article class="p">${off?`<span class="bd">-${off}%</span>`:''}<div class="pi">${IM(p.img,p.alt||p.name)}<div class="p-reveal"><div class="st">★★★★☆ <span>(${20+p.id%90} reviews)</span></div><p>${esc(p.desc)}</p><button class="btn gold" onclick="add(${p.id})">Add to cart</button></div></div><h3>${esc(p.name)}</h3><small class="p-description">${esc(p.desc)}</small><div class="pr">${K(p.price)}${p.old?`<s>${K(p.old)}</s>`:''}</div><div class="st">★★★★☆ <span style="color:var(--m)">(${20+p.id%90})</span></div><button class="btn gold" onclick="add(${p.id})">Add to cart</button></article>`};
const posts=a=>a.map(x=>`<div class="post card">${x.img?IM(x.img,x.t):''}<div><small>${esc(x.d)}</small><h3>${esc(x.t)}</h3><p>${esc(x.x)}</p></div></div>`).join('')||'<p style="padding:12px">Nothing yet.</p>';
function R(){const ps=D.products.filter(p=>(cat=='All'||p.cat==cat)&&(!kw||(p.name+p.cat+p.desc).toLowerCase().includes(kw)));
$('pg').innerHTML=ps.map(card).join('')||'<p style="padding:20px">No products found.</p>';$('fg').innerHTML=D.products.filter(p=>p.flash).map(card).join('');
$('fl').innerHTML=['All',...new Set(D.products.map(p=>p.cat))].map(c=>`<button class="${c==cat?'on':''}" onclick="F('${esc(c)}')">${esc(c)}</button>`).join('');
$('cats').innerHTML=[...new Set(D.products.map(p=>p.cat))].map(c=>`<a href="#products" onclick="F('${esc(c)}')">${esc(c)}</a>`).join('')+'<a href="#products" onclick="F(\'All\')"><b>All products</b></a>';
$('bl').innerHTML=posts(D.blog);$('nw').innerHTML=posts(D.news)}
const F=c=>{cat=c;kw='';R()};const S=e=>{e.preventDefault();kw=$('q').value.toLowerCase();cat='All';R();location.hash='#products'};
function add(id){const i=cart.find(x=>x.id==id);i?i.q++:cart.push({id,q:1});CR();toast('Added to cart ✔')}
function CR(){sessionStorage.setItem('cart',JSON.stringify(cart));const L=cart.map(c=>({...D.products.find(p=>p.id==c.id),q:c.q})).filter(x=>x.name);$('cc').textContent=cart.reduce((a,b)=>a+b.q,0);
$('ci').innerHTML=L.map(x=>`<div class="ci">${IM(x.img,x.name)}<span>${esc(x.name)}<br><b>${K(x.price)}</b></span><button class="q" onclick="ch(${x.id},-1)">−</button>${x.q}<button class="q" onclick="ch(${x.id},1)">+</button></div>`).join('')||'<p style="margin:14px 0">Your cart is empty.</p>';
$('ct').textContent='Total: '+K(L.reduce((a,b)=>a+b.price*b.q,0))}
function ch(id,d){const i=cart.find(x=>x.id==id);i.q+=d;if(i.q<1)cart=cart.filter(x=>x!=i);CR()}
const C=o=>{$('dr').classList.toggle('on',!!o);$('ov').classList.toggle('on',!!o)};
function O(){if(!cart.length)return toast('Cart is empty');if(!$('cn').value||!$('cp').value)return toast('Enter name & phone');D=Store.load();D.enquiries.unshift({n:$('cn').value,c:$('cp').value,m:'ORDER: '+$('ct').textContent+' ('+cart.length+' items)',d:new Date().toLocaleString()});Store.save(D);cart=[];CR();C(0);toast('Order placed! We will call you 🎉')}
function E(){if(!$('en').value||!$('em').value)return toast('Fill name and message');D=Store.load();D.enquiries.unshift({n:$('en').value,c:$('ee').value,m:$('em').value,d:new Date().toLocaleString()});Store.save(D);['en','ee','em'].forEach(i=>$(i).value='');toast('Enquiry sent ✔')}
let si=0;const ss=[...document.querySelectorAll('.s')];$('dt').innerHTML=ss.map((_,i)=>`<i role="button" tabindex="0" aria-label="Show slide ${i+1}" onclick="go(${i})" onkeydown="if(event.key=='Enter'||event.key==' '){event.preventDefault();go(${i})}"></i>`).join('');
const go=i=>{si=(i+ss.length)%ss.length;ss.forEach((s,j)=>s.classList.toggle('on',j==si));[...$('dt').children].forEach((d,j)=>{d.classList.toggle('on',j==si);d.setAttribute('aria-current',j==si?'true':'false')})};
document.querySelector('.slide-control.prev').addEventListener('click',()=>go(si-1));document.querySelector('.slide-control.next').addEventListener('click',()=>go(si+1));go(0);
let slideTimer=setInterval(()=>go(si+1),5000);$('sl').addEventListener('mouseenter',()=>clearInterval(slideTimer));$('sl').addEventListener('mouseleave',()=>{clearInterval(slideTimer);slideTimer=setInterval(()=>go(si+1),5000)});$('sl').addEventListener('focusin',()=>clearInterval(slideTimer));$('sl').addEventListener('focusout',e=>{if(!$('sl').contains(e.relatedTarget)){clearInterval(slideTimer);slideTimer=setInterval(()=>go(si+1),5000)}});
setInterval(()=>{const n=new Date,e=new Date(n);e.setHours(23,59,59);const s=Math.floor((e-n)/1e3),p=x=>String(x).padStart(2,'0');$('h').textContent=p(s/3600|0);$('mi').textContent=p(s%3600/60|0);$('se').textContent=p(s%60)},1000);
const io=new IntersectionObserver(a=>a.forEach(x=>x.isIntersecting&&x.target.classList.add('on')),{threshold:.08});document.querySelectorAll('.rv').forEach(e=>io.observe(e));
const say=(t,c)=>{const d=document.createElement('div');d.className='m '+c;d.textContent=t;$('cm').appendChild(d);$('cm').scrollTop=1e5};
function bot(q){q=q.toLowerCase();const f=D.products.find(p=>q.split(/\W+/).some(w=>w.length>3&&(p.name+p.cat).toLowerCase().includes(w)));
if(/^(hi|hello|hey|jambo)/.test(q))return'Hello! 👋 Ask me about locks, systems, prices, delivery or installation.';
if(/how|work|install/.test(q))return'Choose a product → order (M-Pesa or on delivery) → free professional installation → connect to our app.';
if(/deliver|ship/.test(q))return'Nairobi within 24 hours, countrywide in 2–4 days. Free delivery over KSh 5,000 in Nairobi.';
if(/pay|mpesa|m-pesa/.test(q))return'We accept M-Pesa, cards and cash on delivery.';
if(/warrant|return/.test(q))return'All devices carry a 2-year warranty and easy returns.';
if(/app/.test(q))return'The AurumHome app controls locks, cameras and lights. See the app section on this page.';
if(/contact|phone|call|where|location/.test(q))return'Call +254 700 000 000 or email hello@aurumhome.co.ke.';
if(f)return`${f.name} – ${K(f.price)}. ${f.desc} Add it to your cart from the Products section.`;
if(/price|cost|cheap|much/.test(q))return'Popular prices: '+D.products.slice(0,4).map(p=>p.name+' '+K(p.price)).join('; ')+'.';
return'I can help with products, prices, delivery, payment and installation. For anything else, use the Enquiries form.'}
const Q=t=>{say(t,'u');setTimeout(()=>say(bot(t),'b'),500)};const Z=e=>{e.preventDefault();const v=$('ci2').value.trim();if(v){$('ci2').value='';Q(v)}};
say('Hi! I’m the AurumHome assistant. How can I help with your smart home?','b');R();CR();
