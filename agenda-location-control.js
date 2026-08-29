(function(){
'use strict';

var API='https://rbwcmjtcmhnivkmoxpsj.supabase.co/functions/v1/daily-agenda-location';
var current=null;
var selected=null;
var searchTimer=null;
var searchSeq=0;
var previewObserver=null;

function $(id){return document.getElementById(id)}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function key(){var el=$('key');return el?el.value.trim():''}
function fmtDate(v){if(!v)return'—';try{return new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(v))}catch(e){return'—'}}
function sameLocation(a,b){return !!(a&&b&&a.geohash===b.geohash)}

async function call(action,extra){
  var r=await fetch(API,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(Object.assign({action:action,key:key()},extra||{})),cache:'no-store'});
  var data=await r.json().catch(function(){return{error:'Invalid server response'}});
  if(!r.ok)throw new Error(data.error||('Request failed: '+r.status));
  return data;
}

function injectStyles(){
  if(document.getElementById('weather-location-styles'))return;
  var s=document.createElement('style');s.id='weather-location-styles';s.textContent=`
.weather-location-panel{margin:14px 0 16px;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px;box-shadow:var(--shadow)}
.weather-location-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:12px}.weather-location-title{font-size:15px;font-weight:800;color:var(--text)}.weather-location-help{font-size:11px;color:var(--muted);line-height:1.45;margin-top:3px;max-width:850px}.weather-location-current{font-size:11px;color:var(--muted);text-align:right}.weather-location-current strong{color:var(--text);font-size:12px}
.weather-location-grid{display:grid;grid-template-columns:minmax(260px,1fr) auto;gap:10px;align-items:end}.weather-search-wrap{position:relative}.weather-search-label{display:block;font-size:11px;font-weight:760;margin-bottom:6px}.weather-search-input{width:100%;border:1px solid var(--line);background:var(--panel2);color:var(--text);border-radius:9px;padding:10px 12px;font:inherit;font-size:13px;outline:none}.weather-search-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 14%,transparent)}
.weather-suggestions{position:absolute;z-index:30;left:0;right:0;top:calc(100% + 5px);background:var(--panel);border:1px solid var(--line);border-radius:10px;box-shadow:0 16px 34px rgba(0,0,0,.18);max-height:320px;overflow:auto;padding:5px}.weather-suggestions[hidden]{display:none}.weather-option{width:100%;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;text-align:left;border:0;background:transparent;color:var(--text);padding:9px 10px;border-radius:7px;cursor:pointer}.weather-option:hover,.weather-option:focus{background:var(--panel2);outline:none}.weather-option-name{font-size:12px;font-weight:760}.weather-option-meta{font-size:9px;color:var(--muted);margin-top:2px}.weather-option-side{font-size:9px;color:var(--muted);white-space:nowrap}
.weather-search-status{font-size:10px;color:var(--muted);margin-top:6px;min-height:15px}.weather-location-actions{display:flex;gap:8px}.weather-save{min-width:138px}.weather-save.saved{background:color-mix(in srgb,var(--good) 78%,var(--panel));border-color:var(--good)}
.weather-selected{display:none;margin-top:11px;border:1px solid var(--line);border-radius:9px;background:var(--panel2);padding:10px 11px;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center}.weather-selected.show{display:grid}.weather-selected-name{font-size:12px;font-weight:800}.weather-selected-meta{font-size:10px;color:var(--muted);margin-top:3px}.weather-coverage{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}.weather-pill{font-size:8px;font-weight:800;border:1px solid var(--line);border-radius:999px;padding:3px 6px;color:var(--muted);white-space:nowrap}.weather-pill.good{color:var(--good);border-color:color-mix(in srgb,var(--good) 45%,var(--line))}.weather-warning{font-size:10px;color:var(--warn);font-weight:700;margin-top:8px}.weather-error{font-size:10px;color:var(--danger);font-weight:700;margin-top:8px}
@media(max-width:720px){.weather-location-head{display:block}.weather-location-current{text-align:left;margin-top:8px}.weather-location-grid{grid-template-columns:1fr}.weather-location-actions{justify-content:flex-start}.weather-selected{grid-template-columns:1fr}.weather-coverage{justify-content:flex-start}}
`;
  document.head.appendChild(s);
}

