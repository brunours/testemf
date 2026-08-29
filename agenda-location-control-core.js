(function(){
'use strict';

var API='https://rbwcmjtcmhnivkmoxpsj.supabase.co/functions/v1/daily-agenda-location';
var current=null;
var selected=null;
var searchResults=[];
var searchTimer=null;
var searchSeq=0;
var previewObserver=null;

function $(id){return document.getElementById(id)}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]})}
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
  if($('weather-location-styles'))return;
  var s=document.createElement('style');
  s.id='weather-location-styles';
  s.textContent=`
.weather-location-panel{margin:14px 0 16px;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px;box-shadow:var(--shadow)}
.weather-location-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:12px}
.weather-location-title{font-size:15px;font-weight:800;color:var(--text)}
.weather-location-help{font-size:11px;color:var(--muted);line-height:1.45;margin-top:3px;max-width:850px}
.weather-location-current{font-size:11px;color:var(--muted);text-align:right}
.weather-location-current strong{color:var(--text);font-size:12px}
.weather-location-grid{display:grid;grid-template-columns:minmax(260px,1fr) auto;gap:10px;align-items:end}
.weather-search-label,.weather-results-label{display:block;font-size:11px;font-weight:760;margin-bottom:6px}
.weather-search-input{width:100%;border:1px solid var(--line);background:var(--panel2);color:var(--text);border-radius:9px;padding:11px 12px;font:inherit;font-size:13px;outline:none;box-sizing:border-box}
.weather-search-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 14%,transparent)}
.weather-results-wrap{margin-top:9px}
.weather-results{width:100%;box-sizing:border-box;border:1px solid var(--line);background:var(--panel2);color:var(--text);border-radius:9px;padding:4px;font:inherit;font-size:13px;line-height:1.35;min-height:48px;max-height:250px;outline:none}
.weather-results:focus{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 14%,transparent)}
.weather-results option{padding:8px 10px;min-height:38px}
.weather-search-status{font-size:10px;color:var(--muted);margin-top:6px;min-height:15px}
.weather-location-actions{display:flex;gap:8px}.weather-save{min-width:138px}.weather-save.saved{background:color-mix(in srgb,var(--good) 78%,var(--panel));border-color:var(--good)}
.weather-selected{display:none;margin-top:11px;border:1px solid var(--line);border-radius:9px;background:var(--panel2);padding:10px 11px;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center}
.weather-selected.show{display:grid}.weather-selected-name{font-size:12px;font-weight:800}.weather-selected-meta{font-size:10px;color:var(--muted);margin-top:3px}
.weather-coverage{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}.weather-pill{font-size:8px;font-weight:800;border:1px solid var(--line);border-radius:999px;padding:3px 6px;color:var(--muted);white-space:nowrap}.weather-pill.good{color:var(--good);border-color:color-mix(in srgb,var(--good) 45%,var(--line))}
.weather-warning{font-size:10px;color:var(--warn);font-weight:700;margin-top:8px}.weather-error{font-size:10px;color:var(--danger);font-weight:700;margin-top:8px}
@media(max-width:720px){.weather-location-head{display:block}.weather-location-current{text-align:left;margin-top:8px}.weather-location-grid{grid-template-columns:1fr}.weather-location-actions{justify-content:flex-start}.weather-selected{grid-template-columns:1fr}.weather-coverage{justify-content:flex-start}.weather-results{font-size:16px}.weather-search-input{font-size:16px}}
`;
  document.head.appendChild(s);
}

