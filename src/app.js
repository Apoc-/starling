import { PRODUCERS, UPGRADES, createState, tapValue, production, producerCost, buyProducer, buyUpgrade, tap, advance, previewVoyage, launchVoyage, validateState } from './engine.js';
import { openStore, parseSave, exportSave, SAVE_VERSION } from './storage.js';
const $ = id => document.getElementById(id);
let state = createState(Date.now());
let store, revision = 0, writer = false, persistent = false, busy = false, pendingImport, installPrompt, workerRegistration;
let toastTimer, lastSave = 0, ticking = false;
const number = new Intl.NumberFormat('en', {maximumFractionDigits:1});
function fmt(value) {
  for (const [threshold, suffix] of [[1e12,'T'],[1e9,'B'],[1e6,'M'],[1e3,'k']]) if (value >= threshold) return number.format(value / threshold) + suffix;
  return number.format(value);
}
function notice(message) { $('notice').textContent=message; $('notice').hidden=false; }
function toast(message) { $('toast').textContent=message; $('toast').hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').hidden=true,4000); }
const icons = [
  '<path d="M10 16h12v10H10zM4 14v14m24-14v14M4 18h6m12 0h6M16 16V9m-4 0h8M13 22h6"/>',
  '<path d="M5 9h22v15H5zM12 9v15M20 9v15M5 16h22M16 24v5m-6 0h12M10 4l2 2m10-2-2 2"/>',
  '<circle cx="16" cy="16" r="5"/><ellipse cx="16" cy="16" rx="7" ry="14" transform="rotate(40 16 16)"/><ellipse cx="16" cy="16" rx="7" ry="14" transform="rotate(-40 16 16)"/>'
];
$('producers').innerHTML = PRODUCERS.map((p,i)=>`<article class="producer"><div class="producer-icon" aria-hidden="true"><svg viewBox="0 0 32 32">${icons[i]}</svg></div><div class="producer-info"><h3>${p.name}</h3><p>+${fmt(p.baseRate)} e / sec base</p><small>In orbit: <strong id="owned-${p.id}">0</strong></small></div><button id="buy-${p.id}" class="build-button" aria-label="Build ${p.name}" disabled><span id="cost-${p.id}"></span><small>BUILD +</small></button></article>`).join('');
$('upgrades').innerHTML = UPGRADES.map((u,i)=>`<article class="upgrade"><span class="upgrade-icon" aria-hidden="true">${['ϟ','⌘','✧'][i]}</span><div><h3>${u.name}</h3><p>${['Double energy from every tap.','Double your entire fleet’s output.','Double fleet output once more.'][i]}</p></div><button id="upgrade-${u.id}" class="build-button" aria-label="Research ${u.name}" disabled><span>${fmt(u.cost)} e</span><small>RESEARCH</small></button></article>`).join('');
function render() {
  $('energy').textContent=fmt(state.energy); $('rate').textContent=fmt(production(state)); $('tap-value').textContent=fmt(tapValue(state));
  $('collect').disabled=!writer || busy;
  for (const p of PRODUCERS) {
    const cost=producerCost(state,p.id);
    $('owned-'+p.id).textContent=String(state.producers[p.id]); $('cost-'+p.id).textContent=Number.isFinite(cost)?fmt(cost)+' e':'MAX';
    $('buy-'+p.id).disabled=!writer || busy || state.energy<cost;
  }
  for (const u of UPGRADES) {
    const button=$('upgrade-'+u.id), owned=state.upgrades.includes(u.id);
    button.disabled=!writer || busy || owned || state.energy<u.cost;
    button.classList.toggle('owned-badge',owned); button.querySelector('span').textContent=owned?'Installed ✓':fmt(u.cost)+' e';
    button.querySelector('small').textContent=owned?'ONLINE':'RESEARCH';
  }
  const gain=previewVoyage(state);
  $('stardust').textContent=fmt(state.stardust); $('boost').textContent='+'+fmt(state.stardust*25)+'%';
  $('sector').textContent='SECTOR '+String(state.voyages+1).padStart(3,'0');
  $('voyage-open').disabled=!writer || busy || gain<1;
  $('voyage-open').firstChild.textContent=gain ? `New voyage · +${fmt(gain)} stardust ` : 'Launch a new voyage ';
  $('voyage-hint').textContent=fmt(state.runEarned)+' / 10k energy earned this voyage';
  let title,description,current,target;
  if (!state.producers.scout) { title='A small beginning';description='Collect 10 energy to build your first drone.';current=state.energy;target=10; }
  else if (!state.upgrades.includes('pulse')) {title='A brighter little star';description='Research Focused pulse to double each tap.';current=state.energy;target=60;}
  else if (!state.producers.array) {title='Catch a little more light';description='Build a solar array for 4 energy every second.';current=state.energy;target=80;}
  else if (gain<1) {title='A new horizon awaits';description='Earn 10,000 energy this voyage to find stardust.';current=state.runEarned;target=10000;}
  else {title='The stars are calling';description='Your next voyage is ready. Keep growing or set out again.';current=state.runEarned;target=10000;}
  $('mission-title').textContent=title; $('mission-description').textContent=description; $('mission-count').textContent=fmt(Math.min(current,target))+' / '+fmt(target); $('mission-fill').style.width=Math.min(100,current/target*100)+'%';
  $('import-open').disabled=!writer || busy; $('restore-backup').disabled=!writer || !persistent || busy;
  $('update-now').disabled=!writer || busy;
}
async function save() {
  if (!writer || !persistent) return false;
  try {
    const envelope=await store.commit(state,revision); revision=envelope.revision; lastSave=Date.now();
    $('save-status').textContent='Saved on this device'; return true;
  } catch(error) {
    if (error.name==='SaveConflictError') {writer=false;persistent=false;notice('Another station session saved newer progress. This tab is now read-only. Reload to continue.');}
    else {persistent=false;notice('Saving is unavailable. Keep this tab open and export a backup from the flight manual. '+error.message);}
    $('save-status').textContent='Not saved — export a backup';render();return false;
  }
}
async function action(transform,message) {
  if (!writer || busy) return;
  busy=true;
  state=transform(advance(state,Date.now()));render();
  if (persistent) await save();
  busy=false; render(); if(message) toast(message);
}
$('collect').addEventListener('click',()=>action(s=>{
  $('tap-feedback').textContent='+'+fmt(tapValue(s));$('tap-feedback').classList.remove('pop');void $('tap-feedback').offsetWidth;$('tap-feedback').classList.add('pop');return tap(s);
}));
for (const p of PRODUCERS) $('buy-'+p.id).addEventListener('click',()=>action(s=>buyProducer(s,p.id),p.name+' is collecting.'));
for (const u of UPGRADES) $('upgrade-'+u.id).addEventListener('click',()=>action(s=>buyUpgrade(s,u.id),u.name+' installed.'));
$('settings-open').onclick=()=>$('settings-dialog').showModal();
$('settings-close').onclick=()=>$('settings-dialog').close();
$('voyage-open').onclick=()=>{
  const gain=previewVoyage(state);$('voyage-preview').textContent=`Bring home ${fmt(gain)} stardust. Your permanent energy bonus becomes +${fmt((state.stardust+gain)*25)}%.`; $('voyage-dialog').showModal();
};
$('voyage-cancel').onclick=()=>$('voyage-dialog').close();
$('voyage-confirm').onclick=async()=>{ $('voyage-dialog').close();await action(launchVoyage,'A fresh sky. Your stardust stays with you.'); };
$('export-save').onclick=()=>{
  try {
    const text=exportSave({version:SAVE_VERSION,revision:Math.max(1,revision),state},validateState);
    const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='starling-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Backup exported. Keep it somewhere safe.');
  } catch(error) {toast('Backup failed: '+error.message);}
};
$('import-open').onclick=()=>$('import-file').click();
function offerImport(envelope) {pendingImport=envelope;$('import-preview').textContent=`This station has ${fmt(envelope.state.energy)} energy, ${envelope.state.voyages} voyages, and ${fmt(envelope.state.stardust)} stardust.`;$('settings-dialog').close();$('import-dialog').showModal();}
$('import-file').onchange=async event=>{
  const file=event.target.files[0];if(!file)return;
  try { if(file.size>100000) throw Error('Backup is too large (100 KB maximum).');offerImport(parseSave(await file.text(),validateState)); }
  catch(error){toast('Import rejected: '+error.message);}finally{event.target.value='';}
};
$('import-cancel').onclick=()=>{pendingImport=null;$('import-dialog').close();};
$('import-confirm').onclick=async()=>{
  if (!pendingImport)return;const incoming=pendingImport.state;pendingImport=null;$('import-dialog').close();
  await action(()=>({...incoming,checkpoint:Date.now()}),'Backup imported.');
};
$('restore-backup').onclick=async()=>{
  try{const backup=await store.backup();if(!backup)toast('No previous save is available yet.');else offerImport(backup);}catch(error){toast('Recovery failed: '+error.message);}
};
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;$('install').hidden=false;});
$('install').onclick=async()=>{if(!installPrompt)return;await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$('install').hidden=true;};
window.addEventListener('appinstalled',()=>{$('install').hidden=true;toast('Starling is installed. See you in orbit.');});
function connection(){$('connection').innerHTML='<i class="status-dot"></i>'+(!navigator.onLine?'Offline':navigator.serviceWorker?.controller?'Offline ready':'Online');}
window.addEventListener('online',connection);window.addEventListener('offline',connection);
async function boot(isWriter) {
  writer=isWriter;
  try {
    store=await openStore({validateState}); const saved=await store.load();
    if(saved){state=saved.state;revision=saved.revision;}
    persistent=isWriter && !!navigator.locks;
    if(isWriter){
      const before=state.energy, gap=Date.now()-state.checkpoint;state=advance(state,Date.now());if(persistent)await save();
      if(gap>10000 && state.energy>before)toast('Welcome back. Your fleet collected '+fmt(state.energy-before)+' energy (up to 4 hours).');
    } else {notice('Your station is open in another tab. This tab is read-only to protect your save. Close the other tab, then reload here.');$('save-status').textContent='Read-only station';}
  } catch(error) {
    if(store){writer=false;persistent=false;notice('Your stored save could not be read. Nothing has been overwritten. '+error.message);$('save-status').textContent='Save needs recovery';}
    else {persistent=false;notice('Device storage is unavailable. You can play in this tab, but export a backup before leaving.');$('save-status').textContent='Temporary session — export a backup';}
  }
  if(!navigator.locks){persistent=false;notice('This browser cannot safely coordinate saved games across tabs. Play is temporary; export a backup before leaving.');$('save-status').textContent='Temporary session — export a backup';}
  $('storage-info').textContent=persistent?'Local saves are enabled. Export a backup to protect against browser-data deletion.':'Local saves are not writable in this session. See the notice above the station.';
  render(); connection();
  setInterval(async()=>{
    if(!writer || busy || ticking || document.hidden)return;
    ticking=true;state=advance(state,Date.now());render();
    if(persistent && Date.now()-lastSave>=5000){busy=true;await save();busy=false;render();}
    ticking=false;
  },250);
}
if(navigator.locks)navigator.locks.request('starling-single-writer',{ifAvailable:true},async lock=>{
  await boot(!!lock);if(lock)await new Promise(()=>{});
}).catch(error=>{notice('Station lock failed: '+error.message);render();});
else boot(true);
document.addEventListener('visibilitychange',async()=>{
  if(!writer || busy)return;
  if(document.hidden){busy=true;state=advance(state,Date.now());await save();busy=false;}
  else {const previous=state.energy,gap=Date.now()-state.checkpoint;state=advance(state,Date.now());if(gap>10000 && state.energy>previous)toast('While you were away: +'+fmt(state.energy-previous)+' energy.');render();}
});
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('./sw.js').then(reg=>{
    workerRegistration=reg;
    function ready(){if(reg.waiting && navigator.serviceWorker.controller)$('update-banner').hidden=false;}
    ready();reg.addEventListener('updatefound',()=>{const worker=reg.installing;worker?.addEventListener('statechange',ready);});
    connection();
  }).catch(()=>notice('Offline download failed. Keep a connection and reload to try again.'));
  let refreshing=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{connection();if(refreshing)return;refreshing=true;location.reload();});
}
$('update-now').onclick=async()=>{
  if(!writer){notice('Update in the active station tab to protect unsaved progress.');return;}
  if(busy)return;
  busy=true;render();
  const ok=await save();
  if(!ok){busy=false;render();toast('Update paused: save or export progress first.');return;}
  const waiting=workerRegistration?.waiting;
  if(!waiting){busy=false;render();toast('Update paused: no waiting update is available.');return;}
  try{waiting.postMessage({type:'ACTIVATE_UPDATE'});}
  catch{busy=false;render();toast('Update paused: the waiting update could not be activated.');}
};
render();
