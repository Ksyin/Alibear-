import{auth,database,ref,get,update,onAuthStateChanged,authenticatedRequest}from'/firebase-client.js';

const params=new URLSearchParams(location.search);
const editing=params.get('edit')==='1';
const fileName=location.pathname.split('/').pop()||'index.html';
const page=fileName.replace(/\.html$/,'')==='index'?'home':fileName.replace(/\.html$/,'');
const ROOTS='#site-header,#site-footer,main';

const slug=value=>value.normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9_-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,90)||'text';
function rootKey(node){const element=node.nodeType===Node.TEXT_NODE?node.parentElement:node,root=element?.closest(ROOTS);if(root?.id==='site-header')return'header';if(root?.id==='site-footer')return'footer';return page}
const scopeOf=node=>['header','footer'].includes(rootKey(node))?'shared':page;

// Path segments from an element up to (not including) its root. Wrapper spans are ignored when counting siblings.
function segmentsFor(owner,root){
  const segments=[];let current=owner;
  while(current&&current!==root){
    const identity=current.id||[...current.classList].filter(name=>name!=='rv'&&name!=='on'&&!name.startsWith('ed-')).slice(0,2).join('-');
    const siblings=[...current.parentElement.children].filter(el=>el.tagName===current.tagName&&!el.hasAttribute('data-content-key')),position=siblings.indexOf(current)+1;
    segments.unshift(`${slug(identity||current.tagName.toLowerCase())}_${position}`);
    current=current.parentElement;
  }
  return segments;
}
function nodeKey(node){
  const owner=node.parentElement,root=owner?.closest(ROOTS);
  if(!owner||!root)return null;
  const segments=segmentsFor(owner,root);
  const textNodes=[...owner.childNodes].filter(child=>child.nodeType===Node.TEXT_NODE&&child.nodeValue.trim());
  return`${rootKey(node)}_${segments.join('_')}_t${textNodes.indexOf(node)}`;
}
function elemKey(el){
  const root=el.closest(ROOTS);
  if(!root||el===root||el.hasAttribute('data-content-key'))return null;
  return`${rootKey(el)}_e_${segmentsFor(el,root).join('_')}`;
}
function ignored(node){return!!node.parentElement.closest('script,style,svg,textarea,input,select,option,code,pre,.p,.post,[data-content-ignore]')}

function wrapText(){
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),nodes=[];
  while(walker.nextNode()){const node=walker.currentNode;if(node.nodeValue.trim()&&!ignored(node)&&node.parentElement&&!node.parentElement.closest('[data-content-key]'))nodes.push(node)}
  const keyed=nodes.map(node=>[node,nodeKey(node)]);
  for(const[node,key]of keyed){if(!key)continue;const span=document.createElement('span');span.dataset.contentKey=key;node.parentNode.replaceChild(span,node);span.append(node)}
}
function annotateAttributes(){
  document.querySelectorAll('input[placeholder],textarea[placeholder],img[alt],[aria-label]').forEach((element,index)=>{
    if(element.closest('[data-content-ignore]'))return;
    for(const attribute of['placeholder','alt','aria-label']){
      if(!element.hasAttribute(attribute))continue;
      const key=`${rootKey(element)}_attribute_${slug(element.id||element.getAttribute('name')||element.tagName.toLowerCase())}_${attribute}_${index}`;
      element.setAttribute(`data-content-key-${attribute}`,key);
    }
  });
}