function buildPanel(){
  if($('weatherLocationPanel'))return;
  var statusbar=document.querySelector('.statusbar');if(!statusbar)return;
  var panel=document.createElement('section');
  panel.id='weatherLocationPanel';panel.className='weather-location-panel';
  panel.innerHTML='<div class="weather-location-head"><div><div class="weather-location-title">Weather location</div><div class="weather-location-help">Type at least 3 characters. Matching places come directly from the Met Office location catalogue. On iPad and iPhone, the matching locations use Safari’s native selection control for reliable touch input. Open-Meteo then uses the selected coordinates directly.</div></div><div id="weatherCurrent" class="weather-location-current">Loading current location…</div></div><div class="weather-location-grid"><div><label class="weather-search-label" for="weatherLocationSearch">Town, city or place</label><input id="weatherLocationSearch" class="weather-search-input" type="search" autocomplete="off" autocapitalize="words" placeholder="Start typing a location…"><div id="weatherResultsWrap" class="weather-results-wrap" hidden><label class="weather-results-label" for="weatherLocationSuggestions">Matching locations</label><select id="weatherLocationSuggestions" class="weather-results" size="5"><option value="" disabled selected>Tap a location to select it</option></select></div><div id="weatherSearchStatus" class="weather-search-status">Suggestions appear after 3 characters.</div></div><div class="weather-location-actions"><button id="weatherLocationSave" class="btn primary weather-save" type="button" disabled>Saved ✓</button></div></div><div id="weatherSelected" class="weather-selected"><div><div id="weatherSelectedName" class="weather-selected-name"></div><div id="weatherSelectedMeta" class="weather-selected-meta"></div><div id="weatherLocationMessage"></div></div><div class="weather-coverage"><span class="weather-pill good">Met Office forecast</span><span class="weather-pill good">Nearest observations</span><span class="weather-pill good">Open-Meteo coordinates</span></div></div>';
  statusbar.insertAdjacentElement('afterend',panel);
  $('weatherLocationSearch').addEventListener('input',onSearchInput);
  $('weatherLocationSuggestions').addEventListener('change',onResultSelected);
  $('weatherLocationSuggestions').addEventListener('input',onResultSelected);
  $('weatherLocationSave').addEventListener('click',saveLocation);
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
  if(!selected){box.classList.remove('show');btn.disabled=true;btn.textContent='Choose a location';btn.classList.remove('saved');return}
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

function hideResults(){
  var wrap=$('weatherResultsWrap'),sel=$('weatherLocationSuggestions');
  if(wrap)wrap.hidden=true;
  if(sel){sel.innerHTML='<option value="" disabled selected>Tap a location to select it</option>';sel.selectedIndex=0}
  searchResults=[];
}

function onSearchInput(){
  var term=$('weatherLocationSearch').value.trim();
  selected=null;updateSelectedCard();
  clearTimeout(searchTimer);
  searchSeq++;
  if(term.length<3){$('weatherSearchStatus').textContent='Type '+(3-term.length)+' more character'+(3-term.length===1?'':'s')+' for suggestions.';hideResults();return}
  $('weatherSearchStatus').textContent='Searching Met Office locations…';
  var seq=searchSeq;
  searchTimer=setTimeout(async function(){
    try{
      var data=await call('search',{term:term});
      if(seq!==searchSeq)return;
      renderResults(data.results||[]);
    }catch(e){
      if(seq!==searchSeq)return;
      $('weatherSearchStatus').textContent=e.message;
      hideResults();
    }
  },260);
}

function renderResults(results){
  var wrap=$('weatherResultsWrap'),sel=$('weatherLocationSuggestions');
  searchResults=results.slice();
  if(!results.length){hideResults();$('weatherSearchStatus').textContent='No Met Office forecast locations matched that search.';return}
  var html='<option value="" disabled selected>Tap a location to select it</option>';
  results.forEach(function(r,i){var type=r.location_type||(r.domestic?'UK location':'World location');html+='<option value="'+i+'">'+esc(r.display_name||r.name)+' — '+esc(type)+(r.domestic?' — UK':' — World')+'</option>'});
  sel.innerHTML=html;
  sel.size=Math.min(Math.max(results.length+1,3),7);
  sel.selectedIndex=0;
  wrap.hidden=false;
  $('weatherSearchStatus').textContent=results.length+' Met Office location'+(results.length===1?'':'s')+' found. Tap one in the list below.';
}

function onResultSelected(){
  var sel=$('weatherLocationSuggestions');
  if(!sel||sel.value==='')return;
  var idx=Number(sel.value);
  if(!Number.isInteger(idx)||!searchResults[idx])return;
  chooseResult(searchResults[idx]);
}

function chooseResult(r){
  selected=r;
  $('weatherLocationSearch').value=r.display_name||r.name;
  $('weatherSearchStatus').textContent='Selected '+(r.display_name||r.name)+'. Use the button to make it the scheduled weather location.';
  hideResults();
  updateSelectedCard();
}

async function saveLocation(){
  if(!selected||sameLocation(selected,current))return;
  var btn=$('weatherLocationSave');btn.disabled=true;btn.textContent='Validating…';
  $('weatherLocationMessage').innerHTML='<div class="weather-warning">Checking the location against both weather sources…</div>';
  try{
    var data=await call('save',{location:selected});
    selected=data.location;setCurrent(data.location);updateSelectedCard();
    $('weatherSearchStatus').textContent=data.message||'Weather location saved.';
    $('weatherLocationMessage').innerHTML='<div style="font-size:10px;color:var(--good);font-weight:700;margin-top:8px">Saved. Future agenda runs will use this location.</div>';
  }catch(e){
    btn.disabled=false;btn.textContent='Use this location';
    $('weatherLocationMessage').innerHTML='<div class="weather-error">'+esc(e.message)+'</div>';
  }
}

function updatePreviewLocation(){
  var loc=selected||current;if(!loc)return;
  var canvas=$('previewCanvas');if(!canvas)return;
  var kicker=canvas.querySelector('.ep-weather-kicker');
  var wantedKicker=String(loc.name||loc.display_name||'Weather').toUpperCase()+' WEATHER';
  if(kicker&&kicker.textContent!==wantedKicker)kicker.textContent=wantedKicker;
  var source=canvas.querySelector('.ep-source');
  if(source){
    var marker=String(loc.geohash||loc.display_name||loc.name||'location');
    if(source.dataset.weatherLocation!==marker){
      source.dataset.weatherLocation=marker;
      source.innerHTML='Sources: <a>Met Office '+esc(loc.name||loc.display_name)+' forecast</a> and <a>nearest observations</a>, supplemented by <a>Open-Meteo</a> for missing values.';
    }
  }
}

function watchPreview(){
  var canvas=$('previewCanvas');if(!canvas||previewObserver)return;
  previewObserver=new MutationObserver(function(){updatePreviewLocation()});
  previewObserver.observe(canvas,{childList:true,subtree:true});
  updatePreviewLocation();
}

async function loadLocation(){
  if(!key())return;
  try{
    var data=await call('load');
    setCurrent(data.location);
    $('weatherSearchStatus').textContent='Type at least 3 characters to search for another location.';
  }catch(e){
    $('weatherCurrent').textContent='Could not load weather location';
    $('weatherSearchStatus').textContent=e.message;
  }
}

function initWhenReady(){
  injectStyles();buildPanel();watchPreview();
  var app=$('app');if(app&&getComputedStyle(app).display!=='none'&&key())loadLocation();
  var login=$('loginBtn');if(login)login.addEventListener('click',function(){setTimeout(function(){if($('app')&&getComputedStyle($('app')).display!=='none')loadLocation()},500)});
  var reload=$('reloadBtn');if(reload)reload.addEventListener('click',function(){setTimeout(loadLocation,250)});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initWhenReady);else initWhenReady();
})();
