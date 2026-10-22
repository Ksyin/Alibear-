const U = (id,w=700)=>`https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=70`;
const DEFAULT={products:[
{id:1,name:'Fingerprint Smart Door Lock',cat:'Smart Locks',price:18500,old:24000,img:U('photo-1558002038-1055907df827'),desc:'Fingerprint, PIN, card & app unlock with tamper alarm.',flash:1},
{id:2,name:'Wi-Fi Keyless Entry Lock',cat:'Smart Locks',price:14900,old:19000,img:U('photo-1558618666-fcd25c85cd64'),desc:'Remote guest codes and entry logs.',flash:1},
{id:3,name:'Smart Home Starter Kit',cat:'Smart Systems',price:32000,old:40000,img:U('photo-1558089687-f282ffcbc126'),desc:'Hub, 2 sensors, 2 smart plugs and app control.',flash:1},
{id:4,name:'Full Home Automation System',cat:'Smart Systems',price:95000,old:120000,img:U('photo-1600585154340-be6161a56a0c'),desc:'Lights, locks, cameras & scenes in one app.'},
{id:5,name:'HD Night-Vision Security Camera',cat:'Cameras',price:6500,old:8500,img:U('photo-1557597774-9d273605dfa9'),desc:'1080p, motion alerts, two-way audio.',flash:1},
{id:6,name:'Smart Video Doorbell',cat:'Cameras',price:11800,old:14500,img:U('photo-1558002038-1055907df827'),desc:'See and talk to visitors from anywhere.'},
{id:7,name:'Smart LED Bulbs (4-pack)',cat:'Lighting',price:3200,old:4200,img:U('photo-1493663284031-b7e3aefcae8e'),desc:'Dimmable, colour, voice & app control.'},
{id:8,name:'Solar Smart Controller',cat:'Energy',price:15500,old:19000,img:U('photo-1509391366360-2e959784a276'),desc:'Monitor and optimise solar usage.'},
{id:9,name:'Door/Window Sensor Set',cat:'Sensors',price:2800,old:3600,img:U('photo-1518770660439-4636190af475'),desc:'Instant open/close alerts to your phone.'},
{id:10,name:'Smart Plug (2-pack)',cat:'Energy',price:2400,old:3000,img:U('photo-1558089687-f282ffcbc126'),desc:'Schedule appliances and track power.'}],
blog:[{t:'5 Reasons to Install a Smart Lock',x:'No more lost keys. Share temporary codes with guests and see who comes and goes.',d:'Oct 2026',img:U('photo-1558002038-1055907df827',500)},{t:'Cut your KPLC bill with smart plugs',x:'Schedule appliances off at peak times and watch consumption drop.',d:'Sep 2026',img:U('photo-1509391366360-2e959784a276',500)}],
news:[{t:'New Westlands showroom opens',x:'Visit us for a live smart-home demo.',d:'Oct 2026',img:U('photo-1560448204-e02f11c3d0e2',500)},{t:'Free installation now in Mombasa',x:'Certified technicians now cover the coast.',d:'Oct 2026',img:U('photo-1600585154340-be6161a56a0c',500)}],
enquiries:[]};
const DEFAULT_JOURNAL=[...DEFAULT.blog.map(item=>({...item,type:'Guide'})),...DEFAULT.news.map(item=>({...item,type:'News'}))].map((item,index)=>({id:`sample-${index}`,...item}));
DEFAULT.journal=DEFAULT_JOURNAL;
const Store={load(){try{const d=JSON.parse(localStorage.getItem('ah'));if(d&&d.products)return{...d,journal:d.journal||[...(d.blog||[]).map(item=>({...item,type:'Guide'})),...(d.news||[]).map(item=>({...item,type:'News'}))].map((item,index)=>({id:`legacy-${index}`,...item}))}}catch(e){}return structuredClone(DEFAULT)},save(d){try{localStorage.setItem('ah',JSON.stringify(d));return 1}catch(e){alert('Storage full – use smaller images or URLs');return 0}}};
const $=i=>document.getElementById(i),K=n=>'KSh '+Number(n).toLocaleString(),esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const PH=n=>'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="450"><rect width="100%" height="100%" fill="#e9edf7"/><text x="50%" y="50%" fill="#0a1f5c" font-family="Arial" font-size="24" text-anchor="middle">${esc(n)}</text></svg>`);
const IM=(s,a)=>`<img src="${esc(s)}" alt="${esc(a)}" loading="lazy" onerror="this.onerror=null;this.src=PH(this.alt)">`;
const toast=m=>{const t=$('ts');t.textContent=m;t.style.display='block';clearTimeout(toast.t);toast.t=setTimeout(()=>t.style.display='none',2200)};
