/* =====================================================================
   Manos que Hablan · Prototipo LSC ⇄ Español
   Datos en localStorage (solo prototipo). En producción: backend + BD.
   ===================================================================== */
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const store={get:(k,d)=>JSON.parse(localStorage.getItem(k)||JSON.stringify(d)),set:(k,v)=>localStorage.setItem(k,JSON.stringify(v))};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let session=store.get('lsc_session',null);
const users=()=>store.get('lsc_users',[]);
/* ---------- AUTENTICACIÓN (demo) ---------- */
async function hash(t) { // SHA-256; en producción hashear en el servidor (bcrypt/argon2)
  if (!crypto.subtle) return btoa(t);
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
let registering = false;
function setAuthMode(reg) {
  registering = reg;
  $('#authTitle').textContent = reg ? 'Crear cuenta' : 'Iniciar sesión';
  $('#aName').hidden = $('#aRole').hidden = !reg;
  $('#authToggle').textContent = reg ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate';
}
$('#authToggle').onclick = () => setAuthMode(!registering);
$('#authForm').onsubmit = async e => {
  e.preventDefault();
  const us = users(), email = $('#aEmail').value.trim().toLowerCase(), pass = await hash($('#aPass').value);
  if (registering) {
    if (us.some(u => u.email === email)) return $('#authMsg').textContent = 'Ese correo ya existe.';
    const u = { id: Date.now(), name: $('#aName').value.trim() || 'Usuario', email, pass, role: $('#aRole').value };
    us.push(u); store.set('lsc_users', us); session = { id: u.id, name: u.name, role: u.role };
  } else {
    const u = us.find(x => x.email === email && x.pass === pass);
    if (!u) return $('#authMsg').textContent = 'Correo o contraseña incorrectos.';
    session = { id: u.id, name: u.name, role: u.role };
  }
  store.set('lsc_session', session); $('#authMsg').textContent = ''; renderAuth(); location.hash = '#traductor'; route();
};
function renderAuth() {
  $('#authArea').innerHTML = session
    ? `<span class="text-white me-2">${session.role === 'sordo' ? '🧏' : '👂'} ${esc(session.name)}</span><button class="btn btn-sm btn-outline-light" id="logout">Salir</button>`
    : `<a class="btn btn-sm btn-mint" href="#login">Entrar</a>`;
  const lo = $('#logout'); if (lo) lo.onclick = () => { session = null; localStorage.removeItem('lsc_session'); renderAuth(); location.hash = '#inicio'; };
}

/* ---------- MOTOR DE TRADUCCIÓN (reglas) ----------
   LSC = Sujeto-Objeto-Verbo (verbo en infinitivo, pregunta al final)
   ES  = Sujeto-Verbo-Objeto (verbo conjugado)
   Presente: [yo, tú, él/ella, nosotros]                                  */
const VERBS = {
  comer: ['como', 'comes', 'come', 'comemos'], beber: ['bebo', 'bebes', 'bebe', 'bebemos'],
  querer: ['quiero', 'quieres', 'quiere', 'queremos'], tener: ['tengo', 'tienes', 'tiene', 'tenemos'],
  ir: ['voy', 'vas', 'va', 'vamos'], ver: ['veo', 'ves', 've', 'vemos'],
  necesitar: ['necesito', 'necesitas', 'necesita', 'necesitamos'], saber: ['sé', 'sabes', 'sabe', 'sabemos'],
  comprar: ['compro', 'compras', 'compra', 'compramos'], estar: ['estoy', 'estás', 'está', 'estamos'], ser: ['soy', 'eres', 'es', 'somos'], vivir: ['vivo', 'vives', 'vive', 'vivimos'], trabajar: ['trabajo', 'trabajas', 'trabaja', 'trabajamos'], estudiar: ['estudio', 'estudias', 'estudia', 'estudiamos'], hablar: ['hablo', 'hablas', 'habla', 'hablamos'], ayudar: ['ayudo', 'ayudas', 'ayuda', 'ayudamos']
};
const PRON = { yo: 0, 'tú': 1, tu: 1, 'él': 2, el: 2, ella: 2, nosotros: 3 };
const PRON_ES = ['yo', 'tú', 'él', 'nosotros'], PRON_LSC = ['YO', 'TÚ', 'ÉL', 'NOSOTROS'];
const NOUNS = { pan: 'el', agua: 'el', casa: 'la', baño: 'el', ayuda: 'la', comida: 'la', familia: 'la', amigo: 'el', escuela: 'la', trabajo: 'el', libro: 'el', leche: 'la', café: 'el', dinero: 'el', médico: 'el' };
const withArt = (w, dest) => !NOUNS[w] ? w : dest ? (NOUNS[w] === 'el' ? 'al ' : 'a la ') + w : NOUNS[w] + ' ' + w;
const QW = ['qué', 'dónde', 'quién', 'cuándo', 'cómo', 'cuánto', 'porqué'];
const STOP = ['el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'a', 'al', 'en', 'por', 'para', 'con'];
const clean = t => t.toLowerCase().replace(/por qué/g, 'porqué').replace(/[¿?¡!.,;:]/g, ' ').split(/\s+/).filter(Boolean);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

function lscToEs(text) { // Sordo (SOV) → Oyente (SVO)
  const isQ = /\?/.test(text); let toks = clean(text);
  const q = toks.find(w => QW.includes(w)); toks = toks.filter(w => w !== q);
  const vi = toks.findIndex(w => VERBS[w]);
  if (vi < 0) return cap(text.trim()); // sin verbo reconocido → texto tal cual
  const before = toks.slice(0, vi), after = toks.slice(vi + 1);
  const isPron = before.length && PRON[before[0]] !== undefined;
  const person = isPron ? PRON[before[0]] : 2, subj = before[0] || '';
  const isIr = toks[vi] === 'ir', obj = before.slice(1).concat(after).map((w, i) => withArt(w, isIr && i === 0)), verb = VERBS[toks[vi]][person];
  const subjTxt = isPron ? (q || isQ ? '' : subj) : withArt(subj);
  const body = q ? [q, verb, isPron ? '' : subjTxt, ...obj] : [subjTxt, verb, ...obj];
  const s = body.filter(Boolean).join(' ');
  return q || isQ ? `¿${cap(s)}?` : cap(s) + '.';
}
function esToLsc(text) { // Oyente (SVO) → Sordo (SOV)
  const isQ = /[¿?]/.test(text); let toks = clean(text).filter(w => !STOP.includes(w));
  const q = toks.find(w => QW.includes(w)); toks = toks.filter(w => w !== q);
  let inf = null, person = 2, vi = -1;
  toks.forEach((w, i) => { for (const [v, f] of Object.entries(VERBS)) { const p = f.indexOf(w); if (p >= 0 && vi < 0) { inf = v; person = p; vi = i; } } });
  if (!inf) return text.trim().toUpperCase();
  const before = toks.slice(0, vi), after = toks.slice(vi + 1);
  const subj = before.length ? (before[0].toUpperCase()) : PRON_LSC[person];
  const obj = before.slice(1).concat(after).map(w => w.toUpperCase());
  const out = [subj, ...obj, inf.toUpperCase()]; if (q) out.push(q === 'porqué' ? 'POR QUÉ' : q.toUpperCase()); else if (isQ) out.push('?');
  return out.join(' ');
}

/* ---------- IA (opcional) ----------
   Conecta un endpoint PROPIO (backend) que llame a la API de Claude.
   Nunca pongas la API key en el frontend.                                  */
const AI = { endpoint: null /* ej: '/api/translate' */ };
async function aiRefine(text, dir, fallback) {
  if (!AI.endpoint) return fallback;
  try {
    const r = await fetch(AI.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, dir }) }); // dir: 'lsc2es' | 'es2lsc'
    return (await r.json()).result || fallback;
  } catch { return fallback; }
}


