/* Notes Bazar premium interactions — no dependencies. */
(function(){'use strict';
  var KEY='nb_desktop_mode';
  function setDesktopMode(on,notify){
    document.body.classList.toggle('nb-desktop-mode',!!on);
    var btn=document.getElementById('nbDesktopModeToggle');
    if(btn){btn.setAttribute('aria-checked',on?'true':'false');btn.title=on?'Turn off Desktop Mode':'Turn on Desktop Mode';}
    try{localStorage.setItem(KEY,on?'1':'0')}catch(e){}
    if(notify && typeof window.nbToast==='function') window.nbToast(on?'Desktop Mode enabled':'Desktop Mode disabled');
  }
  window.NBPremiumToggleDesktop=function(){setDesktopMode(!document.body.classList.contains('nb-desktop-mode'),true)};
  function enhance(){
    try{setDesktopMode(localStorage.getItem(KEY)==='1',false)}catch(e){setDesktopMode(false,false)}
    // Add a stable hook to the Quick Options grid without replacing its existing actions.
    var headings=document.querySelectorAll('#homeView h3');
    headings.forEach(function(h){if((h.textContent||'').trim().toLowerCase().indexOf('quick options')!==-1){var wrap=h.parentElement;if(wrap){var grid=wrap.querySelector(':scope > div');if(grid)grid.classList.add('nb-quick-options')}}});
    // Ensure drawer closes after choosing a navigation item, without overriding inline handlers.
    var drawer=document.getElementById('mobileMenuModal');
    if(drawer){drawer.querySelectorAll('.nbm-i[onclick*="switchView"]').forEach(function(btn){btn.addEventListener('click',function(){if(typeof window.closeModal==='function')window.closeModal('mobileMenuModal')})})}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhance);else enhance();
})();
