import{database,ref,onValue}from'/firebase-client.js';

const defaults={theme:'#efb022',primary:'#17283f',logoText:'Alibear Automation',logoImage:'',heroImages:[]};
function safeUrl(value){return typeof value==='string'&&/^(https?:\/\/|\/)/.test(value)}
function apply(settings){
  const theme=settings.theme||defaults.theme,primary=settings.primary||defaults.primary;
  document.documentElement.style.setProperty('--g',theme);
  document.documentElement.style.setProperty('--g2',theme);
  document.documentElement.style.setProperty('--b1',primary);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',primary);
  if(safeUrl(settings.logoImage))document.querySelectorAll('.logo').forEach(logo=>{logo.innerHTML=`<img src="${settings.logoImage}" alt="${settings.logoText||defaults.logoText}" style="height:38px;width:auto;display:block;object-fit:contain">`;logo.classList.add('logo-image')});
  if(settings.logoText)document.querySelectorAll('.logo:not(.logo-image)').forEach(logo=>{const parts=settings.logoText.trim().split(/\s+/);logo.innerHTML=`${parts.shift()}<span>${parts.join(' ')}</span>`});
  if(Array.isArray(settings.heroImages)&&settings.heroImages.length){document.querySelectorAll('.hero-home #sl .s').forEach((slide,index)=>{if(safeUrl(settings.heroImages[index]))slide.style.backgroundImage=`url("${settings.heroImages[index]}")`});}
}
onValue(ref(database,'siteSettings'),snapshot=>apply({...defaults,...(snapshot.val()||{})}));