/* ---------- CHATS: varios por usuario, invitar amigos, eliminar ---------- */
const CK='lsc_chats',chats=()=>store.get(CK,[]);let activeChat=null;
const mine=()=>chats().filter(c=>c.members.includes(session.id));
const uname=id=>(users().find(u=>u.id===id)||{name:'Usuario'}).name;
function createChat(title){const c=chats();const n={id:Date.now(),title,owner:session.id,members:[session.id],msgs:[]};c.push(n);store.set(CK,c);activeChat=n.id}
function patchChat(id,fn){const c=chats();const x=c.find(k=>k.id===id);if(x)fn(x);store.set(CK,c)}
async function send(text){
  if(!text.trim())return;let sordo,oyente;
  if(session.role==='sordo'){sordo=text;oyente=await aiRefine(text,'lsc2es',lscToEs(text))}else{oyente=text;sordo=await aiRefine(text,'es2lsc',esToLsc(text))}
  patchChat(activeChat,c=>c.msgs.push({uid:session.id,from:session.role,sordo,oyente,t:Date.now()}));renderTrad()}
function renderTrad(){
  if(!mine().length)createChat('Mi primer chat');
  const list=mine();if(!list.find(c=>c.id===activeChat))activeChat=list[0].id;
  const c=list.find(k=>k.id===activeChat),role=session.role;
  $('#chatList').innerHTML=list.map(x=>`<button class="chat-item ${x.id===activeChat?'on':''}" data-act="openChat" data-id="${x.id}">💬 ${esc(x.title)}<small>${x.members.length} persona(s)</small></button>`).join('');
  $('#chatTitle').textContent=c.title;$('#chatMembers').textContent='Con: '+c.members.map(uname).join(', ');
  $('#chat').innerHTML=c.msgs.length?c.msgs.map(m=>{const me=m.uid===session.id,orig=m.from==='sordo'?m.sordo:m.oyente,txt=role==='sordo'?m.sordo:m.oyente;
    return `<div class="msg ${me?'mine':'other'}"><small>${me?'Tú':esc(uname(m.uid))} · ${m.from==='sordo'?'🧏':'👂'}</small><span class="big">${esc(me?orig:txt)}</span></div>`}).join(''):'<p class="text-muted">Escribe el primer mensaje 💬</p>';
  $('#chat').scrollTop=1e6;$('#btnMic').hidden=role!=='oyente'}
