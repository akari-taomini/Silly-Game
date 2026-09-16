// Dependency-free logic/DOM-stub regression checks. This is not browser visual QA.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const sourceDir = process.argv[2] || path.join(__dirname, '..');
let source = fs.readFileSync(path.join(sourceDir, 'index.js'), 'utf8');
const storage = new Map(), timers = new Map(), nodes = new Map();
let timerId = 0, opens = 0;
class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.dataset = {}; this.events = {};
    this.style = {setProperty(k,v){this[k]=v;}}; this.className = ''; this.textContent = ''; this.disabled = false;
    this.classList = {contains: c => this.className.split(' ').includes(c), add: c => {if(!this.classList.contains(c))this.className += ' '+c;},
      remove: c => {this.className=this.className.split(' ').filter(x=>x!==c).join(' ');},
      toggle: (c,on) => {on ??= !this.classList.contains(c); this.classList[on?'add':'remove'](c);}};
  }
  setAttribute(k,v){this.attrs[k]=String(v); if(k==='id')nodes.set(v,this); if(k==='hidden')this.hidden=true;}
  getAttribute(k){return this.attrs[k]??null;}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=[...items];}
  set innerHTML(v){this.children=[];this.html=v;} get innerHTML(){return this.html||'';}
  addEventListener(k,fn){(this.events[k]??=[]).push(fn);}
  removeEventListener(){}
  dispatch(type, fields={}){const e={type,button:0,isPrimary:true,pointerId:1,detail:1,clientX:0,clientY:0,preventDefault(){this.prevented=true;},...fields};for(const fn of this.events[type]||[])fn(e);return e;}
  click(){if(!this.disabled)this.dispatch('click',{detail:0});}
  getBoundingClientRect(){return {left:parseFloat(this.style.left)||0,top:parseFloat(this.style.top)||0,width:48,height:48};}
  setPointerCapture(id){this.capture=id;} hasPointerCapture(id){return this.capture===id;}
  releasePointerCapture(id){this.capture=null;this.dispatch('lostpointercapture',{pointerId:id});}
  querySelector(){return null;} querySelectorAll(){return [];}
}
const context = vm.createContext({console, structuredClone, localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},
  document:{currentScript:null,readyState:'loading',addEventListener(){},getElementById:k=>nodes.get(k)||null,querySelector:()=>null,querySelectorAll:()=>[],createElement:tag=>new Element(tag),body:new Element('body')},
  window:{innerWidth:390,innerHeight:844},
  setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),
  setInterval:fn=>{timers.set(++timerId,fn);return timerId;},clearInterval:id=>timers.delete(id),requestAnimationFrame:fn=>fn(),
  countOpen:()=>opens++,URL,AbortController});