function buildPanel(){
  if($('weatherLocationPanel'))return;
  var statusbar=document.querySelector('.statusbar');if(!statusbar)return;
  var panel=document.createElement('section');panel.id='weatherLocationPanel';panel.className='weather-location-panel';
  panel.innerHTML='<div class="weather-location-head"><div><div class="weather-location-title">Weather location</div><div class="weather-location-help">Type at least 3 characters, then choose a location from the suggestions. The suggestions come from the Met Office location catalogue, so every option has a Met Office forecast. Open-Meteo uses the exact selected latitude/longitude, avoiding name-matching problems.</div></div><div id="weatherCurrent" class="weather-location-current">Loading current location…</div></div><div class="weather-location-grid"><div class="weather-search-wrap"><label class="weather-search-label" for="weatherLocationSearch">Town, city or place</label><input id="weatherLocationSearch" class="weather-search-input" type="search" autocomplete="off" placeholder="Start typing a location…" aria-autocomplete="list" aria-controls="weatherLocationSuggestions" aria-expanded="false"><div id="weatherLocationSuggestions" class="weather-suggestions" role="listbox" hidden></div><div id="weatherSearchStatus" class="weather-search-status">Suggestions appear after 3 characters.</div></div><div class="weather-location-actions"><button id="weatherLocationSave" class="btn primary weather-save" type="button" disabled>Saved ✓</button></div></div><div id="weatherSelected" class="weather-selected"><div><div id="weatherSelectedName" class="weather-selected-name"></div><div id="weatherSelectedMeta" class="weather-selected-meta"></div><div id="weatherLocationMessage"></div></div><div class="weather-coverage"><span class="weather-pill good">Met Office forecast</span><span class="weather-pill good">Nearest observations</span><span class="weather-pill good">Open-Meteo coordinates</span></div></div>';
  statusbar.insertAdjacentElement('afterend',panel);
  $('weatherLocationSearch').addEventListener('input',onSearchInput);
  $('weatherLocationSearch').addEventListener('keydown',onSearchKeydown);
  $('weatherLocationSave').addEventListener('click',saveLocation);
  document.addEventListener('click',function(e){if(!panel.contains(e.target))hideSuggestions()});
}

function setCurrent(loc){
  current=loc||null;
  if(!current){$('weatherCurrent').textContent='No weather location saved';return}
  $('weatherCurrent').innerHTML='<strong>'+esc(current.display_name||current.name)+'</strong><br>Met Office · '+esc(current.geohash)+' · '+esc(current.timezone||'timezone auto')+'<br>Saved '+esc(fmtDate(current.updated_at));
  if(!selected||sameLocation(selected,current)){
    selected=current;
    $('weatherLocationSearch').value=current.display_name||current.name||'';
  }
  updateSelectedCard();
  updatePreviewLocation();
}

function updateSelectedCard(){
  var box=$('weatherSelected'),btn=$('weatherLocationSave');if(!box||!btn)return;
  if(!selected){box.classList.remove('show');btn.disabled=true;btn.textContent='Choose a location';return}
  box.classList.add('show');
  $('weatherSelectedName').textContent=selected.display_name||selected.name;
  var meta=[];
  if(selected.location_type)meta.push(selected.location_type);
  if(Number.isFinite(Number(selected.latitude))&&Number.isFinite(Number(selected.longitude)))meta.push(Number(selected.latitude).toFixed(4)+', '+Number(selected.longitude).toFixed(4));
  meta.push('Met Office '+selected.geohash);
  $('weatherSelectedMeta').textContent=meta.join(' · ');
  var dirty=!sameLocation(selected,current);
  btn.disabled=!dirty;
  btn.textContent=dirty?'Use this location':'Saved ✓';
  btn.classList.toggle('saved',!dirty);
  $('weatherLocationMessage').innerHTML=dirty?'<div class="weather-warning">Selected but not saved. The scheduled task will continue using '+esc(current?current.display_name:'the current location')+' until you save.</div>':'';
  updatePreviewLocation();
}

function hideSuggestions(){var list=$('weatherLocationSuggestions'),input=$('weatherLocationSearch');if(list)list.hidden=true;if(input)input.setAttribute('aria-expanded','false')}

function onSearchInput(){
  var input=$('weatherLocationSearch'),term=input.value.trim();
  selected=null;updateSelectedCard();
  clearTimeout(searchTimer);
  if(term.length<3){$('weatherSearchStatus').textContent='Type '+(3-term.length)+' more character'+(3-term.length===1?'':'s')+' for suggestions.';hideSuggestions();return}
  $('weatherSearchStatus').textContent='Searching Met Office locations…';
  var seq=++searchSeq;
  searchTimer=setTimeout(async function(){
    try{
      var data=await call('search',{term:term});if(seq!==searchSeq)return;
      renderSuggestions(data.results||[]);
    }catch(e){if(seq!==searchSeq)return;$('weatherSearchStatus').textContent=e.message;hideSuggestions()}
  },260);
}