let stream=null;
async function cam(){if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;$('#cam').hidden=true;$('#camPlaceholder').hidden=false;$('#btnCam').textContent='Activar cámara';return}
  try{stream=await navigator.mediaDevices.getUserMedia({video:true});$('#cam').srcObject=stream;$('#cam').hidden=false;$('#camPlaceholder').hidden=true;$('#btnCam').textContent='Apagar cámara'}catch{alert('No se pudo acceder a la cámara. Revisa los permisos.')}}
function mic(){const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR)return alert('Tu navegador no admite micrófono. Usa Chrome o Edge.');
  const r=new SR();r.lang='es-CO';r.onstart=()=>$('#btnMic').classList.add('rec');r.onend=()=>$('#btnMic').classList.remove('rec');
  r.onresult=e=>send(e.results[0][0].transcript);r.start()}

/* ---------- APRENDIZAJE ----------
   Imágenes OFICIALES de las señas: colócalas en img/senas/abc/a.png … y img/senas/num/0.png … (ver LEEME.txt). */
const GUIDES=[['Yo como pan.','YO PAN COMER','El verbo va al final y en infinitivo.'],['¿Qué quieres?','TÚ QUERER QUÉ','La pregunta va al final.'],['Ella compra agua.','ELLA AGUA COMPRAR','Sin artículos ni preposiciones.'],['Voy a la casa.','YO CASA IR','Primero quién, luego qué, al final la acción.']];
const STEPS=[['Crea tu cuenta y elige tu rol','YO CUENTA CREAR. ROL ESCOGER','Entra a “Entrar”, regístrate y elige si eres persona sorda u oyente.'],
['Abre el traductor','YO TRADUCTOR ENTRAR','Ve al menú “Traductor”. Allí están tus chats.'],
['Crea un chat','YO CHAT NUEVO CREAR','Pulsa “＋ Nuevo” y ponle un nombre. Puedes tener varios y eliminarlos.'],
['Invita a un amigo','YO AMIGO CORREO INVITAR','Pulsa “Invitar amigo” y escribe el correo con el que se registró.'],
['Escribe tu mensaje','SORDO: YO AGUA QUERER · OYENTE: YO QUERER AGUA (con 🎤 también puedes hablar)','Persona sorda: escribe en tu estructura Sujeto-Objeto-Verbo (o usa la cámara). Persona oyente: escribe o habla en Sujeto-Verbo-Objeto.'],
['Lee la respuesta','YO MENSAJE LEER. MI ESTRUCTURA APARECER','Cada persona lee el mensaje del otro en su propia estructura: la persona sorda en LSC y la oyente en español.'],
['Guarda tus palabras','YO PALABRA GLOSARIO GUARDAR','En “Glosario” agrega apodos y conceptos; puedes editarlos o borrarlos.']];
function renderLearn(tab){
  $$('#learnTabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  // Tarjeta bilingüe: Español (SVO) + LSC (SOV). "mov" = la seña lleva movimiento (flechas del cartel).
  const sc=(dir,k,big,es,lsc,mov)=>`<div class="col-6 col-md-4 col-lg-3"><div class="sign-card"><div class="sign-img"><img src="img/senas/${dir}/${k}.png" alt="Seña ${es}" onerror="this.replaceWith(document.createTextNode('Imagen no disponible'))"></div><b>${big}</b><div class="small text-start mt-1"><div><span class="tag es">Español</span> ${es}</div><div class="mt-1"><span class="tag lsc">LSC</span> ${lsc}</div>${mov?'<div class="mt-1 text-muted">↻ Con movimiento</div>':''}</div></div></div>`;
  const ex=(pairs)=>'<div class="row g-3 mt-3">'+pairs.map((p,i)=>`<div class="col-md-6"><div class="gcard p${i+2}"><span class="tag es">Español · Sujeto-Verbo-Objeto</span><p class="fs-5 mb-2">${p[0]}</p><span class="tag lsc">LSC · Sujeto-Objeto-Verbo</span><p class="fs-5 fw-bold mb-0">${p[1]}</p></div></div>`).join('')+'</div>';
  const NUM=['uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve','diez','once','doce','trece','catorce','quince','dieciséis','diecisiete','dieciocho','diecinueve','veinte'];
  let h='';
  if(tab==='abc')h='<p class="text-muted">Abecedario de la Lengua de Señas Colombiana. Las flechas indican movimiento.</p><div class="row g-3">'+'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.split('').map(l=>`<div class="col-6 col-md-4 col-lg-3"><div class="sign-card"><div class="sign-img tall"><img src="img/senas/abc/${l==='Ñ'?'nn':l.toLowerCase()}.png" alt="Seña de la letra ${l}"></div></div></div>`).join('')+'</div>'+ex([['Yo deletreo mi nombre.','YO NOMBRE DELETREAR'],['Ella escribe su nombre.','ELLA NOMBRE ESCRIBIR']]);
  if(tab==='num')h='<p class="text-muted">Números del 0 al 31. Las flechas indican movimiento.</p><div class="row g-3">'+[...Array(32).keys()].map(n=>`<div class="col-6 col-md-4 col-lg-3"><div class="sign-card"><div class="sign-img wide"><img src="img/senas/num/${n}.png" alt="Seña del número ${n}"></div></div></div>`).join('')+'</div>'+ex([['Yo tengo tres amigos.','YO AMIGO TRES TENER'],['Ella compra cinco panes.','ELLA PAN CINCO COMPRAR']]);
  if(tab==='gram')h='<div class="row g-3">'+GUIDES.map((g,i)=>`<div class="col-md-6"><div class="gcard p${i+1}"><span class="tag es">Español</span><p class="fs-5 mb-2">${g[0]}</p><span class="tag lsc">LSC</span><p class="fs-5 fw-bold mb-2">${g[1]}</p><small class="text-muted">💡 ${g[2]}</small></div></div>`).join('')+'</div>';
  if(tab==='uso')h=STEPS.map((s,i)=>`<div class="step mb-3"><div class="step-n">${i+1}</div><div class="gcard p${i%5+1} flex-fill"><b>${s[0]}</b><div class="row mt-2"><div class="col-md-6"><span class="tag lsc">LSC</span><p class="fw-bold mb-1">${s[1]}</p></div><div class="col-md-6"><span class="tag es">Español</span><p class="mb-1">${s[2]}</p></div></div></div></div>`).join('');
  $('#learnBody').innerHTML=h}

/* ---------- GLOSARIO: propio (arriba, pastel animado) y básico (abajo, solo lectura) ---------- */
const BASE=[['Hola','HOLA','👋'],['Gracias','GRACIAS','🙏'],['Por favor','FAVOR','🥺'],['Agua','AGUA','💧'],['Comer','COMER','🍽️'],['Ayuda','AYUDA','🆘'],['Baño','BAÑO','🚻'],['Familia','FAMILIA','👪'],['Amigo','AMIGO','🤝'],['Casa','CASA','🏠'],['Sí','SÍ','✅'],['No','NO','❌']];
const glKey=()=>'lsc_gl_'+session.id;
function renderGl(){
  const q=$('#glSearch').value.toLowerCase(),my=store.get(glKey(),[]).filter(m=>!q||(m.es+m.lsc).toLowerCase().includes(q));
  $('#glMine').innerHTML=my.map((m,i)=>`<div class="col-md-6 col-lg-3"><div class="gcard q${i%5+1}"><div class="ico">${m.cat==='Apodo'?'😎':'⭐'}</div><div class="word">${esc(m.lsc)}</div><div>${esc(m.es)}</div><small class="text-muted">${esc(m.cat)}</small><div class="mt-2 d-flex gap-2"><button class="btn btn-sm btn-soft" data-act="glEdit" data-id="${m.id}">✏️ Editar</button><button class="btn btn-sm btn-soft danger" data-act="glDel" data-id="${m.id}">🗑️ Borrar</button></div></div></div>`).join('')||'<p class="text-muted">Aún no tienes palabras propias. ¡Agrega la primera arriba! ✨</p>';
  $('#glBase').innerHTML=BASE.filter(b=>!q||(b[0]+b[1]).toLowerCase().includes(q)).map(b=>`<div class="col-6 col-lg-2"><div class="base"><div class="ico">${b[2]}</div><b>${b[1]}</b><div class="small">${b[0]}</div></div></div>`).join('')}

/* ---------- COMUNIDAD: publicaciones, comentarios en hilo, reacciones ----------
   Regla: cada persona SOLO edita/borra lo suyo (incluso en su propia publicación).
   Borrar un comentario elimina en cascada sus respuestas y reacciones.            */
const P=()=>store.get('lsc_posts',[]),C=()=>store.get('lsc_cmts',[]);let open=new Set();
const hasR=(x,t)=>(x.r&&x.r[t]||[]).includes(session.id),cnt=(x,t)=>(x.r&&x.r[t]||[]).length;
function rbar(kind,x){return `<button class="rbtn ${hasR(x,'love')?'on':''}" data-act="react" data-k="${kind}" data-id="${x.id}" data-t="love">❤️ ${cnt(x,'love')}</button> <button class="rbtn ${hasR(x,'like')?'on':''}" data-act="react" data-k="${kind}" data-id="${x.id}" data-t="like">👍 ${cnt(x,'like')}</button>`}
function ownerBtns(kind,x){return x.uid===session.id?`<button class="link-act" data-act="edit" data-k="${kind}" data-id="${x.id}">✏️ Editar</button><button class="link-act" data-act="del" data-k="${kind}" data-id="${x.id}">🗑️ Borrar</button>`:''}
let cq=''; // texto del buscador de la comunidad
const hl=s=>{const e=esc(s);if(!cq)return e;const r=esc(cq).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return e.replace(new RegExp(r,'gi'),m=>`<mark>${m}</mark>`)};
function tree(pid,parent,all,d){return all.filter(c=>c.postId===pid&&c.parentId===parent).map(c=>`<div class="cmt"><b>${hl(c.name)}</b> <small class="text-muted">${c.role==='sordo'?'🧏':'👂'}</small><div>${hl(c.text)}</div>${rbar('c',c)} ${d<3?`<button class="link-act" data-act="reply" data-p="${pid}" data-id="${c.id}">↩️ Responder</button>`:''}${ownerBtns('c',c)}${tree(pid,c.id,all,d+1)}</div>`).join('')}
function renderPosts(){const cm=C(),q=cq.toLowerCase(),has=x=>(x.name+' '+x.text).toLowerCase().includes(q);
  // Con búsqueda: se muestran las publicaciones que coinciden (o cuyos comentarios coinciden) y se abren sus comentarios
  let ps=P().slice().reverse().sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0));
  if(q)ps=ps.filter(p=>has(p)||cm.some(c=>c.postId===p.id&&has(c)));
  $('#posts').innerHTML=(q?`<p class="text-muted">${ps.length} resultado(s) para “${esc(cq)}”</p>`:'')+(ps.map((p,i)=>{const n=cm.filter(c=>c.postId===p.id).length,show=open.has(p.id)||(q&&cm.some(c=>c.postId===p.id&&has(c)));
  return `<div class="gcard p${i%5+1} mb-3"><b>${p.role==='sordo'?'🧏':'👂'} ${hl(p.name)}</b>${p.pinned?' <span class="tag lsc">📌 Ejemplo</span>':''}<p class="my-2">${hl(p.text)}</p>${rbar('p',p)} <button class="rbtn" data-act="toggle" data-id="${p.id}">☁️ ${n}</button> ${ownerBtns('p',p)}
  ${show?`<div class="mt-2">${tree(p.id,null,cm,0)}<form class="cform input-group mt-2" data-p="${p.id}"><input class="form-control" placeholder="Escribe un comentario…" required><button class="btn btn-grad">Comentar</button></form></div>`:''}</div>`}).join('')||(q?'<p class="text-muted">No encontramos nada 🔎 Prueba con otra palabra.</p>':'<p class="text-muted">Sé la primera persona en publicar 💜</p>'))}
