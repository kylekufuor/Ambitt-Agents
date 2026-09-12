// Installed only for an explicitly consented origin. Input values, editable
// text and password/login pages never enter the observation stream. A short
// lease disables capture when the owning portal tab disappears.
export function recorderSource(origin: string) {
  return `(() => {
    if (location.origin !== ${JSON.stringify(origin)}) return null;
    const key = '__ambittObservation';
    const visible = e => { const r=e.getBoundingClientRect(); return r.width>0 && r.height>0 && (e.checkVisibility ? e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}) : getComputedStyle(e).visibility!=='hidden'); };
    const read = (node,depth=0) => { if(depth>20) return ''; if(node.nodeType===3) return node.textContent||''; if(node.nodeType!==1 || !visible(node) || node.matches('input,textarea,form,[contenteditable]:not([contenteditable=false]),[data-private]')) return ''; return Array.from(node.childNodes).map(n=>read(n,depth+1)).join('').slice(0,4000); };
    const privatePage = () => Array.from(document.querySelectorAll('input[type=password],input[autocomplete=one-time-code]')).some(visible);
    let state=window[key];
    if (!state) {
      state=window[key]={until:0,events:[]};
      document.addEventListener('click', event => {
        if(Date.now()>state.until || privatePage()) return;
        const e=event.target.closest('button,a,[role=button],[role=tab],select,input[type=checkbox],input[type=radio]');
        if(!e || !visible(e) || e.closest('form,input:not([type=checkbox]):not([type=radio]),textarea,[contenteditable]:not([contenteditable=false]),[data-private]')) return;
        const label=(e.getAttribute('aria-label') || read(e) || e.getAttribute('name') || e.tagName).replace(/\\s+/g,' ').trim().slice(0,120);
        state.events.push({at:Date.now(),action:'Clicked',label});
        state.events=state.events.slice(-30);
      },true);
      document.addEventListener('change',event=>{
        if(Date.now()>state.until || privatePage()) return;
        const e=event.target;
        if(!e.matches('select,input[type=checkbox],input[type=radio]') || !visible(e) || e.closest('form,[contenteditable]:not([contenteditable=false]),[data-private]')) return;
        state.events.push({at:Date.now(),action:'Changed selection',label:(e.getAttribute('aria-label') || e.name || e.tagName).slice(0,120)});
      },true);
    }
    state.until=Date.now()+6000;
    if(privatePage()) { state.events=[]; return {title:'Private sign-in page',text:'',events:[],private:true}; }
    const text=Array.from(document.querySelectorAll('h1,h2,h3,p,td,th,label,[role=heading]'))
      .filter(e=>visible(e)&&!e.closest('form,input,textarea,[contenteditable]:not([contenteditable=false]),[data-private]'))
      .slice(0,1000).map(e=>read(e).trim()).filter(Boolean).join('\\n').slice(0,4000);
    const events=state.events.splice(0);
    return {title:document.title.slice(0,160),text,events,private:false};
  })()`;
}
export const stopRecorderSource = `(() => { if(window.__ambittObservation) { window.__ambittObservation.until=0; window.__ambittObservation.events=[]; } })()`;
