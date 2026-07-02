// Minimal DOM/Chart stubs to smoke-test app.js logic outside a browser
global.window = global;
class FakeEl {
  constructor(){ this._html=''; this._text=''; this.children=[]; this.classList={add(){},remove(){},toggle(){}}; this.dataset={}; }
  set innerHTML(v){ this._html = v; }
  get innerHTML(){ return this._html; }
  set textContent(v){ this._text = v; }
  get textContent(){ return this._text; }
  addEventListener(){}
  querySelectorAll(){ return []; }
  querySelector(){ return new FakeEl(); }
  getContext(){ return {}; }
  appendChild(){}
  get value(){ return ''; }
  set value(v){}
}
global.document = {
  getElementById(id){ return new FakeEl(); },
  querySelectorAll(sel){ return []; },
  addEventListener(evt, fn){ if(evt==='DOMContentLoaded') this.__ready = fn; },
  createElement(){ return new FakeEl(); },
};
global.navigator = { clipboard: { writeText: ()=>({then(fn){ fn && fn(); return {catch(){}} }}) } };
global.fetch = async (url, opts) => {
  return {
    ok: true,
    status: 200,
    json: async () => ({ content: [{type:'text', text:'This is a stubbed test answer.'}] })
  };
};
global.Chart = function(ctx, cfg){ this.destroy = ()=>{}; this._cfg = cfg; };
global.Chart.defaults = { font:{}, color:'', borderColor:'' };

global.SELLIN = require('./sellin_data.json');
global.ADS = require('./ads_data.json');

const fs = require('fs');
let code = fs.readFileSync('./app.js','utf8');
code = code.replace("document.addEventListener('DOMContentLoaded', init);", "");

const testCode = `
(async () => {
try {
  console.log('BRANDS count', BRANDS.length);
  initFilters();
  ['summary','sellin','country','returns','ads','products','es-gap','insights'].forEach(tab=>{
    switchTab(tab);
    console.log('OK tab:', tab);
  });

  state.countries = new Set(['ES']);
  ['summary','sellin','country','returns','ads','products','es-gap'].forEach(tab=>{ switchTab(tab); console.log('OK ES filter tab:', tab); });

  state.countries = new Set(['ES','FR','IT']);
  ['summary','sellin','country','returns','ads','products','es-gap'].forEach(tab=>{ switchTab(tab); console.log('OK ES+FR+IT filter tab:', tab); });

  state.countries = new Set(['PL']);
  switchTab('ads');
  console.log('OK PL ads-unavailable path');

  state.countries = new Set(['PL','SE','BE']);
  switchTab('ads');
  console.log('OK PL+SE+BE (no ads countries) unavailable path');

  state.countries = new Set(['DE','PL']);
  switchTab('ads');
  console.log('OK DE+PL mixed ads/non-ads path');

  state.countries = new Set();
  switchTab('summary'); switchTab('country'); switchTab('products');
  console.log('OK empty country selection (no data) path');

  state.countries = new Set(ALL_COUNTRIES); state.brand = 'INKEE'; state.q='';
  switchTab('products'); console.log('OK brand filter products');
  switchTab('ads'); console.log('OK brand filter ads');
  switchTab('es-gap');
  const esGapInkee = getEsGapRows();
  if(esGapInkee.some(r=>r.brand!=='INKEE')) throw new Error('es-gap brand filter leaked non-INKEE rows');
  console.log('OK brand filter es-gap, rows:', esGapInkee.length);
  const esGapDeInkee = getEsGapDeRows();
  if(esGapDeInkee.some(r=>r.brand!=='INKEE')) throw new Error('es-gap-de brand filter leaked non-INKEE rows');
  if(esGapDeInkee.some(r=>!['High','Medium','Low'].includes(r.priority))) throw new Error('es-gap-de produced an invalid priority value');
  console.log('OK brand filter es-gap-de, rows:', esGapDeInkee.length);

  state.brand='ALL'; state.q='bath bomb';
  switchTab('products'); console.log('OK search filter products');

  productsSubtab='units';
  switchTab('products'); console.log('OK units subtab');



  console.log('ALL SMOKE TESTS PASSED');
} catch(e){
  console.error('SMOKE TEST FAILED:', e.stack);
  process.exitCode = 1;
}
})();
`;

eval(code + testCode);