function descendants(id,all){const out=[id];all.filter(c=>c.parentId===id).forEach(c=>out.push(...descendants(c.id,all)));return out}

/* ---------- SOPORTE / ACERCA / INICIO (contenido) ---------- */
const FAQ=[['¿Cómo empiezo?','Crea tu cuenta, elige tu rol y entra al Traductor. En “Aprendizaje → Cómo usar la plataforma” hay una guía paso a paso en LSC y español.'],
['¿Cómo escribo en estructura LSC?','Primero quién, luego qué y al final la acción en infinitivo: YO AGUA QUERER. Las preguntas van al final: TÚ QUERER QUÉ.'],
['¿Cómo invito a un amigo?','En el chat pulsa “Invitar amigo” y escribe el correo con el que esa persona se registró.'],
['El micrófono no funciona','Permite el acceso al micrófono en el navegador y usa Chrome o Edge. El sitio debe abrirse con HTTPS o localhost.'],
['La cámara no enciende','Permite la cámara en el navegador y revisa que ninguna otra aplicación la esté usando.'],
['¿Puedo borrar mi chat?','Sí. Si lo creaste, se elimina para todos; si te invitaron, solo sales del chat.'],
['¿Quién puede borrar mis comentarios?','Solo tú. Nadie más, ni siquiera quien publicó, puede borrar o editar lo tuyo. Si borras un comentario, también se borran sus respuestas y reacciones.'],
['¿Puedo agrandar la letra?','Sí, con los botones A+ / A− en la esquina inferior derecha.'],
['¿Las señas son oficiales?','Debes tomarlas del INSOR y validarlas con la comunidad sorda; la LSC tiene variaciones regionales.']];
const ABOUT=[['🌱','Nuestra historia','Nacimos en el SENA con una pregunta: ¿cómo hacemos que una conversación sea posible para todas las personas?'],['🎯','Misión','Facilitar la comunicación entre personas sordas y oyentes, cada quien en su propia estructura.'],['🔭','Visión','Ser una plataforma construida con la comunidad sorda y usada en aulas, hogares y trabajos.'],['🤝','Valores','Respeto, inclusión, comunidad e innovación con propósito.'],['🧩','Qué hacemos','Traducimos entre LSC y español, enseñamos señas y creamos un glosario propio de cada persona.'],['💬','Compromiso','Validar cada seña con la comunidad sorda y el INSOR, y escuchar sugerencias siempre.']];
const QUICK=[['💬','Traductor','Conversa en tu estructura','#traductor'],['📚','Aprendizaje','Abecedario, números y guías','#aprendizaje'],['🗂️','Glosario','Guarda tus propias señas','#glosario'],['🌈','Comunidad','Comparte y reacciona','#comunidad']];
$('#quick').innerHTML=QUICK.map((q,i)=>`<div class="col-6 col-lg-3"><a href="${q[3]}" class="text-decoration-none text-dark"><div class="gcard p${i+1}"><div class="ico">${q[0]}</div><b>${q[1]}</b><div class="small">${q[2]}</div></div></a></div>`).join('');
$('#aboutGrid').innerHTML=ABOUT.map((a,i)=>`<div class="col-md-6 col-lg-4"><div class="gcard p${i%5+1}"><div class="ico">${a[0]}</div><b>${a[1]}</b><p class="mb-0 small">${a[2]}</p></div></div>`).join('');
$('#faq').innerHTML=FAQ.map((f,i)=>`<div class="accordion-item"><h3 class="accordion-header"><button class="accordion-button ${i?'collapsed':''}" data-bs-toggle="collapse" data-bs-target="#f${i}">${f[0]}</button></h3><div id="f${i}" class="accordion-collapse collapse ${i?'':'show'}"><div class="accordion-body">${f[1]}</div></div></div>`).join('');

