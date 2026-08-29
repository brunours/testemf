(function(){
'use strict';
var core=document.createElement('script');
core.src='agenda-location-control-core.js?v=20260829c';
core.async=false;
core.onload=function(){
  var fix=document.createElement('script');
  fix.src='agenda-location-touch-fix.js?v=20260829c';
  fix.async=false;
  document.head.appendChild(fix);
};
document.head.appendChild(core);
})();
