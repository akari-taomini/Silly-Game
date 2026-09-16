// Focused static cascade checks, not a browser layout engine.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const dir=process.argv[2]||path.join(__dirname,'..');
const css=fs.readFileSync(path.join(dir,'style.css'),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
const rules=[];let viewport=390;
function parse(text,conditions=[]){let start=0;
 while(start<text.length){const open=text.indexOf('{',start);if(open<0)break;const pre=text.slice(start,open).trim();let i=open+1,depth=1,quote=null;
  for(;i<text.length&&depth;i++){const c=text[i];if(quote){if(c==='\\')i++;else if(c===quote)quote=null;continue;}if(c==='"'||c==="'")quote=c;else if(c==='{')depth++;else if(c==='}')depth--;}
  assert.equal(depth,0,'balanced CSS blocks');const body=text.slice(open+1,i-1);
  if(pre.startsWith('@media'))parse(body,[...conditions,pre]);
  else if(!pre.startsWith('@'))for(const selector of pre.split(',')){
   const decls=body.split(';').map(x=>{const k=x.indexOf(':');return k<0?null:{prop:x.slice(0,k).trim(),val:x.slice(k+1).replace(/!important/g,'').trim(),important:x.includes('!important')};}).filter(Boolean);
   rules.push({selector:selector.trim(),decls,conditions,order:rules.length});
  }
  start=i;
 }
}
parse(css);
const root={tag:'div',id:'st-mini-game-center',classes:[],attrs:{'data-stgc-theme-mode':'dark'},parent:null};
const panel={tag:'section',classes:['stgc-panel','stgc-game-panel','stgc-companion-game-panel'],attrs:{},parent:root};
function compound(selector,node){if(!node||selector.includes(':'))return false;const id=selector.match(/#([\w-]+)/)?.[1];if(id&&node.id!==id)return false;for(const c of selector.matchAll(/\.([\w-]+)/g))if(!node.classes.includes(c[1]))return false;
 for(const a of selector.matchAll(/\[([\w-]+)(?:=["']?([^\]"']+)["']?)?\]/g))if(!(a[1] in node.attrs)||(a[2]!==undefined&&node.attrs[a[1]]!==a[2]))return false;
 const tag=selector.match(/^[a-z][\w-]*/)?.[0];return !tag||tag===node.tag;
}
function matches(selector,node){const parts=selector.split(/\s+/);let i=parts.length-1;if(!compound(parts[i--],node))return false;let p=node.parent;for(;i>=0;i--){if(parts[i]==='>'){i--;if(!compound(parts[i],p))return false;p=p.parent;}else{while(p&&!compound(parts[i],p))p=p.parent;if(!p)return false;p=p.parent;}}return true;}
function specificity(s){return (s.match(/#/g)||[]).length*10000+((s.match(/\./g)||[]).length+(s.match(/\[/g)||[]).length)*100+(s.match(/(^|\s)[a-z][\w-]*/g)||[]).length;}
function property(node,prop){let winner=null;for(const rule of rules){if(rule.conditions.some(c=>/prefers-color-scheme:\s*light/.test(c)||(/max-width:\s*([\d.]+)px/.test(c)&&viewport>Number(c.match(/max-width:\s*([\d.]+)px/)[1]))||(/min-width:\s*([\d.]+)px/.test(c)&&viewport<Number(c.match(/min-width:\s*([\d.]+)px/)[1]))))continue;if(!matches(rule.selector,node))continue;for(const d of rule.decls)if(d.prop===prop){const score=(d.important?1e8:0)+specificity(rule.selector);if(!winner||score>winner.score||score===winner.score&&rule.order>=winner.order)winner={...d,score,order:rule.order};}}
 if(winner)return winner.val;if(prop.startsWith('--')&&node.parent)return property(node.parent,prop);return undefined;
}
function resolve(node,val){for(let i=0;i<12&&val?.includes('var(');i++)val=val.replace(/var\((--[\w-]+)\)/g,(_,key)=>property(node,key)||'UNRESOLVED');return val;}
for(const theme of ['light','dark']){root.attrs['data-stgc-theme-mode']=theme;assert.equal(resolve(panel,property(panel,'background-color')),theme==='dark'?'#151515':'#ffffff');assert.equal(resolve(panel,property(panel,'color')),theme==='dark'?'#ffffff':'#111111');}
const label={tag:'label',classes:['stgc-companion-character-option-name'],attrs:{},parent:panel};
assert.equal(resolve(label,property(label,'color')),'#ffffff');assert.equal(property(label,'min-height'),'44px');
const body={tag:'div',classes:['match3-game-body'],attrs:{},parent:panel};assert.equal(property(body,'position'),'relative');
assert(!css.includes('box-shadow: 66%'));
assert.equal(rules.filter(r=>r.selector==='#st-mini-game-center .match3-board').length,1,'one authoritative candy board rule');
const node=classes=>({tag:'div',classes,attrs:{},parent:panel});
for(const width of [390,1000]){viewport=width;assert.equal(property(node(['uno-opponent-avatar']),'width'),width===390?'68px':'84px');assert.equal(property(node(['ddz-avatar']),'width'),width===390?'68px':'84px');assert.equal(property(node(['stgc-board-companion-avatar']),'width'),width===390?'80px':'96px');assert.equal(property(node(['uno-color-picker']),'position'),'static');assert.equal(property(node(['ddz-seat']),'position'),'relative');assert.equal(property(node(['ddz-center']),'position'),'relative');}
const handle={tag:'div',id:'st-mini-game-center-restore',classes:[],attrs:{},parent:null};assert.equal(property(handle,'width'),'18px');assert.equal(property(handle,'height'),'40px');
console.log('PASS: CSS blocks, theme cascade, controls, candy rules, desktop/mobile avatar sizes, non-overlapping grid positioning and small handle dimensions');
fs.writeFileSync(path.join(__dirname,'css-test-results.json'),JSON.stringify({passed:true,scope:'Static cascade for targeted selectors; no browser hit-testing or visual rendering',rules:rules.length},null,2));