const CINFO={mail:'<b>📩 Escríbenos</b><p class="mb-0">hola@manosquehablan.co <span class="text-muted">(demo)</span> · o usa el formulario de abajo.</p>',lsc:'<b>🤟 Respuesta en LSC</b><p class="mb-0">Marca “Prefiero respuesta en video LSC” en el formulario y te responderemos en video.</p>',hor:'<b>🕘 Horario</b><p class="mb-0">Lunes a viernes · 8:00 a. m. – 5:00 p. m.</p>'};
/* ---------- ACCIONES (delegación de eventos) ---------- */
let fs=+store.get('lsc_fs',16);
const A={
 send(){const i=$('#msgInput');send(i.value);i.value=''},cam,mic,
 newChat(){const t=prompt('Nombre del chat:','Nueva conversación');if(t){createChat(t.trim());renderTrad()}},
 openChat(d){activeChat=+d.id;renderTrad()},
 invite(){const em=(prompt('Correo de tu amigo (debe tener cuenta):')||'').trim().toLowerCase();if(!em)return;const u=users().find(x=>x.email===em);
  if(!u){navigator.clipboard&&navigator.clipboard.writeText(location.href);return alert('Esa persona aún no tiene cuenta. Copiamos el enlace para que la invites a registrarse.')}
  patchChat(activeChat,c=>{if(!c.members.includes(u.id))c.members.push(u.id)});renderTrad()},
 delChat(){const c=chats().find(k=>k.id===activeChat);if(c.owner===session.id){if(!confirm('¿Eliminar este chat para todos?'))return;store.set(CK,chats().filter(k=>k.id!==c.id))}
  else{if(!confirm('¿Salir de este chat?'))return;patchChat(c.id,k=>k.members=k.members.filter(m=>m!==session.id))}activeChat=null;renderTrad()},
 glEdit(d){const m=store.get(glKey(),[]).find(x=>x.id==d.id);$('#glId').value=m.id;$('#glEs').value=m.es;$('#glLsc').value=m.lsc;$('#glCat').value=m.cat;$('#glForm').scrollIntoView({behavior:'smooth'});$('#glEs').focus()},
 glDel(d){if(confirm('¿Borrar esta palabra?')){store.set(glKey(),store.get(glKey(),[]).filter(m=>m.id!=d.id));renderGl()}},
 react(d){const L=d.k==='p'?P():C(),x=L.find(i=>i.id==d.id);x.r=x.r||{like:[],love:[]};const a=x.r[d.t]=x.r[d.t]||[];const k=a.indexOf(session.id);k<0?a.push(session.id):a.splice(k,1);store.set(d.k==='p'?'lsc_posts':'lsc_cmts',L);renderPosts()},
 toggle(d){open.has(+d.id)?open.delete(+d.id):open.add(+d.id);renderPosts()},
 reply(d){const t=prompt('Tu respuesta:');if(!t)return;const c=C();c.push({id:Date.now(),postId:+d.p,parentId:+d.id,uid:session.id,name:session.name,role:session.role,text:t});store.set('lsc_cmts',c);renderPosts()},
 edit(d){const L=d.k==='p'?P():C(),x=L.find(i=>i.id==d.id);if(x.uid!==session.id)return;const t=prompt('Editar:',x.text);if(t){x.text=t;store.set(d.k==='p'?'lsc_posts':'lsc_cmts',L);renderPosts()}},
 del(d){const L=d.k==='p'?P():C(),x=L.find(i=>i.id==d.id);if(!x||x.uid!==session.id)return; // solo el autor
  if(!confirm(d.k==='p'?'Se borrará la publicación con todos sus comentarios y reacciones.':'Se borrará este comentario con sus respuestas y reacciones.'))return;
  if(d.k==='p'){store.set('lsc_posts',L.filter(i=>i.id!==x.id));store.set('lsc_cmts',C().filter(c=>c.postId!==x.id))}
  else{const ids=descendants(x.id,C());store.set('lsc_cmts',C().filter(c=>!ids.includes(c.id)))}renderPosts()},
 cTab(d){$$('#cOpts .opt').forEach(b=>b.classList.toggle('on',b.dataset.t===d.t));$('#cInfo').innerHTML=CINFO[d.t]},
 zoom(d){fs=d.d==='0'?16:Math.min(24,Math.max(12,fs+2*d.d));store.set('lsc_fs',fs);document.documentElement.style.fontSize=fs+'px'}};
