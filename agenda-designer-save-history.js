(function(){
'use strict';

var MAIN_API='https://rbwcmjtcmhnivkmoxpsj.supabase.co/functions/v1/daily-agenda-designer';
var HISTORY_API='https://rbwcmjtcmhnivkmoxpsj.supabase.co/functions/v1/daily-agenda-design-history';
var nativeFetch=window.fetch.bind(window);
var accessKey='';
var savedSettings={};
var fields=[];
var fieldMap={};
var pending={};
var latestSavedAt=null;
var saving=false;
var historyRefreshToken=0;

function $(id){return document.getElementById(id)}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v))}
function getPath(obj,path){return String(path||'').split('.').reduce(function(v,k){return v==null?undefined:v[k]},obj)}
function same(a,b){return JSON.stringify(a)===JSON.stringify(b)}
function formatDate(v){
  if(!v)return'—';
  try{return new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(v))}
  catch(e){return'—'}
}
function formatTime(v){
  if(!v)return'—';
  try{return new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(v))}
  catch(e){return'—'}
}
function rebuildFieldMap(){fieldMap={};fields.forEach(function(f){fieldMap[f.path]=f})}
function readControlValue(el,field){
  if(!field)return el.value;
  if(field.control_type==='number')return Number(el.value);
  if(field.control_type==='select'){
    try{return JSON.parse(el.value)}catch(e){return el.value}
  }
  if(field.control_type==='color')return String(el.value||'').toUpperCase();
  return el.value;
}
function pendingNames(){
  return Object.keys(pending).map(function(path){return fieldMap[path]&&fieldMap[path].label?fieldMap[path].label:path})
}
function updateSaveUI(){
  var btn=$('saveBtn'),text=$('dirtyText'),count=Object.keys(pending).length;
  if(!btn||!text)return;
  if(saving){
    btn.textContent='Saving…';
    btn.disabled=true;
    text.innerHTML='<span class="save-status saving"><span class="save-spinner"></span><strong>Saving '+count+' change'+(count===1?'':'s')+' to Supabase…</strong></span>';
    return;
  }
  if(count){
    var names=pendingNames(),shown=names.slice(0,3).map(esc).join(', '),more=names.length>3?' +'+(names.length-3)+' more':'';
    btn.textContent='Save '+count+' change'+(count===1?'':'s');
    btn.disabled=false;
    text.innerHTML='<span class="save-status pending"><span class="save-dot"></span><strong>'+count+' unsaved change'+(count===1?'':'s')+'</strong><span class="save-status-detail"> · '+shown+more+'</span></span>';
  }else{
    btn.textContent='Saved ✓';
    btn.disabled=true;
    var stamp=latestSavedAt?' at '+esc(formatTime(latestSavedAt)):'';
    text.innerHTML='<span class="save-status saved"><span class="save-check">✓</span><strong>Saved to Supabase'+stamp+'</strong><span class="save-status-detail"> · No unsaved changes</span></span>';
  }
}
function trackInput(el){
  if(!el||!el.dataset||!el.dataset.path)return;
  var path=el.dataset.path,field=fieldMap[path],value=readControlValue(el,field),saved=getPath(savedSettings,path);
  if(same(value,saved))delete pending[path];else pending[path]=value;
  updateSaveUI();
}
function flatten(obj,prefix,out){
  out=out||{};prefix=prefix||'';
  if(obj&&typeof obj==='object'&&!Array.isArray(obj)){
    Object.keys(obj).forEach(function(k){var p=prefix?prefix+'.'+k:k;flatten(obj[k],p,out)});
  }else out[prefix]=obj;
  return out;
}
function diffSettings(newSettings,oldSettings){
  var a=flatten(newSettings||{}),b=flatten(oldSettings||{}),keys={},out=[];
  Object.keys(a).forEach(function(k){keys[k]=1});Object.keys(b).forEach(function(k){keys[k]=1});
  Object.keys(keys).sort().forEach(function(path){if(!same(a[path],b[path]))out.push({path:path,oldValue:b[path],newValue:a[path]})});
  return out;
}
function valueHtml(path,value){
  var f=fieldMap[path]||{},unit=f.unit||'';
  if(value===undefined)return'<span class="save-value empty">Not set</span>';
  if(f.control_type==='color'&&/^#[0-9A-Fa-f]{6}$/.test(String(value))){
    return'<span class="save-value color-value"><i class="save-swatch" style="background:'+esc(value)+'"></i>'+esc(value)+'</span>';
  }
  var display=String(value);
  if(unit)display+=unit==='%'?'%':' '+unit;
  return'<span class="save-value">'+esc(display)+'</span>';
}
function renderHistoryCards(history){
  var host=$('history');if(!host)return;
  if(!history||!history.length){host.innerHTML='<div class="history-empty">No saved changes yet.</div>';return}
  var html=[];
  history.forEach(function(h,i){
    var older=history[i+1],diff=older?diffSettings(h.settings,older.settings):[],isInitial=!older||String(h.changed_by||'').toLowerCase().indexOf('initial')>=0;
    var label=i===0?'<span class="save-badge latest">Latest</span>':'<span class="save-badge">Saved</span>';
    if(isInitial){
      html.push('<article class="save-card'+(i===0?' latest':'')+'"><div class="save-card-head"><div><div class="save-date">'+esc(formatDate(h.changed_at))+'</div><div class="save-meta">'+label+' · Initial configuration</div></div><div class="save-count">'+Object.keys(flatten(h.settings||{})).length+' parameters</div></div><div class="save-initial">Initial design settings imported into the app.</div></article>');
      return;
    }
    var visible=diff.slice(0,7),rows=visible.map(function(d){var f=fieldMap[d.path]||{};return'<div class="save-change"><div class="save-change-copy"><div class="save-change-label">'+esc(f.label||d.path)+'</div><div class="save-change-section">'+esc(f.section||d.path.split('.')[0])+'</div></div><div class="save-change-values">'+valueHtml(d.path,d.oldValue)+'<span class="save-arrow">→</span>'+valueHtml(d.path,d.newValue)+'</div></div>'}).join('');
    if(diff.length>visible.length)rows+='<div class="save-more">+'+(diff.length-visible.length)+' more changes in this save</div>';
    html.push('<article class="save-card'+(i===0?' latest':'')+'"><div class="save-card-head"><div><div class="save-date">'+esc(formatDate(h.changed_at))+'</div><div class="save-meta">'+label+'</div></div><div class="save-count">'+diff.length+' change'+(diff.length===1?'':'s')+'</div></div>'+(rows||'<div class="save-initial">Snapshot saved with no value differences detected.</div>')+'</article>');
  });
  host.innerHTML=html.join('');
}
async function refreshDetailedHistory(){
  if(!accessKey)return;
  var token=++historyRefreshToken;
  try{
    var r=await nativeFetch(HISTORY_API,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key:accessKey}),cache:'no-store'});
    var data=await r.json();
    if(token!==historyRefreshToken)return;
    if(r.ok&&data&&Array.isArray(data.history))renderHistoryCards(data.history);
  }catch(e){}
}
function ingestMainPayload(data,action){
  if(!data||!data.settings)return;
  savedSettings=clone(data.settings||{});
  fields=data.fields||fields;
  rebuildFieldMap();
  latestSavedAt=data.updated_at||latestSavedAt;
  if(action==='load'||action==='save')pending={};
  if(action==='save')saving=false;
  setTimeout(function(){updateSaveUI();refreshDetailedHistory()},0);
}
function injectStyles(){
  var style=document.createElement('style');style.id='save-history-enhancements';style.textContent=`
.history{margin-top:14px;border-top:1px solid var(--line);padding-top:12px}.history h3{font-size:13px;margin:0 0 9px}.history-list{display:grid;gap:9px}.save-card{border:1px solid var(--line);border-radius:10px;background:var(--panel2);padding:10px 11px;box-shadow:0 1px 0 rgba(0,0,0,.02)}.save-card.latest{border-color:color-mix(in srgb,var(--accent) 45%,var(--line));background:color-mix(in srgb,var(--accent) 5%,var(--panel2))}.save-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:8px}.save-date{font-size:11px;font-weight:800;color:var(--text)}.save-meta{font-size:9px;color:var(--muted);margin-top:3px;display:flex;align-items:center;gap:5px}.save-badge{display:inline-block;padding:2px 5px;border-radius:999px;border:1px solid var(--line);font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}.save-badge.latest{border-color:var(--accent);color:var(--accent)}.save-count{font-size:9px;font-weight:800;color:var(--muted);white-space:nowrap}.save-change{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:9px;align-items:center;padding:7px 0;border-top:1px solid var(--line)}.save-change:first-of-type{border-top:0}.save-change-label{font-size:10px;font-weight:760;line-height:1.25;color:var(--text)}.save-change-section{font-size:8px;color:var(--muted);margin-top:2px}.save-change-values{display:flex;align-items:center;justify-content:flex-end;gap:5px;flex-wrap:wrap;font-size:9px}.save-value{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--line);border-radius:6px;background:var(--panel);padding:3px 5px;font-weight:700;color:var(--text);white-space:nowrap}.save-value.empty{color:var(--muted);font-weight:500}.save-swatch{width:9px;height:9px;border-radius:3px;border:1px solid rgba(127,127,127,.4);display:inline-block}.save-arrow{color:var(--muted);font-weight:800}.save-more,.save-initial,.history-empty{font-size:9px;color:var(--muted);line-height:1.4;padding-top:5px}.save-status{display:inline-flex;align-items:center;gap:6px;line-height:1.35}.save-status.saved{color:var(--good)}.save-status.pending{color:var(--warn)}.save-status.saving{color:var(--accent)}.save-status-detail{color:var(--muted);font-weight:500}.save-check{display:inline-flex;width:17px;height:17px;align-items:center;justify-content:center;border-radius:50%;background:color-mix(in srgb,var(--good) 13%,transparent);font-weight:900}.save-dot{width:8px;height:8px;border-radius:50%;background:var(--warn);box-shadow:0 0 0 3px color-mix(in srgb,var(--warn) 12%,transparent)}.save-spinner{width:12px;height:12px;border:2px solid color-mix(in srgb,var(--accent) 25%,transparent);border-top-color:var(--accent);border-radius:50%;animation:save-spin .8s linear infinite}@keyframes save-spin{to{transform:rotate(360deg)}}#saveBtn:disabled{opacity:.62}#saveBtn:disabled:not(.saving){background:color-mix(in srgb,var(--good) 78%,var(--panel));border-color:var(--good);color:#fff}.footerbar .dirtytext{min-width:0}.footerbar{gap:14px}@media(max-width:680px){.save-change{grid-template-columns:1fr}.save-change-values{justify-content:flex-start}.save-status-detail{display:block}}
`;
  document.head.appendChild(style);
}

window.fetch=async function(input,init){
  var url=typeof input==='string'?input:(input&&input.url)||'';
  var action='';
  if(url.indexOf(MAIN_API)===0&&init&&typeof init.body==='string'){
    try{var body=JSON.parse(init.body);accessKey=String(body.key||accessKey);action=String(body.action||'load')}catch(e){}
  }
  var response=await nativeFetch(input,init);
  if(url.indexOf(MAIN_API)===0){
    try{var data=await response.clone().json();if(response.ok)ingestMainPayload(data,action)}catch(e){}
  }
  return response;
};

injectStyles();
document.addEventListener('input',function(e){trackInput(e.target)});
document.addEventListener('change',function(e){trackInput(e.target)});
document.addEventListener('click',function(e){
  var btn=e.target&&e.target.closest?e.target.closest('#saveBtn'):null;
  if(btn&&Object.keys(pending).length){saving=true;updateSaveUI()}
},true);

var observer=new MutationObserver(function(){
  if(!saving)updateSaveUI();
});
window.addEventListener('DOMContentLoaded',function(){
  var footer=$('dirtyText');if(footer)observer.observe(footer,{childList:true,subtree:true,characterData:true});
  updateSaveUI();
});
})();