context.window.setInterval=context.setInterval;context.window.setTimeout=context.setTimeout;
source = source.replace(/\}\)\(\);\s*$/, `
const originalResolveCompanions = resolveCharacterCompanions;
const originalResolvePlayer = resolveCharacterCompanionForPlayer;
window.test = {state, openCenter, closeCenter, openGame, renderHome, buildHeader, unoMakeDeck, unoNew, unoPlayable, unoApplyPlay, unoSave, unoLoad, unoCompanionTurn,
 stubCompanionSelection:()=>{resolveCharacterCompanions=()=>[{name:'Saved role'}];resolveCharacterCompanionForPlayer=()=>null;},
 restoreCompanionSelection:()=>{resolveCharacterCompanions=originalResolveCompanions;resolveCharacterCompanionForPlayer=originalResolvePlayer;},
 renderUno, bindFloatingDrag, setRestorePosition, getStoredLauncherPosition, setLauncherPosition,
 stubOpen:()=>{openCenter=()=>countOpen();},
 stubCompanion:(generate)=>{resolveCharacterCompanionForPlayer=()=>({name:'Test'});getLiveCompanionSettings=()=>({});generateCharacterCompanionAction=generate;}};
})();`);
vm.runInContext(source,context);
const api=context.window.test;
const results=[];
async function test(name,fn){if(process.env.STGC_TEST_FILTER&&!name.includes(process.env.STGC_TEST_FILTER))return;await fn();results.push(name);console.log('PASS '+name);}
function find(root,cls){return [root,...root.children.flatMap(n=>all(n))].filter(n=>n.classList?.contains(cls));}
function all(n){return [n,...(n.children||[]).flatMap(all)];}
function game(){const g=api.unoNew(); g.current=0;g.currentColor='red';g.discard=[{color:'red',type:'number',value:5}];g.hands[0]=[{color:'red',type:'number',value:3},{color:'blue',type:'number',value:5},{color:'wild',type:'wild',value:'变色'}];return g;}
(async()=>{
await test('UNO deck has 108 cards and 8 wild cards',()=>{const d=api.unoMakeDeck();assert.equal(d.length,108);assert.equal(d.filter(c=>c.color==='wild').length,8);});
await test('UNO initial deal conserves every card',()=>{const g=api.unoNew();assert.deepEqual(Array.from(g.hands,h=>h.length),[7,7,7,7]);assert.equal(g.deck.length+g.discard.length+28,108);});
await test('UNO color and number matching',()=>{const g=game();assert(api.unoPlayable(g.hands[0][0],g));assert(api.unoPlayable(g.hands[0][1],g));assert(!api.unoPlayable({color:'blue',type:'number',value:2},g));});
await test('UNO +4 cannot bypass a matching color',()=>{const g=game();assert(!api.unoPlayable({color:'wild',type:'wild4',value:'+4'},g,0));});
await test('UNO rejects wrong-turn, finished-game and invalid-index plays without mutation',()=>{for(const patch of [{current:1},{over:true},{}]){const g=Object.assign(game(),patch),before=JSON.stringify(g);assert.equal(api.unoApplyPlay(g,0,patch.current||patch.over?0:-1),false);assert.equal(JSON.stringify(g),before);}});
await test('UNO rejects stale pre-draw card selection',()=>{const g=game();g.drawnThisTurn=true;g.drawnCardIndex=2;assert.equal(api.unoApplyPlay(g,0,0),false);assert.equal(api.unoApplyPlay(g,0,2,'blue'),true);});
await test('UNO rejects invalid wildcard color',()=>{const g=game(),before=JSON.stringify(g);assert.equal(api.unoApplyPlay(g,0,2,'purple'),false);assert.equal(JSON.stringify(g),before);});
await test('UNO valid play advances the turn and conserves cards',()=>{const g=game(),n=g.hands[0].length;assert(api.unoApplyPlay(g,0,0));assert.equal(g.current,1);assert.equal(g.hands[0].length,n-1);assert.equal(g.discard.at(-1).value,3);});
await test('UNO reset hides stale wildcard picker; stale color cannot play',()=>{storage.clear();api.state.currentGame='uno';const g=game();api.unoSave(g);const body=new Element();api.renderUno(body);const wild=find(body,'uno-card').find(n=>n.classList.contains('wild'));wild.click();const picker=find(body,'uno-color-picker')[0];assert.equal(picker.hidden,false);all(body).find(n=>n.textContent==='重新开始').click();assert.equal(picker.hidden,true);assert.equal(picker.dataset.index,undefined);const before=JSON.stringify(api.state.uno);picker.children[0].click();assert.equal(JSON.stringify(api.state.uno),before);api.state.cleanup();api.state.cleanup=null;});
await test('UNO draw pile and toolbar share disabled state',()=>{storage.clear();const g=game();g.current=1;api.unoSave(g);const body=new Element();api.state.currentGame='uno';api.renderUno(body);assert.equal(find(body,'uno-deck')[0].disabled,true);api.state.cleanup();api.state.cleanup=null;});
await test('UNO finished hand does not expose playable buttons',()=>{storage.clear();const g=game();g.over=true;g.winner=1;api.unoSave(g);const body=new Element();api.state.currentGame='uno';api.renderUno(body);assert.equal(find(body,'playable').length,0);api.state.cleanup();api.state.cleanup=null;});
await test('UNO persisted card text is not interpreted as HTML',()=>{storage.clear();const g=game();g.hands[0][0].value='<img src=x onerror=alert(1)>';api.unoSave(g);const body=new Element();api.state.currentGame='uno';api.renderUno(body);assert(all(body).some(n=>n.textContent===g.hands[0][0].value));assert(!all(body).some(n=>n.innerHTML.includes('<img')));api.state.cleanup();api.state.cleanup=null;});
await test('Collapsed handle clamps to phone bounds and stores independent position',()=>{const handle=new Element();nodes.set('st-mini-game-center-restore',handle);api.setRestorePosition(9999,-10);assert.equal(handle.style.left,'354px');assert.equal(handle.style.top,'8px');assert.equal(JSON.parse(storage.get('stgc-restore-position-v1')).x,354);api.setRestorePosition(200,300,false);assert.equal(JSON.parse(storage.get('stgc-restore-position-v1')).x,354);});
await test('Corrupted launcher position is ignored',()=>{storage.set('stgc-launcher-position-v1','{"x":"bad","y":3}');assert.equal(api.getStoredLauncherPosition(),null);});
await test('Actual UNO header returns from an open overlay to the game menu',()=>{storage.clear();api.state.currentGame=null;api.state.lastGame=null;api.openCenter();api.openGame('uno');const root=nodes.get('st-mini-game-center');assert(root.classList.contains('show'));all(root).find(n=>n.attrs.title==='返回 Silly Game').click();assert.equal(api.state.currentGame,null);assert(find(root,'stgc-home-panel').length);assert.equal(api.state.cleanup,null);assert.equal(api.state.unoTimer,null);});
await test('Actual close button hides UNO, saves it and allows reopening',()=>{api.openGame('uno');let root=nodes.get('st-mini-game-center');const before=JSON.stringify(api.state.uno.hands);all(root).find(n=>n.attrs['aria-label']==='关闭 Silly Game').click();assert(!root.classList.contains('show'));assert.equal(api.state.currentGame,null);assert.equal(api.state.lastGame,'uno');api.openCenter();assert(root.classList.contains('show'));assert.equal(api.state.currentGame,'uno');assert.equal(JSON.stringify(api.state.uno.hands),before);api.closeCenter();});
await test('Every game header uses a working home navigation while the overlay is open',()=>{for(const id of ['uno','doudizhu','spider','gomoku','chess','xiangqi','sudoku','mines','2048','tetris','farm','match3','characterCompanion']){const root=nodes.get('st-mini-game-center');root.classList.add('show');api.state.currentGame=id;api.state.lastGame=id;const header=api.buildHeader({back:true,title:id});all(header).find(n=>n.attrs.title==='返回 Silly Game').click();assert.equal(api.state.currentGame,null,id);assert(find(root,'stgc-home-panel').length,id);}api.closeCenter();});
await test('Restart UNO stays on the same page and preserves local AI with saved roles',()=>{storage.clear();api.stubCompanionSelection();api.state.characterCompanion=null;const g=game();g.companion={enabled:false,settings:{}};api.unoSave(g);api.state.lastGame=null;api.openCenter();api.openGame('uno');const root=nodes.get('st-mini-game-center');assert.equal(api.state.uno.companion.enabled,false);const body=find(root,'stgc-game-body')[0];all(root).find(n=>n.textContent==='重新开始').click();assert.equal(api.state.currentGame,'uno');assert.equal(find(root,'stgc-game-body')[0],body);assert.equal(api.state.uno.companion.enabled,false);assert.equal(api.state.uno.hands[0].length,7);api.closeCenter();api.restoreCompanionSelection();});
await test('Reopening saved local UNO does not force companion mode from cached selections',()=>{storage.clear();api.stubCompanionSelection();api.state.characterCompanion={speak:true};const g=game();g.companion={enabled:false,settings:{}};api.unoSave(g);api.state.lastGame='uno';api.openCenter();assert.equal(api.state.uno.companion.enabled,false);api.closeCenter();api.state.characterCompanion=null;api.restoreCompanionSelection();});
await test('Restart UNO preserves companion mode, while explicit mode toggle controls it',()=>{storage.clear();api.stubCompanionSelection();const g=game();g.companion={enabled:true,settings:{}};api.unoSave(g);api.state.lastGame='uno';api.openCenter();const root=nodes.get('st-mini-game-center');all(root).find(n=>n.textContent==='重新开始').click();assert.equal(api.state.uno.companion.enabled,true);all(root).find(n=>n.tagName==='BUTTON'&&n.textContent.startsWith('角色陪玩 ·')).click();assert.equal(api.state.uno.companion.enabled,false);all(root).find(n=>n.textContent==='重新开始').click();assert.equal(api.state.uno.companion.enabled,false);api.closeCenter();api.state.characterCompanion=null;api.restoreCompanionSelection();});
await test('Doudizhu restart and reopen also preserve explicitly selected local AI',()=>{storage.clear();api.stubCompanionSelection();api.state.lastGame=null;api.openCenter();api.openGame('doudizhu');const root=nodes.get('st-mini-game-center');api.state.doudizhu.companion.enabled=false;api.state.characterCompanion={speak:true};all(root).find(n=>n.textContent==='重新开始').click();assert.equal(api.state.currentGame,'doudizhu');assert.equal(api.state.doudizhu.companion.enabled,false);api.closeCenter();api.openCenter();assert.equal(api.state.currentGame,'doudizhu');assert.equal(api.state.doudizhu.companion.enabled,false);api.closeCenter();api.state.characterCompanion=null;api.restoreCompanionSelection();});
await test('Duplicate launcher activation keeps the open game intact but back still works',()=>{storage.clear();api.state.lastGame=null;api.openCenter();api.openGame('uno');const root=nodes.get('st-mini-game-center'),body=find(root,'stgc-game-body')[0],g=api.state.uno;api.openCenter();assert.equal(find(root,'stgc-game-body')[0],body);assert.equal(api.state.uno,g);all(root).find(n=>n.attrs.title==='返回 Silly Game').click();assert.equal(api.state.currentGame,null);api.closeCenter();});
api.stubOpen();
await test('Mouse drag saves once, suppresses click, and releases pointer',()=>{const e=new Element(),saved=[];api.bindFloatingDrag(e,(x,y,save=true)=>{e.style.left=x+'px';e.style.top=y+'px';saved.push(save);});const before=opens;e.dispatch('pointerdown',{clientX:10,clientY:10});e.dispatch('pointermove',{clientX:100,clientY:90});e.dispatch('pointerup');e.dispatch('click');assert.equal(opens,before);assert.deepEqual(saved,[false,true]);assert.equal(e.capture,null);});
await test('Touch tap and keyboard open normally after a drag',()=>{const e=new Element();api.bindFloatingDrag(e,()=>{});const before=opens;e.dispatch('pointerdown',{pointerType:'touch'});e.dispatch('pointermove',{clientX:3,clientY:2});e.dispatch('pointerup');e.dispatch('click');e.dispatch('keydown',{key:'Enter'});assert.equal(opens,before+2);});
await test('Pointer cancellation never opens the game',()=>{const e=new Element();api.bindFloatingDrag(e,()=>{});const before=opens;e.dispatch('pointerdown');e.dispatch('pointercancel');e.dispatch('click');assert.equal(opens,before);});
await test('Secondary pointer cannot replace an active drag',()=>{const e=new Element(),pos=[];api.bindFloatingDrag(e,(x,y)=>pos.push([x,y]));e.dispatch('pointerdown',{pointerId:1});e.dispatch('pointerdown',{pointerId:2,isPrimary:false});e.dispatch('pointermove',{pointerId:2,clientX:100});assert.equal(pos.length,0);e.dispatch('pointermove',{pointerId:1,clientX:20});assert.equal(pos.length,1);});
await test('Rejected UNO request after leaving cannot mutate or save old game',async()=>{timers.clear();storage.clear();const g=game();g.current=1;g.companion={enabled:true,settings:{}};api.state.uno=g;api.state.currentGame='uno';let reject;api.stubCompanion(()=>new Promise((_,r)=>reject=r));const promise=api.unoCompanionTurn(g,()=>{});api.state.currentGame=null;const before=JSON.stringify(g);reject(new Error('expected'));await promise;assert.equal(JSON.stringify(g),before);assert.equal(storage.has('silly-game:uno:v1'),false);assert.equal(timers.size,0);});
await test('Second UNO response after exit cannot play, save, redraw or schedule',async()=>{timers.clear();storage.clear();const g=game();g.current=1;g.companion={enabled:true,settings:{}};g.deck=[{color:'red',type:'number',value:7}];api.state.uno=g;api.state.currentGame='uno';let resolveSecond,calls=0;api.stubCompanion(()=>++calls===1?Promise.resolve({action:'draw'}):new Promise(r=>resolveSecond=r));const promise=api.unoCompanionTurn(g,()=>{});for(let i=0;i<5&&!resolveSecond;i++)await Promise.resolve();assert(resolveSecond);api.state.unoSession++;const before=JSON.stringify(g);resolveSecond({action:'play',cardIndex:g.hands[1].length-1});await promise;assert.equal(JSON.stringify(g),before);assert.equal(storage.has('silly-game:uno:v1'),false);assert.equal(timers.size,0);});
await test('Theme selectors do not globally override semantic span/strong/b colors',()=>{const css=fs.readFileSync(path.join(sourceDir,'style.css'),'utf8');for(const tag of ['span','strong','b'])assert(!new RegExp('#st-mini-game-center '+tag+'[ ,{\\n]').test(css));assert(css.includes('#st-mini-game-center .ddz-card-red { color: #b4233c; }'));assert(css.includes('#st-mini-game-center [hidden] { display: none !important; }'));});
fs.writeFileSync(path.join(__dirname,'test-results.json'),JSON.stringify({passed:results.length,tests:results,scope:'Node VM + DOM stubs; no browser visual or live SillyTavern/API verification'},null,2));
console.log('TOTAL '+results.length+' PASSED');
})().catch(e=>{console.error(e);process.exitCode=1;});