document.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(b&&A[b.dataset.act])A[b.dataset.act](b.dataset)});
document.addEventListener('submit',e=>{const f=e.target;if(f.classList.contains('cform')){e.preventDefault();const c=C();c.push({id:Date.now(),postId:+f.dataset.p,parentId:null,uid:session.id,name:session.name,role:session.role,text:f.querySelector('input').value});store.set('lsc_cmts',c);renderPosts()}});
$('#msgInput').onkeydown=e=>{if(e.key==='Enter')A.send()};
$$('#learnTabs button').forEach(b=>b.onclick=()=>renderLearn(b.dataset.tab));
$('#glSearch').oninput=renderGl;
$('#cmSearch').oninput=e=>{cq=e.target.value.trim();renderPosts()};
$('#glForm').onsubmit=e=>{e.preventDefault();const m=store.get(glKey(),[]),id=$('#glId').value,d={es:$('#glEs').value,lsc:$('#glLsc').value,cat:$('#glCat').value};
  if(id)Object.assign(m.find(x=>x.id==id),d);else m.push({id:Date.now(),...d});store.set(glKey(),m);e.target.reset();$('#glId').value='';renderGl()};
$('#postForm').onsubmit=e=>{e.preventDefault();const p=P();p.push({id:Date.now(),uid:session.id,name:session.name,role:session.role,text:$('#postText').value,r:{like:[],love:[]}});store.set('lsc_posts',p);e.target.reset();renderPosts()};
$('#contactForm').onsubmit=e=>{e.preventDefault();$('#contactBox').innerHTML=`<div class="thanks"><div class="ico">💌</div><h3>¡Gracias, ${esc($('#cName').value)}!</h3><p>Tu mensaje viajó con mucho cariño hasta nuestro equipo. Te responderemos muy pronto. Mientras tanto, recuerda: <b>tus manos tienen voz</b> 🤟💜</p></div>`};