const safeUrl=value=>/^(https?:\/\/|\/|mailto:|tel:|#)[^\s"'()<>\\]*$/i.test(value);
const safeImage=value=>/^(https?:\/\/|\/)[^\s"'()<>\\]*$/i.test(value);
function elementMap(){
  const map=new Map();
  document.querySelectorAll('#site-header *,#site-footer *,main *').forEach(el=>{
    if(el.hasAttribute('data-content-key')||/^(SCRIPT|STYLE)$/.test(el.tagName))return;
    const key=elemKey(el);if(key)map.set(key,el);
  });
  return map;
}
function applyElement(el,kind,value){
  if(typeof value!=='string')return;
  if(kind==='src'&&el.tagName==='IMG'&&safeImage(value)){el.removeAttribute('srcset');el.src=value}
  else if(kind==='bg'&&safeImage(value))el.style.backgroundImage=`url("${value}")`;
  else if(kind==='href'&&safeUrl(value))el.setAttribute('href',value);
  else if(kind==='hide'){if(value==='1'){editing?el.classList.add('ed-hidden'):el.style.display='none'}else{el.classList.remove('ed-hidden');if(!editing)el.style.removeProperty('display')}}
}
function applyValues(shared,local){
  const value=key=>shared[key]??local[key];
  document.querySelectorAll('[data-content-key]').forEach(el=>{const v=value(el.dataset.contentKey);if(typeof v==='string')el.textContent=v});
  document.querySelectorAll('[data-content-key-placeholder],[data-content-key-alt],[data-content-key-aria-label]').forEach(el=>['placeholder','alt','aria-label'].forEach(attribute=>{const key=el.getAttribute(`data-content-key-${attribute}`);if(key){const v=value(key);if(typeof v==='string')el.setAttribute(attribute,v)}}));
  const keys=new Set([...Object.keys(shared),...Object.keys(local)]);
  if([...keys].some(key=>/^(src|href|bg|hide)_/.test(key))){
    const map=elementMap();
    for(const key of keys){const m=key.match(/^(src|href|bg|hide)_(.+)$/);if(!m)continue;const el=map.get(m[2]);if(el)applyElement(el,m[1],value(key))}
  }
}

wrapText();annotateAttributes();

async function loadAndApply(){
  try{
    const[shared,local]=await Promise.all([get(ref(database,'siteContent/shared')),get(ref(database,`siteContent/${page}`))]);
    applyValues(shared.val()||{},local.val()||{});
  }catch(error){console.error('Could not load editable store content:',error)}
}

if(!editing){
  loadAndApply();
}else{
  document.documentElement.classList.add('content-editing');
  const label=document.createElement('div');
  label.className='edit-mode-label';
  label.textContent='Checking admin access…';
  document.body.prepend(label);

  const say=text=>{label.textContent=text;try{parent.postMessage({type:'aurum-editor-status',text},location.origin)}catch{}};
  const timers=new Map();
  function save(scope,key,value){
    if(!/^[a-z0-9_-]{1,700}$/.test(key))return say('That element cannot be saved.');
    say('Saving…');
    clearTimeout(timers.get(scope+key));
    timers.set(scope+key,setTimeout(()=>update(ref(database,`siteContent/${scope}`),{[key]:value}).then(()=>say('All changes saved')).catch(error=>say(`Could not save: ${error.message}`)),400));
  }

  let tools,selected=null,hovered=null;
  const mark=(el,cls,on)=>el&&el.classList.toggle(cls,on);

  function bgOf(el){return el&&/url\(/.test(getComputedStyle(el).backgroundImage)?el:null}
  function attrOf(el){return['placeholder','alt','aria-label'].find(name=>el.hasAttribute(`data-content-key-${name}`))}

  async function uploadImage(file){
    if(!file)throw new Error('Choose an image.');
    if(file.size>8*1024*1024)throw new Error('Image must be smaller than 8 MB.');
    if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Use a JPG, PNG or WebP image.');
    const signing=await authenticatedRequest('/api/cloudinary-sign',{method:'POST',body:'{}'});
    const form=new FormData();
    form.append('file',file);form.append('api_key',signing.apiKey);form.append('timestamp',String(signing.timestamp));form.append('signature',signing.signature);form.append('folder',signing.folder);
    const response=await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(signing.cloudName)}/image/upload`,{method:'POST',body:form});
    const result=await response.json();
    if(!response.ok||!result.secure_url)throw new Error(result.error?.message||'Image upload failed.');
    return result.secure_url;
  }
  function setImage(el,kind,url){
    if(!safeImage(url))return say('Use a full https:// image address.');
    applyElement(el,kind,url);
    const key=elemKey(el);if(key)save(scopeOf(el),`${kind}_${key}`,url);
  }
  function chooseImage(el,kind){
    const input=document.createElement('input');input.type='file';input.accept='image/jpeg,image/png,image/webp';
    input.onchange=async()=>{try{say('Uploading image…');setImage(el,kind,await uploadImage(input.files[0]))}catch(error){say(error.message)}};
    input.click();
  }
  function editLink(a){
    const value=prompt('Link address (e.g. /products.html, https://…, tel:+254…, mailto:…):',a.getAttribute('href')||'');
    if(value===null)return;
    const clean=value.trim();
    if(!safeUrl(clean))return say('That link is not allowed. Use /page.html, https://, tel: or mailto:.');
    a.setAttribute('href',clean);
    const key=elemKey(a);if(key)save(scopeOf(a),`href_${key}`,clean);
  }
  function editAttributes(el){
    for(const name of['placeholder','alt','aria-label']){
      const key=el.getAttribute(`data-content-key-${name}`);if(!key)continue;
      const value=prompt(`Edit ${name.replace('-',' ')}:`,el.getAttribute(name)||'');
      if(value===null)continue;
      el.setAttribute(name,value);save(scopeOf(el),key,value);
    }
  }
  function toggleHide(el){
    const key=elemKey(el);if(!key)return say('This element cannot be hidden.');
    const hide=!el.classList.contains('ed-hidden');
    el.classList.toggle('ed-hidden',hide);
    save(scopeOf(el),`hide_${key}`,hide?'1':'0');
    showTools(el);
  }
  function resetElement(el){
    const key=elemKey(el);if(!key)return;
    if(!confirm('Undo image, link and visibility changes on this element and reload?'))return;
    update(ref(database,`siteContent/${scopeOf(el)}`),{[`src_${key}`]:null,[`href_${key}`]:null,[`bg_${key}`]:null,[`hide_${key}`]:null}).then(()=>location.reload()).catch(error=>say(`Could not reset: ${error.message}`));
  }
  function openDashboard(tab){try{parent.postMessage({type:'aurum-open-dashboard',tab},location.origin)}catch{}}

  function showTools(el){
    selected=el;
    document.querySelectorAll('.ed-selected').forEach(node=>node.classList.remove('ed-selected'));
    mark(el,'ed-selected',true);
    tools.innerHTML='';
    const add=(text,fn,title)=>{const button=document.createElement('button');button.type='button';button.textContent=text;if(title)button.title=title;button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();fn()});tools.append(button)};
    const product=el.closest('.p'),post=el.closest('.post');
    if(product||post){
      add(product?'Edit products →':'Edit journal →',()=>openDashboard(product?'Products':'Journal'));
    }else{
      const parentEl=el.parentElement;
      if(parentEl&&parentEl.closest(ROOTS)&&!parentEl.matches(ROOTS))add('↑ Parent',()=>showTools(parentEl),'Select the element around this one');
      const a=el.closest('a');
      if(a)add('Edit link',()=>editLink(a));
      if(el.tagName==='IMG'){add('Change image',()=>chooseImage(el,'src'));add('Image URL',()=>{const v=prompt('Image address (https://…):',el.currentSrc||el.src);if(v)setImage(el,'src',v.trim())})}
      else if(bgOf(el)){add('Change background',()=>chooseImage(el,'bg'));add('Background URL',()=>{const v=prompt('Image address (https://…):','');if(v)setImage(el,'bg',v.trim())})}
      if(attrOf(el))add('Edit description',()=>editAttributes(el));
      if(elemKey(el)){add(el.classList.contains('ed-hidden')?'Show':'Hide',()=>toggleHide(el));add('Reset',()=>resetElement(el))}
    }
    const rect=el.getBoundingClientRect();
    tools.style.display='flex';
    const top=Math.max(rect.top+scrollY-tools.offsetHeight-8,scrollY+4);
    tools.style.top=`${top}px`;
    tools.style.left=`${Math.max(4,Math.min(rect.left+scrollX,document.documentElement.clientWidth-tools.offsetWidth-4))}px`;
  }

  let enabled=false;
  async function enableEditing(user){
    if(enabled)return;
    if(!user){say('Sign in on the admin page to edit this website.');return}
    try{
      const token=await user.getIdTokenResult();
      if(token.claims.admin!==true){say('This account is not an administrator.');return}
    }catch(error){say('Could not confirm administrator access.');return}

    enabled=true;
    tools=document.createElement('div');tools.className='ed-tools';tools.style.display='none';document.body.append(tools);
    await loadAndApply();

    document.querySelectorAll('[data-content-key]').forEach(el=>{
      el.contentEditable='true';el.spellcheck=true;
      el.addEventListener('input',()=>save(scopeOf(el),el.dataset.contentKey,el.textContent));
      el.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();el.blur()}});
      el.addEventListener('paste',event=>{event.preventDefault();document.execCommand('insertText',false,(event.clipboardData||window.clipboardData).getData('text/plain').replace(/\s+/g,' '))});
    });
    document.querySelectorAll('input[data-content-key-placeholder]').forEach(el=>el.classList.add('content-attribute-editable'));

    document.addEventListener('click',event=>{
      if(tools.contains(event.target))return;
      const target=event.target;
      event.preventDefault();event.stopPropagation();
      const text=target.closest('[data-content-key]');
      const el=text?text.parentElement:target;
      if(!el||el===document.body||el===document.documentElement||!el.closest(`${ROOTS},.ed-tools`)){tools.style.display='none';return}
      showTools(el);
    },true);
    document.addEventListener('submit',event=>event.preventDefault(),true);
    document.addEventListener('mouseover',event=>{if(tools.contains(event.target))return;mark(hovered,'ed-hover',false);hovered=event.target.closest('[data-content-key]')?null:event.target;mark(hovered,'ed-hover',true)});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'){tools.style.display='none';selected?.classList.remove('ed-selected')}});
    say('Click any text to type. Click an image, button, section or link to change, hide or re-link it. Changes save automatically.');
  }
  onAuthStateChanged(auth,enableEditing);
}