function renderSuggestions(results){
  var list=$('weatherLocationSuggestions'),input=$('weatherLocationSearch');
  if(!results.length){list.innerHTML='';list.hidden=true;input.setAttribute('aria-expanded','false');$('weatherSearchStatus').textContent='No Met Office forecast locations matched that search.';return}
  list.innerHTML=results.map(function(r,i){var type=r.location_type|| (r.domestic?'UK location':'World location');return'<button type="button" class="weather-option" role="option" data-index="'+i+'"><span><span class="weather-option-name">'+esc(r.display_name||r.name)+'</span><span class="weather-option-meta">'+esc(type)+'</span></span><span class="weather-option-side">'+(r.domestic?'UK':'World')+'</span></button>'}).join('');
  list._results=results;list.hidden=false;input.setAttribute('aria-expanded','true');$('weatherSearchStatus').textContent=results.length+' Met Office location'+(results.length===1?'':'s')+' found.';
  Array.from(list.querySelectorAll('.weather-option')).forEach(function(b){b.addEventListener('click',function(){chooseResult(results[Number(b.dataset.index)])})});
}

function chooseResult(r){
  selected=r;
  $('weatherLocationSearch').value=r.display_name||r.name;
  $('weatherSearchStatus').textContent='Selected '+(r.display_name||r.name)+'. Save to make it the scheduled weather location.';
  hideSuggestions();updateSelectedCard();
}

function onSearchKeydown(e){
  var list=$('weatherLocationSuggestions');
  if(e.key==='ArrowDown'&&!list.hidden){var first=list.querySelector('.weather-option');if(first){e.preventDefault();first.focus()}}
  if(e.key==='Escape')hideSuggestions();
}

async function saveLocation(){
  if(!selected||sameLocation(selected,current))return;
  var btn=$('weatherLocationSave');btn.disabled=true;btn.textContent='Validating…';
  $('weatherLocationMessage').innerHTML='<div class="weather-warning">Checking the location against both weather sources…</div>';
  try{
    var data=await call('save',{location:selected});
    setCurrent(data.location);selected=data.location;updateSelectedCard();
    $('weatherSearchStatus').textContent=data.message||'Weather location saved.';
    $('weatherLocationMessage').innerHTML='<div style="font-size:10px;color:var(--good);font-weight:700;margin-top:8px">Saved. Future agenda runs will use this location.</div>';
  }catch(e){btn.disabled=false;btn.textContent='Use this location';$('weatherLocationMessage').innerHTML='<div class="weather-error">'+esc(e.message)+'</div>'}
}

function updatePreviewLocation(){
  var loc=selected||current;if(!loc)return;
  var canvas=$('previewCanvas');if(!canvas)return;
  var kicker=canvas.querySelector('.ep-weather-kicker');if(kicker)kicker.textContent=String(loc.name||loc.display_name||'Weather').toUpperCase()+' WEATHER';
  var source=canvas.querySelector('.ep-source');if(source)source.innerHTML='Sources: <a>Met Office '+esc(loc.name||loc.display_name)+' forecast</a> and <a>nearest observations</a>, supplemented by <a>Open-Meteo</a> for missing values.';
}

function watchPreview(){
  var canvas=$('previewCanvas');if(!canvas||previewObserver)return;
  previewObserver=new MutationObserver(function(){updatePreviewLocation()});previewObserver.observe(canvas,{childList:true,subtree:true});updatePreviewLocation();
}

async function loadLocation(){
  if(!key())return;
  try{var data=await call('load');setCurrent(data.location);$('weatherSearchStatus').textContent='Type at least 3 characters to search for another location.'}
  catch(e){$('weatherCurrent').textContent='Could not load weather location';$('weatherSearchStatus').textContent=e.message}
}

function initWhenReady(){
  injectStyles();buildPanel();watchPreview();
  var app=$('app');if(app&&getComputedStyle(app).display!=='none'&&key())loadLocation();
  var login=$('loginBtn');if(login)login.addEventListener('click',function(){setTimeout(function(){if($('app')&&getComputedStyle($('app')).display!=='none')loadLocation()},500)});
  var reload=$('reloadBtn');if(reload)reload.addEventListener('click',function(){setTimeout(loadLocation,250)});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initWhenReady);else initWhenReady();
})();