/* ---------- LIMPIEZA: borra publicaciones/comentarios de versiones anteriores sin id ni autor ---------- */
(function clean(){const p=P().filter(x=>x.id&&x.uid),ids=p.map(x=>x.id);store.set('lsc_posts',p);store.set('lsc_cmts',C().filter(c=>c.id&&c.uid&&ids.includes(c.postId)))})();
/* ---------- PUBLICACIÓN DE EJEMPLO (fijada arriba; nadie puede editarla ni borrarla) ---------- */
(function seed(){const p=P();if(!p.some(x=>x.id===1)){p.push({id:1,uid:'ejemplo',name:'Karol',role:'sordo',pinned:true,text:'¡Hola, comunidad! Soy Karol. Me encanta poder escribir en mi estructura y que las demás personas me entiendan 💜',r:{like:[],love:[]}});store.set('lsc_posts',p)}
  const c=C();if(!c.some(x=>x.id===2)){c.push({id:2,postId:1,parentId:null,uid:'ejemplo',name:'Equipo Manos que Hablan',role:'oyente',text:'¡Bienvenida, Karol! Aquí todas las formas de comunicar valen 🤟',r:{like:[],love:[]}});store.set('lsc_cmts',c)}})();
/* ---------- ROUTER ---------- */
const PROTECTED=['traductor','glosario','comunidad'];
function route(){let p=location.hash.slice(1)||'inicio';if(PROTECTED.includes(p)&&!session)p='login';
  $$('[data-page]').forEach(s=>s.hidden=s.dataset.page!==p);$$('.nav-link').forEach(a=>a.classList.toggle('active',a.getAttribute('href')==='#'+p));
  if(p==='traductor')renderTrad();if(p==='aprendizaje')renderLearn('abc');if(p==='glosario')renderGl();if(p==='comunidad')renderPosts();$('#foot').hidden=p!=='inicio';window.scrollTo(0,0)}
window.addEventListener('hashchange',route);
$('#cInfo').innerHTML=CINFO.mail;document.documentElement.style.fontSize=fs+'px';renderAuth();setAuthMode(false);route();
