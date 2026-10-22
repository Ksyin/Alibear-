const PASSWORD='admin123'; // CHANGE THIS before deploying
let D=Store.load(),tab='Products',ok=sessionStorage.getItem('adm')=='1';
const login=()=>{if($('pw').value===PASSWORD){ok=1;sessionStorage.setItem('adm','1');draw()}else toast('Wrong password')};
const logout=()=>{sessionStorage.removeItem('adm');ok=0;draw()};
const sv=()=>{Store.save(D);draw()};
function shrink(file,cb){const r=new FileReader();r.onload=()=>{const i=new Image();i.onload=()=>{const s=Math.min(1,700/i.width),c=document.createElement('canvas');c.width=i.width*s;c.height=i.height*s;c.getContext('2d').drawImage(i,0,0,c.width,c.height);cb(c.toDataURL('image/jpeg',.75))};i.src=r.result};r.readAsDataURL(file)}
function addProduct(){const name=$('an').value,price=+$('ap').value;if(!name||!price)return toast('Name and price required');
const go=img=>{D.products.unshift({id:Date.now()%1e9,name,cat:$('ac').value||'General',price,old:+$('ao').value||0,img:img||PH(name),alt:$('aa').value||name,desc:$('ad').value||'Smart home device',flash:$('af').checked});sv();toast('Product published ✔')};
const f=$('afile').files[0];f?shrink(f,go):go($('au').value)}
const addPost=k=>{if(!$('pt').value)return toast('Title required');const go=img=>{D[k].unshift({t:$('pt').value,x:$('px').value,d:new Date().toLocaleDateString(),img});sv();toast('Published ✔')};const f=$('pf').files[0];f?shrink(f,go):go($('pu').value)};
function draw(){$('lg').style.display=ok?'none':'block';$('pn').style.display=ok?'block':'none';if(!ok)return;
$('stt').innerHTML=[['Products',D.products.length,'grad'],['Blog posts',D.blog.length,'gold'],['News',D.news.length,'grad'],['Enquiries & orders',D.enquiries.length,'gold']].map(x=>`<div class="${x[2]}"><b>${x[1]}</b>${x[0]}</div>`).join('');
$('tb').innerHTML=['Products','Blog','News','Enquiries'].map(t=>`<button class="${t==tab?'on':''}" onclick="tab='${t}';draw()">${t}</button>`).join('');
let h='';const del=(a,i)=>`<button class="btn" style="padding:4px 10px;background:#c0392b;color:#fff" onclick="D.${a}.splice(${i},1);sv()">Delete</button>`;
if(tab=='Products')h=`<div class="fm card"><h3>Post a product</h3><input id="an" placeholder="Product name"><input id="ac" placeholder="Category (Smart Locks, Cameras…)"><input id="ap" type="number" placeholder="Price (KSh)"><input id="ao" type="number" placeholder="Old price (optional)"><input id="au" placeholder="Image URL (https://… or images/lock.jpg)"><label>…or upload photo <input id="afile" type="file" accept="image/*"></label><input id="aa" placeholder="Image description (alt text)"><textarea id="ad" rows="3" placeholder="Description"></textarea><label><input type="checkbox" id="af" style="width:auto"> Show in Flash Sales</label><br><br><button class="btn gold" onclick="addProduct()">Publish product</button></div><table>${D.products.map((p,i)=>`<tr><td>${IM(p.img,p.name)}</td><td>${esc(p.name)}</td><td>${esc(p.cat)}</td><td>${K(p.price)}</td><td>${del('products',i)}</td></tr>`).join('')}</table>`;
else if(tab=='Enquiries')h=`<table><tr><th>Date</th><th>Name</th><th>Contact</th><th>Message</th><th></th></tr>${D.enquiries.map((x,i)=>`<tr><td>${esc(x.d)}</td><td>${esc(x.n)}</td><td>${esc(x.c)}</td><td>${esc(x.m)}</td><td>${del('enquiries',i)}</td></tr>`).join('')}</table>`;
else{const k=tab=='Blog'?'blog':'news';h=`<div class="fm card"><h3>Post ${tab}</h3><input id="pt" placeholder="Title"><textarea id="px" rows="4" placeholder="Content"></textarea><input id="pu" placeholder="Image URL (optional)"><input id="pf" type="file" accept="image/*"><button class="btn gold" onclick="addPost('${k}')">Publish</button></div><table>${D[k].map((x,i)=>`<tr><td>${x.img?IM(x.img,x.t):''}</td><td>${esc(x.t)}</td><td>${esc(x.d)}</td><td>${del(k,i)}</td></tr>`).join('')}</table>`}
$('tc').innerHTML=h}
draw();
