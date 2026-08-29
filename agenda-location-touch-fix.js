(function(){
'use strict';

var lastActivation=0;

function optionFromEvent(e){
  var target=e.target;
  if(!target)return null;
  if(target.closest)return target.closest('.weather-option');
  while(target&&target!==document){
    if(target.classList&&target.classList.contains('weather-option'))return target;
    target=target.parentNode;
  }
  return null;
}

function activateTouchOption(e){
  var option=optionFromEvent(e);
  if(!option)return;
  var now=Date.now();
  if(now-lastActivation<450){
    if(e.cancelable)e.preventDefault();
    return;
  }
  lastActivation=now;
  if(e.cancelable)e.preventDefault();
  e.stopPropagation();
  option.click();
}

/*
  iPad/iPhone Safari can dismiss the autocomplete when the search input loses
  focus before it dispatches the synthetic click. Activate the option at the
  touch/pointer phase instead. The existing button click handler still owns
  the actual selection logic, so desktop/keyboard behaviour stays unchanged.
*/
document.addEventListener('touchstart',activateTouchOption,{capture:true,passive:false});
document.addEventListener('pointerdown',function(e){
  if(e.pointerType==='touch'||e.pointerType==='pen')activateTouchOption(e);
},true);

var style=document.createElement('style');
style.id='weather-location-touch-fix-styles';
style.textContent='\n.weather-location-panel{position:relative;z-index:120;}\n.weather-search-wrap{position:relative;z-index:130;}\n.weather-suggestions{z-index:1000;pointer-events:auto;-webkit-overflow-scrolling:touch;}\n.weather-option{min-height:44px;touch-action:manipulation;-webkit-tap-highlight-color:rgba(0,0,0,.06);user-select:none;-webkit-user-select:none;}\n.weather-option *{pointer-events:none;}\n';
document.head.appendChild(style);
})();
