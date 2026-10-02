// Focused Spider rules checks; no host connection or user data.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
const block = src.slice(src.indexOf('    const SPIDER_LEVELS'), src.indexOf('    function formatTime'));
const context = vm.createContext({state:{spider:null}, recordGameWin:()=>{}});
vm.runInContext(block + '\nthis.api={newSpiderGame,spiderAudit,spiderMove,spiderDealStock,spiderUndo,spiderSnapshot,spiderCanPlace,spiderCheckCompleted,spiderFindHint};', context);
const a = context.api;
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS '+name); }
function use(g) { context.state.spider=g; return g; }
function valid(g) { assert.equal(a.spiderAudit(g).ok,true); }
function fixture(level='one') {
  const g=a.newSpiderGame(level); const deck=[...g.stock,...g.tableau.flat()].sort((a,b)=>a.id-b.id);
  deck.forEach(c=>c.faceUp=true); g.tableau=Array.from({length:10},()=>[]); g.stock=[];
  return {g,deck};
}
test('All three modes start with 104 distinct cards, 54 on board and 50 in stock',()=>{
 for(const mode of ['one','two','four']) for(let n=0;n<100;n++) {
  const g=a.newSpiderGame(mode); valid(g); assert.equal(g.stock.length,50);
  assert.equal(g.tableau.flat().length,54); assert.equal(g.tableau.flat().filter(c=>c.faceUp).length,10);
 }
});
test('Five stock rounds preserve every card; sixth deal changes nothing',()=>{
 for(const mode of ['one','two','four']) {
  const g=use(a.newSpiderGame(mode));
  for(let n=0;n<5;n++){assert(a.spiderDealStock()); valid(g); assert.equal(g.stock.length,40-10*n);}
  const before=a.spiderSnapshot(g); assert.equal(a.spiderDealStock(),false); assert.equal(a.spiderSnapshot(g),before);
 }
});
test('Missing, duplicate, wrong-rank and incomplete-stock states are rejected without manufacturing cards',()=>{
 for(const mutate of [g=>g.stock.pop(),g=>g.stock[0]=g.stock[1],g=>g.stock[0].rank=0,g=>g.tableau[0].push(g.stock.pop())]) {
  const g=use(a.newSpiderGame()); mutate(g); const before=a.spiderSnapshot(g);
  assert.equal(a.spiderAudit(g).ok,false); assert.equal(a.spiderDealStock(),false);
  assert.equal(a.spiderMove(0,g.tableau[0].length-1,1),false); assert.equal(a.spiderSnapshot(g),before);
 }
});
test('Exposed complete runs in source and destination are both collected and undo restores all cards',()=>{
 for(const mode of ['one','two','four']) {
  const {g,deck}=fixture(mode); use(g);
  g.tableau[0]=deck.slice(0,13).reverse().concat(deck[13]);
  g.tableau[1]=deck.slice(14,26).reverse();
  const remaining=deck.slice(26); g.stock=remaining.splice(0,50);
  remaining.forEach((c,i)=>g.tableau[2+i%8].push(c));
  valid(g); const before=a.spiderSnapshot(g);
  assert(a.spiderMove(0,13,1)); assert.equal(g.completed,2); valid(g);
  assert(a.spiderUndo()); assert.equal(a.spiderSnapshot(g),before); valid(g);
 }
});
test('Final run produces exactly eight completed runs and undo leaves a playable 13-card endgame',()=>{
 const {g,deck}=fixture(); use(g); g.completed=7;
 g.tableau[0]=[deck[91]]; g.tableau[1]=deck.slice(92).reverse(); valid(g);
 assert(a.spiderMove(0,0,1)); assert.equal(g.completed,8); assert.equal(g.won,true); valid(g);
 assert(a.spiderUndo()); assert.equal(g.won,false); assert.equal(g.completed,7); valid(g);
});
test('Corrupt undo snapshot cannot overwrite a healthy board',()=>{
 const g=use(a.newSpiderGame()); g.history.push('{invalid'); const before=a.spiderSnapshot(g);
 assert.equal(a.spiderUndo(),false); assert.equal(a.spiderSnapshot(g),before); valid(g);
});
test('Mixed legal moves, stock deals and undo keep the deck balanced in all three modes',()=>{
 let seed=17; const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
 for(const mode of ['one','two','four']) for(let n=0;n<12;n++) {
  const g=use(a.newSpiderGame(mode));
  for(let step=0;step<250&&!g.won;step++) {
   const moves=[];
   for(let from=0;from<10;from++) for(let i=0;i<g.tableau[from].length;i++) for(let to=0;to<10;to++)
    if(a.spiderCanPlace(g,from,i,to)) moves.push([from,i,to]);
   if(g.history.length && random(10)===0) a.spiderUndo();
   else if(g.stock.length && g.tableau.every(p=>p.length) && (!moves.length||random(7)===0)) a.spiderDealStock();
   else if(moves.length) a.spiderMove(...moves[random(moves.length)]);
   else break;
   valid(g);
  }
 }
});
console.log(`${passed} Spider checks passed.`);
