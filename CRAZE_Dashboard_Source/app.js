// ================= Utilities =================
const nfEUR0 = new Intl.NumberFormat('en-GB',{style:'currency',currency:'EUR',maximumFractionDigits:0});
const nfEUR2 = new Intl.NumberFormat('en-GB',{style:'currency',currency:'EUR',maximumFractionDigits:2});
const nfNum0 = new Intl.NumberFormat('en-GB',{maximumFractionDigits:0});
const nfNum1 = new Intl.NumberFormat('en-GB',{maximumFractionDigits:1});

function fmtEUR(v){ if(v===null||v===undefined||isNaN(v)) return '—'; return nfEUR0.format(v); }
function fmtEUR2(v){ if(v===null||v===undefined||isNaN(v)) return '—'; return nfEUR2.format(v); }
function fmtNum(v){ if(v===null||v===undefined||isNaN(v)) return '—'; return nfNum0.format(v); }
function fmtPct(v,d){ if(v===null||v===undefined||isNaN(v)) return 'n/a'; return (v*100>=0?'+':'') + (v*100).toFixed(d===undefined?1:d) + '%'; }
function fmtPctRaw(v,d){ if(v===null||v===undefined||isNaN(v)) return 'n/a'; return (v*100).toFixed(d===undefined?1:d) + '%'; }
function fmtPP(v,d){ if(v===null||v===undefined||isNaN(v)) return 'n/a'; return (v*100>=0?'+':'') + (v*100).toFixed(d===undefined?1:d) + 'pp'; }
function deltaClass(v){ if(v===null||v===undefined||isNaN(v)||v===0) return 'neutral'; return v>0?'pos':'neg'; }
function deltaClassInv(v){ if(v===null||v===undefined||isNaN(v)||v===0) return 'neutral'; return v>0?'neg':'pos'; } // for metrics where lower is better (ACOS, returns)
function esc(s){ if(s===null||s===undefined) return ''; return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function sum(arr,key){ return arr.reduce((a,r)=> a + (r[key]||0), 0); }
function round2(v){ return Math.round(v*100)/100; }
function safeDiv(a,b){ if(!b) return null; return a/b; }

const COUNTRY_NAMES = {AE:'UAE',BE:'Belgium',DE:'Germany',EG:'Egypt',ES:'Spain',FR:'France',GB:'United Kingdom',IE:'Ireland',IT:'Italy',NL:'Netherlands',PL:'Poland',SA:'Saudi Arabia',SE:'Sweden'};
const ADS_COUNTRIES = ['DE','ES','FR','IT','GB'];
const COUNTRY_COLORS = {DE:'#3B5BA5',ES:'#B8752E',FR:'#1E8E5A',IT:'#7B5EA7',GB:'#C0392B',SE:'#2C8FA8',NL:'#C9962E',PL:'#5E8C61',BE:'#8677B5',IE:'#4FA187',SA:'#B86B6B',AE:'#6E97C7',EG:'#A8ADB8'};
const ALL_COUNTRIES = SELLIN.byCountry.map(c=>c.country);
const ES_GAP_MIN_REVENUE = 500;

// ================= Lookup maps =================
const sellinMap = {}; SELLIN.products.forEach(p=>{ sellinMap[p.asin]=p; });
const adsMap = {}; ADS.adsByProduct.forEach(p=>{ adsMap[p.asin]=p; });
const BRANDS = [...new Set(SELLIN.products.map(p=>p.brand))].sort((a,b)=>a.localeCompare(b));

// ================= Filter state =================
// state.countries: Set of selected country codes. Starts with every country selected (= "all").
let state = { countries: new Set(ALL_COUNTRIES), brand:'ALL', q:'' };
let activeTab = 'summary';
const chartRegistry = {};
function destroyChart(id){ if(chartRegistry[id]){ chartRegistry[id].destroy(); delete chartRegistry[id]; } }

function isAllCountries(){ return state.countries.size===ALL_COUNTRIES.length; }
function selectedCountries(){ return [...state.countries]; }
function selectedAdsCountries(){ return selectedCountries().filter(c=>ADS_COUNTRIES.includes(c)); }

// ================= Normalizers =================
function normSellinRow(r){
  return { asin:r.a, country:r.c, brand:r.b, title:(sellinMap[r.a]&&sellinMap[r.a].title)||r.a,
    revenue2025:r.r5, revenue2026:r.r6, deltaRevenue:r.dr, deltaRevenuePct:r.drp,
    units2025:r.u5, units2026:r.u6, deltaUnits:r.du, deltaUnitsPct:r.dup,
    returns2025:r.rt5, returns2026:r.rt6, deltaReturns:r.rt6-r.rt5, status:r.st };
}
function normAdsRow(r){
  const meta = adsMap[r.a] || sellinMap[r.a];
  return { asin:r.a, country:r.c, brand: meta?meta.brand:'UNKNOWN', title: meta?meta.title:r.a,
    spend2025:r.s5, spend2026:r.s6, deltaSpend: round2(r.s6-r.s5), deltaSpendPct: r.s5? (r.s6-r.s5)/r.s5 : null,
    attribSales2025:r.as5, attribSales2026:r.as6, attribUnits2025:r.au5, attribUnits2026:r.au6,
    acos2025:r.ac5, acos2026:r.ac6, tacos2025:r.tc5, tacos2026:r.tc6 };
}

// ================= Filtering primitives =================
function matchesBrandSearch(brand, asin, title){
  if(state.brand!=='ALL' && brand!==state.brand) return false;
  if(state.q){
    const q = state.q.toLowerCase();
    if(!(String(asin).toLowerCase().includes(q) || String(title).toLowerCase().includes(q))) return false;
  }
  return true;
}

// ================= Aggregators (group per-country rows back up to one row per ASIN / total) =================
function aggregateProductsByAsin(rows){
  const map = {};
  rows.forEach(r=>{
    if(!map[r.asin]) map[r.asin] = {asin:r.asin, brand:r.brand, title:(sellinMap[r.asin]&&sellinMap[r.asin].title)||r.asin,
      revenue2025:0, revenue2026:0, units2025:0, units2026:0, returns2025:0, returns2026:0};
    const p = map[r.asin];
    p.revenue2025+=r.revenue2025; p.revenue2026+=r.revenue2026;
    p.units2025+=r.units2025; p.units2026+=r.units2026;
    p.returns2025+=r.returns2025; p.returns2026+=r.returns2026;
  });
  return Object.values(map).filter(p=> !(p.revenue2025===0 && p.revenue2026===0)).map(p=>{
    p.deltaRevenue = round2(p.revenue2026-p.revenue2025);
    p.deltaRevenuePct = safeDiv(p.deltaRevenue, p.revenue2025);
    p.deltaUnits = p.units2026-p.units2025;
    p.deltaUnitsPct = safeDiv(p.deltaUnits, p.units2025);
    p.deltaReturns = p.returns2026-p.returns2025;
    p.status = (p.revenue2025===0 && p.revenue2026>0) ? 'new' : ((p.revenue2026===0 && p.revenue2025>0) ? 'discontinued' : 'active');
    return p;
  });
}

function aggregateAdsByAsin(rows, sellInScopeCountries){
  const map = {};
  rows.forEach(r=>{
    if(!map[r.asin]) map[r.asin]={asin:r.asin, brand:r.brand, title:r.title, spend2025:0,spend2026:0,attribSales2025:0,attribSales2026:0,attribUnits2025:0,attribUnits2026:0};
    const p=map[r.asin];
    p.spend2025+=r.spend2025||0; p.spend2026+=r.spend2026||0;
    p.attribSales2025+=r.attribSales2025||0; p.attribSales2026+=r.attribSales2026||0;
    p.attribUnits2025+=r.attribUnits2025||0; p.attribUnits2026+=r.attribUnits2026||0;
  });
  const siByAsin = {};
  SELLIN.productsByCountry.forEach(r=>{
    if(!sellInScopeCountries.includes(r.c)) return;
    if(!siByAsin[r.a]) siByAsin[r.a] = {r5:0,r6:0};
    siByAsin[r.a].r5 += r.r5; siByAsin[r.a].r6 += r.r6;
  });
  return Object.values(map).map(p=>{
    const si = siByAsin[p.asin] || {r5:0,r6:0};
    p.deltaSpend = round2(p.spend2026-p.spend2025);
    p.deltaSpendPct = safeDiv(p.spend2026-p.spend2025, p.spend2025);
    p.acos2025 = safeDiv(p.spend2025, p.attribSales2025);
    p.acos2026 = safeDiv(p.spend2026, p.attribSales2026);
    p.tacos2025 = safeDiv(p.spend2025, si.r5);
    p.tacos2026 = safeDiv(p.spend2026, si.r6);
    return p;
  });
}

// Sell-in product rows (normalized, one row per ASIN), scoped by current country/brand/search filters
function getSellinProductRows(){
  if(isAllCountries()){
    return SELLIN.products.filter(p=> matchesBrandSearch(p.brand,p.asin,p.title));
  }
  const sel = state.countries;
  const raw = SELLIN.productsByCountry.filter(r=> sel.has(r.c)).map(normSellinRow);
  return aggregateProductsByAsin(raw).filter(p=> matchesBrandSearch(p.brand,p.asin,p.title));
}

function aggregateSellin(rows){
  const r5=sum(rows,'revenue2025'), r6=sum(rows,'revenue2026');
  const u5=sum(rows,'units2025'), u6=sum(rows,'units2026');
  const rt5=sum(rows,'returns2025'), rt6=sum(rows,'returns2026');
  return {
    revenue2025:r5, revenue2026:r6, deltaRevenue:round2(r6-r5), deltaRevenuePct: safeDiv(r6-r5,r5),
    units2025:u5, units2026:u6, deltaUnits:u6-u5, deltaUnitsPct: safeDiv(u6-u5,u5),
    aov2025: safeDiv(r5,u5), aov2026: safeDiv(r6,u6), deltaAov: safeDiv(r5,u5)!==null&&safeDiv(r6,u6)!==null? safeDiv(r6,u6)-safeDiv(r5,u5): null,
    returns2025:rt5, returns2026:rt6, deltaReturns:rt6-rt5, deltaReturnsPct: safeDiv(rt6-rt5,rt5),
    returnRate2025: safeDiv(rt5,u5), returnRate2026: safeDiv(rt6,u6),
  };
}

function getSellinOverall(){
  if(isAllCountries() && state.brand==='ALL' && !state.q) return SELLIN.overall;
  return aggregateSellin(getSellinProductRows());
}

function getByCountryRows(){
  // returns array of {country, ...aggregateSellin fields} for each selected country, respecting brand/search filters
  const countries = selectedCountries();
  if(state.brand==='ALL' && !state.q){
    return SELLIN.byCountry.filter(c=> state.countries.has(c.country));
  }
  return countries.map(cc=>{
    const rows = SELLIN.productsByCountry.filter(r=> r.c===cc).map(normSellinRow).filter(p=>matchesBrandSearch(p.brand,p.asin,p.title));
    const agg = aggregateSellin(rows);
    agg.country = cc;
    return agg;
  }).filter(a=> !(a.revenue2025===0 && a.revenue2026===0));
}

// Ads rows normalized (one row per ASIN), scoped by filters. Returns {rows, unavailable}
function getAdsProductRows(){
  if(isAllCountries()){
    const rows = ADS.adsByProduct.filter(p=> matchesBrandSearch(p.brand,p.asin,p.title)).map(p=> ({...p}));
    return {rows, unavailable:false};
  }
  const selAds = selectedAdsCountries();
  if(selAds.length===0) return {rows:[], unavailable:true};
  const raw = ADS.adsByProductCountry.filter(r=> selAds.includes(r.c)).map(normAdsRow);
  const rows = aggregateAdsByAsin(raw, selAds).filter(p=>matchesBrandSearch(p.brand,p.asin,p.title));
  return {rows, unavailable:false};
}

function aggregateAds(rows){
  const s5=sum(rows,'spend2025'), s6=sum(rows,'spend2026');
  const as5=sum(rows,'attribSales2025'), as6=sum(rows,'attribSales2026');
  const au5=sum(rows,'attribUnits2025'), au6=sum(rows,'attribUnits2026');
  return {spend2025:s5, spend2026:s6, deltaSpend:round2(s6-s5), deltaSpendPct: safeDiv(s6-s5,s5),
    attribSales2025:as5, attribSales2026:as6, attribUnits2025:au5, attribUnits2026:au6,
    acos2025: safeDiv(s5,as5), acos2026: safeDiv(s6,as6),
    costPerUnit2025: safeDiv(s5,au5), costPerUnit2026: safeDiv(s6,au6) };
}

function getAdsOverall(){
  const selAds = isAllCountries() ? ADS_COUNTRIES : selectedAdsCountries();
  if(selAds.length===0) return {unavailable:true};
  if(isAllCountries() && state.brand==='ALL' && !state.q){
    return {...ADS.adsOverall, unavailable:false};
  }
  const {rows} = getAdsProductRows();
  const base = aggregateAds(rows);
  const sRows = SELLIN.productsByCountry.filter(r=> selAds.includes(r.c) && (state.brand==='ALL'||r.b===state.brand) && (!state.q || matchesBrandSearch(r.b,r.a,(sellinMap[r.a]&&sellinMap[r.a].title)||r.a)));
  const sAgg = aggregateSellin(sRows.map(normSellinRow));
  base.tacos2025 = safeDiv(base.spend2025, sAgg.revenue2025);
  base.tacos2026 = safeDiv(base.spend2026, sAgg.revenue2026);
  base.sellInRevenueUsed2025 = sAgg.revenue2025;
  base.sellInRevenueUsed2026 = sAgg.revenue2026;
  base.unavailable = false;
  return base;
}

function getAdsByCountryRows(){
  const countries = isAllCountries() ? ADS_COUNTRIES : selectedAdsCountries();
  if(countries.length===0) return [];
  if(state.brand==='ALL' && !state.q){
    return ADS.adsByCountry.filter(c=> countries.includes(c.country));
  }
  return countries.map(cc=>{
    const rows = ADS.adsByProductCountry.filter(r=>r.c===cc).map(normAdsRow).filter(p=>matchesBrandSearch(p.brand,p.asin,p.title));
    const agg = aggregateAds(rows);
    const sRows = SELLIN.productsByCountry.filter(r=> r.c===cc && (state.brand==='ALL'||r.b===state.brand));
    const sAgg = aggregateSellin(sRows.map(normSellinRow));
    agg.country = cc;
    agg.tacos2025 = safeDiv(agg.spend2025, sAgg.revenue2025);
    agg.tacos2026 = safeDiv(agg.spend2026, sAgg.revenue2026);
    agg.sellInRevenue2025 = sAgg.revenue2025; agg.sellInRevenue2026 = sAgg.revenue2026;
    return agg;
  }).filter(a=>a.spend2025>0||a.spend2026>0);
}

// Products with meaningful 2026 revenue in other countries but no 2026 revenue in Spain.
// Country filter is intentionally ignored — the whole point is comparing presence across countries.
function getEsGapRows(){
  const countriesByAsin = {};
  const esByAsin = {};
  SELLIN.productsByCountry.forEach(r=>{
    if(r.r6>0){
      if(!countriesByAsin[r.a]) countriesByAsin[r.a] = new Set();
      countriesByAsin[r.a].add(r.c);
    }
    if(r.c==='ES') esByAsin[r.a] = r;
  });
  return SELLIN.products
    .filter(p=> p.revenue2026>0)
    .filter(p=> !(countriesByAsin[p.asin] && countriesByAsin[p.asin].has('ES')))
    .filter(p=> p.revenue2026 > ES_GAP_MIN_REVENUE)
    .filter(p=> matchesBrandSearch(p.brand,p.asin,p.title))
    .map(p=>{
      const countries = countriesByAsin[p.asin] ? [...countriesByAsin[p.asin]].sort() : [];
      const countriesLabel = countries.length<=3 ? countries.join(', ') : countries.slice(0,3).join(', ')+' +'+(countries.length-3);
      const es = esByAsin[p.asin];
      // esRevenue2025 tells "never sold in Spain" (0) apart from "was sold, discontinued" (>0).
      // esRevenue2026 would always be 0 here by construction (that's why the ASIN is in this list).
      return {asin:p.asin, brand:p.brand, title:p.title, revenue2026:p.revenue2026, units2026:p.units2026,
        countries, countryCount: countries.length, countriesLabel,
        esRevenue2025: es ? es.r5 : 0};
    });
}

// Germany-sold candidates from getEsGapRows(), enriched with Germany-specific revenue/AOV/
// return-rate/ACOS and a Priority signal (brand already live in Spain de-risks VAT/GPSR
// registration; a return rate well above the company average is a product-fit red flag).
function getEsGapDeRows(){
  const deByAsin = {};
  SELLIN.productsByCountry.forEach(r=>{ if(r.c==='DE') deByAsin[r.a] = r; });
  const deAdsByAsin = {};
  ADS.adsByProductCountry.forEach(r=>{ if(r.c==='DE') deAdsByAsin[r.a] = r; });
  const brandLiveInEs = new Set();
  SELLIN.productsByCountry.forEach(r=>{ if(r.c==='ES' && r.r6>0) brandLiveInEs.add(r.b); });
  const companyReturnRate = SELLIN.overall.returnRate2026;

  return getEsGapRows()
    .filter(r=> r.countries.includes('DE'))
    .map(r=>{
      const de = deByAsin[r.asin];
      const ads = deAdsByAsin[r.asin];
      const revenueDe2026 = de ? de.r6 : 0;
      const unitsDe2026 = de ? de.u6 : 0;
      const aovDe2026 = safeDiv(revenueDe2026, unitsDe2026);
      const returnRateDe2026 = safeDiv(de ? de.rt6 : 0, unitsDe2026);
      const acosDe2026 = (ads && ads.ac6!==undefined) ? ads.ac6 : null;
      const brandAlreadyInEs = brandLiveInEs.has(r.brand);
      const returnRateHigh = returnRateDe2026!==null && companyReturnRate!==null && returnRateDe2026 > companyReturnRate*1.5;
      const returnRateHealthy = returnRateDe2026===null || companyReturnRate===null || returnRateDe2026 <= companyReturnRate*1.2;
      let priority = 'Medium';
      if(returnRateHigh) priority = 'Low';
      else if(brandAlreadyInEs && returnRateHealthy) priority = 'High';
      return {asin:r.asin, brand:r.brand, title:r.title, revenueDe2026, unitsDe2026, aovDe2026,
        returnRateDe2026, acosDe2026, brandAlreadyInEs, priority,
        esRevenue2025:r.esRevenue2025};
    });
}
// ================= Chart.js theme =================
function isDarkMode() {
  if (typeof document === 'undefined' || !document.documentElement) return true;
  return (document.documentElement.getAttribute('data-theme') || 'dark') === 'dark';
}

function applyChartTheme() {
  const isDark = isDarkMode();
  Chart.defaults.color = isDark ? '#9FA8B8' : '#5B6472';
  Chart.defaults.borderColor = isDark ? '#23283B' : '#E2E5EB';
  Chart.defaults.font.family = "'Inter', sans-serif";
  Chart.defaults.font.size = 11;
}
applyChartTheme();

function getChartColors() {
  const isDark = isDarkMode();
  return {
    c2025: isDark ? '#23283B' : '#CBD1DA',
    c2026_rev: isDark ? '#4F73C2' : '#1F2E4D',
    c2026_units: isDark ? '#10B981' : '#1E8E5A',
    c2026_returns: isDark ? '#EF4444' : '#C0392B',
    c2026_spend: isDark ? '#4F73C2' : '#1F2E4D',
    c2026_tacos: isDark ? '#3B5BA5' : '#3B5BA5',
    c2025_aov: isDark ? '#626C80' : '#9AA6B8',
    c2026_aov: isDark ? '#DCA263' : '#1F2E4D'
  };
}

function baseBarOpts(extra){
  const isDark = isDarkMode();
  const textColor = isDark ? '#9FA8B8' : '#5B6472';
  const textFaint = isDark ? '#626C80' : '#8A93A3';
  const gridColor = isDark ? '#1C202F' : '#EDEFF2';
  const tooltipBg = isDark ? '#131622' : '#1F2E4D';
  const tooltipBorder = isDark ? '#23283B' : '#2A3B5C';
  const tooltipText = isDark ? '#F1F3F6' : '#fff';
  const tooltipBody = isDark ? '#9FA8B8' : '#EDEFF4';

  return Object.assign({
    responsive:true, maintainAspectRatio:false,
    plugins:{ 
      legend:{display:true, labels:{color:textColor, usePointStyle:true, boxWidth:8, font:{size:11, family:"'Inter',sans-serif"}}},
      tooltip:{backgroundColor:tooltipBg, borderColor:tooltipBorder, borderWidth:1, titleColor:tooltipText, bodyColor:tooltipBody, padding:10, cornerRadius:6, titleFont:{family:"'Inter',sans-serif",weight:'700'}, bodyFont:{family:"'IBM Plex Mono',monospace"}} 
    },
    scales:{ 
      x:{grid:{display:false}, ticks:{color:textFaint, font:{family:"'IBM Plex Mono',monospace", size:10.5}}}, 
      y:{grid:{color:gridColor}, ticks:{color:textFaint, font:{family:"'IBM Plex Mono',monospace", size:10.5}}} 
    }
  }, extra||{});
}

function makeChart(id, config){
  destroyChart(id);
  const el = document.getElementById(id);
  if(!el) return;
  chartRegistry[id] = new Chart(el.getContext('2d'), config);
}

// ================= Table engine =================
const tableData = {};
function registerTable(id, rows, columns, rowRenderer, defaultSortKey, defaultDir){
  tableData[id] = { rows, columns, rowRenderer, sortKey:defaultSortKey, sortDir:defaultDir||'desc' };
}
function sortRows(t){
  t.rows.sort((a,b)=>{
    let av=a[t.sortKey], bv=b[t.sortKey];
    if(av===null||av===undefined) av = typeof bv==='string' ? '' : -Infinity;
    if(bv===null||bv===undefined) bv = typeof av==='string' ? '' : -Infinity;
    if(typeof av==='string' || typeof bv==='string') return t.sortDir==='desc'? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv));
    return t.sortDir==='desc'? bv-av : av-bv;
  });
}
function tableHTML(id){
  const t = tableData[id];
  sortRows(t);
  let thead = '<tr>' + t.columns.map(c=>`<th class="${c.left?'left':''} ${t.sortKey===c.key?'sorted':''}" onclick="sortTableBy('${id}','${c.key}')">${esc(c.label)}${t.sortKey===c.key?(t.sortDir==='desc'?' \u25BE':' \u25B4'):''}</th>`).join('') + '</tr>';
  let tbody = t.rows.length ? t.rows.map(t.rowRenderer).join('') : `<tr><td colspan="${t.columns.length}" class="left"><div class="empty-state">No rows match the current filters.</div></td></tr>`;
  return `<div class="table-toolbar"><span class="panel-sub" style="margin:0">${t.rows.length} row${t.rows.length===1?'':'s'}</span><button class="btn" onclick="copyTable('${id}')">Copy table</button></div><div class="table-wrap"><table id="tbl-${id}"><thead>${thead}</thead><tbody>${tbody}</tbody></table></div>`;
}
function tableContainer(id){ return `<div id="container-${id}">${tableHTML(id)}</div>`; }
function sortTableBy(id,key){
  const t = tableData[id];
  if(!t) return;
  if(t.sortKey===key) t.sortDir = t.sortDir==='desc'?'asc':'desc'; else { t.sortKey=key; t.sortDir='desc'; }
  const container = document.getElementById('container-'+id);
  if(container) container.innerHTML = tableHTML(id);
}
function copyTable(id){
  const table = document.getElementById('tbl-'+id);
  if(!table) return;
  let tsv = [];
  table.querySelectorAll('tr').forEach(tr=>{
    let cells = [...tr.children].map(td=> td.innerText.replace(/\t/g,' ').replace(/\n/g,' '));
    tsv.push(cells.join('\t'));
  });
  navigator.clipboard.writeText(tsv.join('\n')).then(()=> showToast('Table copied — paste into Sheets or Excel'));
}
function showToast(msg){
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(window.__toastT);
  window.__toastT = setTimeout(()=> el.classList.remove('show'), 2000);
}

// ================= KPI card =================
function kpiCard(label, value, deltaVal, deltaText, invert, prevText){
  const cls = invert ? deltaClassInv(deltaVal) : deltaClass(deltaVal);
  const arrow = (deltaVal===null||deltaVal===undefined||isNaN(deltaVal)||deltaVal===0) ? '' : (deltaVal>0?'\u2191':'\u2193');
  return `<div class="kpi">
    <div class="label">${esc(label)}</div>
    <div class="value">${value}</div>
    ${prevText?`<div class="prev">${prevText}</div>`:''}
    <div class="delta ${cls}">${arrow} ${deltaText}</div>
  </div>`;
}

function statusBadge(st){
  if(st==='new') return '<span class="status-badge status-new">New</span>';
  if(st==='discontinued') return '<span class="status-badge status-discontinued">Discontinued</span>';
  return '';
}

function priorityBadge(p){
  if(p==='High') return '<span class="status-badge status-new">High</span>';
  if(p==='Low') return '<span class="status-badge status-discontinued">Low</span>';
  return '<span class="status-badge" style="background:var(--panel2);color:var(--text-dim)">Medium</span>';
}

function productCell(asin,title){
  return `<div class="prod-title" title="${esc(title)}">${esc(title)}</div><div class="asin">${esc(asin)}</div>`;
}
const TABS = [
  {id:'summary', label:'Executive Summary'},
  {id:'sellin', label:'Sell-In Performance'},
  {id:'country', label:'Country Breakdown'},
  {id:'returns', label:'Returns Analysis'},
  {id:'ads', label:'Advertising Performance'},
  {id:'products', label:'Product Winners & Losers'},
  {id:'es-gap', label:'España — Oportunidades'},
  {id:'insights', label:'Key Insights & Recommendations'},
];
let productsSubtab = 'revenue';

function scopeLabel(){
  let parts = [];
  if(isAllCountries()) parts.push('All countries');
  else if(state.countries.size===0) parts.push('No countries selected');
  else if(state.countries.size<=4) parts.push([...state.countries].sort().join(', '));
  else parts.push(state.countries.size+' countries selected');
  parts.push(state.brand==='ALL' ? 'All brands' : state.brand);
  if(state.q) parts.push('"'+state.q+'"');
  return parts.join(' \u00b7 ');
}

// ================================= SUMMARY =================================
function renderSummary(){
  const o = getSellinOverall();
  const a = getAdsOverall();
  const scoped = !(isAllCountries()&&state.brand==='ALL'&&!state.q);

  let kpis = '';
  kpis += kpiCard('Sell-In Revenue', fmtEUR(o.revenue2026), o.deltaRevenuePct, fmtPct(o.deltaRevenuePct)+' YoY', false, fmtEUR(o.revenue2025)+' in 2025');
  kpis += kpiCard('Units Sold', fmtNum(o.units2026), o.deltaUnitsPct, fmtPct(o.deltaUnitsPct)+' YoY', false, fmtNum(o.units2025)+' in 2025');
  kpis += kpiCard('Average Ticket', fmtEUR2(o.aov2026), o.deltaAov, (o.deltaAov>=0?'+':'')+fmtEUR2(o.deltaAov)+' YoY', false, fmtEUR2(o.aov2025)+' in 2025');
  if(!a.unavailable){
    const deltaAdSalesPct = safeDiv(a.attribSales2026-a.attribSales2025, a.attribSales2025);
    kpis += kpiCard('Ad Sales', fmtEUR(a.attribSales2026), deltaAdSalesPct, fmtPct(deltaAdSalesPct)+' YoY', false, fmtEUR(a.attribSales2025)+' in 2025');
    kpis += kpiCard('Ad Spend', fmtEUR(a.spend2026), a.deltaSpendPct, fmtPct(a.deltaSpendPct)+' YoY', true, fmtEUR(a.spend2025)+' in 2025');
    kpis += kpiCard('ACOS', fmtPctRaw(a.acos2026), a.acos2026-a.acos2025, fmtPP(a.acos2026-a.acos2025)+' YoY', true, fmtPctRaw(a.acos2025)+' in 2025');
    kpis += kpiCard('TACOS', fmtPctRaw(a.tacos2026), a.tacos2026-a.tacos2025, fmtPP(a.tacos2026-a.tacos2025)+' YoY', true, fmtPctRaw(a.tacos2025)+' in 2025');
  } else {
    kpis += kpiCard('Ad Spend', '—', null, 'No ads data for this filter', true, 'Ads cover DE / ES / FR / IT / UK only');
  }
  kpis += kpiCard('Returns', fmtNum(o.returns2026), o.deltaReturnsPct, fmtPct(o.deltaReturnsPct)+' YoY', true, 'Return rate '+fmtPctRaw(o.returnRate2026));

  const byCountry = getByCountryRows().slice().sort((x,y)=>y.revenue2026-x.revenue2026).slice(0,8);

  let insights = '';
  const growthFromUnits = o.deltaUnitsPct!==null && o.deltaRevenuePct!==null;
  if(growthFromUnits){
    const unitDriven = o.deltaUnitsPct > o.deltaRevenuePct;
    insights += `<div class="insight-card"><span class="tag">Growth mix</span><p>Revenue is ${fmtPct(o.deltaRevenuePct)} while units are ${fmtPct(o.deltaUnitsPct)}. Growth is <b>${unitDriven?'volume-led':'price-led'}</b> — average ticket moved ${o.deltaAov>=0?'up':'down'} ${fmtEUR2(Math.abs(o.deltaAov))} to ${fmtEUR2(o.aov2026)}.</p></div>`;
  }
  if(!a.unavailable && a.tacos2025!==null && a.tacos2026!==null){
    const tacosImproved = a.tacos2026 < a.tacos2025;
    insights += `<div class="insight-card ${tacosImproved?'good':'warn'}"><span class="tag">Ad efficiency</span><p>TACOS ${tacosImproved?'improved':'worsened'} from ${fmtPctRaw(a.tacos2025)} to ${fmtPctRaw(a.tacos2026)} while ad spend moved ${fmtPct(a.deltaSpendPct)}. ${tacosImproved?'Sell-in grew faster than ad spend.':'Ad spend is growing faster than sell-in revenue in this scope.'}</p></div>`;
  }
  if(byCountry.length>1){
    const top = byCountry.slice().sort((x,y)=>y.deltaRevenue-x.deltaRevenue)[0];
    const bottom = byCountry.slice().sort((x,y)=>x.deltaRevenue-y.deltaRevenue)[0];
    insights += `<div class="insight-card"><span class="tag">Country contribution</span><p><b>${COUNTRY_NAMES[top.country]||top.country}</b> contributed the largest revenue gain (${fmtEUR(top.deltaRevenue)}), while <b>${COUNTRY_NAMES[bottom.country]||bottom.country}</b> ${bottom.deltaRevenue<0?'pulled the total down the most ('+fmtEUR(bottom.deltaRevenue)+')':'grew the least ('+fmtEUR(bottom.deltaRevenue)+')'}.</p></div>`;
  }

  document.getElementById('content').innerHTML = `
  <section class="section active" id="tab-summary">
    <div class="row-title"><div><h2 class="section-title">Executive Summary</h2><div class="section-desc">Scope: ${esc(scopeLabel())}${scoped?' <span class="dim-text">(filtered)</span>':''}</div></div></div>
    <div class="grid grid-4 block">${kpis}</div>
    <div class="grid" style="grid-template-columns:1.4fr 1fr; gap:14px;" class="block">
      <div class="panel">
        <div class="panel-title">Revenue by country — 2025 vs 2026</div>
        <div class="panel-sub">Top markets by 2026 sell-in revenue</div>
        <div class="chart-box"><canvas id="chart-summary-country"></canvas></div>
      </div>
      <div class="panel">
        <div class="panel-title">What's moving the numbers</div>
        <div class="panel-sub">Auto-generated from the current filter scope</div>
        ${insights || '<div class="empty-state">Not enough data in this filter to summarize.</div>'}
      </div>
    </div>
  </section>`;

  const cc = getChartColors();
  makeChart('chart-summary-country', {
    type:'bar',
    data:{ labels: byCountry.map(c=>c.country),
      datasets:[
        {label:'2025', data: byCountry.map(c=>c.revenue2025), backgroundColor:cc.c2025, borderRadius:3, maxBarThickness:22},
        {label:'2026', data: byCountry.map(c=>c.revenue2026), backgroundColor:cc.c2026_rev, borderRadius:3, maxBarThickness:22},
      ]},
    options: baseBarOpts({ plugins:{ legend:{display:true}, tooltip:{callbacks:{label:(ctx)=> ctx.dataset.label+': '+fmtEUR(ctx.parsed.y)}} } })
  });
}

// ================================= SELL-IN =================================
function renderSellIn(){
  const o = getSellinOverall();
  const byCountry = getByCountryRows().slice().sort((x,y)=>y.revenue2026-x.revenue2026);

  let kpis = '';
  kpis += kpiCard('Revenue 2026', fmtEUR(o.revenue2026), o.deltaRevenuePct, fmtPct(o.deltaRevenuePct)+' vs 2025', false, fmtEUR(o.revenue2025)+' in 2025');
  kpis += kpiCard('\u0394 Revenue', fmtEUR(o.deltaRevenue), o.deltaRevenue, fmtPct(o.deltaRevenuePct), false);
  kpis += kpiCard('Units 2026', fmtNum(o.units2026), o.deltaUnitsPct, fmtPct(o.deltaUnitsPct)+' vs 2025', false, fmtNum(o.units2025)+' in 2025');
  kpis += kpiCard('\u0394 Units', fmtNum(o.deltaUnits), o.deltaUnits, fmtPct(o.deltaUnitsPct), false);
  kpis += kpiCard('Avg. Ticket 2026', fmtEUR2(o.aov2026), o.deltaAov, (o.deltaAov>=0?'+':'')+fmtEUR2(o.deltaAov)+' vs 2025', false, fmtEUR2(o.aov2025)+' in 2025');
  kpis += kpiCard('Avg. Ticket \u0394%', fmtPct(safeDiv(o.deltaAov,o.aov2025)), safeDiv(o.deltaAov,o.aov2025), fmtPct(safeDiv(o.deltaAov,o.aov2025)), false);

  document.getElementById('content').innerHTML = `
  <section class="section active" id="tab-sellin">
    <div class="row-title"><div><h2 class="section-title">Sell-In Performance</h2><div class="section-desc">Ordered revenue and units, H1 2025 vs H1 2026 &middot; Scope: ${esc(scopeLabel())}</div></div></div>
    <div class="grid grid-3 block">${kpis}</div>
    <div class="panel">
      <div class="panel-title">Average ticket by country — 2025 vs 2026</div>
      <div class="chart-box tall"><canvas id="chart-sellin-aov"></canvas></div>
    </div>
  </section>`;

  const cc = getChartColors();
  makeChart('chart-sellin-aov', {
    type:'line',
    data:{ labels: byCountry.map(c=>c.country),
      datasets:[
        {label:'AOV 2025', data: byCountry.map(c=>c.aov2025), borderColor:cc.c2025_aov, backgroundColor:cc.c2025_aov, tension:.3, pointRadius:3},
        {label:'AOV 2026', data: byCountry.map(c=>c.aov2026), borderColor:cc.c2026_aov, backgroundColor:cc.c2026_aov, tension:.3, pointRadius:3},
      ]},
    options: baseBarOpts({ plugins:{ tooltip:{callbacks:{label:(ctx)=> ctx.dataset.label+': '+fmtEUR2(ctx.parsed.y)}} } })
  });
}

// ================================= COUNTRY BREAKDOWN =================================
function renderCountry(){
  const byCountry = getByCountryRows().slice().sort((x,y)=>y.revenue2026-x.revenue2026);

  registerTable('country', byCountry, [
    {key:'country', label:'Country', left:true},
    {key:'revenue2025', label:'Revenue 2025'},
    {key:'revenue2026', label:'Revenue 2026'},
    {key:'deltaRevenue', label:'\u0394 Revenue'},
    {key:'deltaRevenuePct', label:'\u0394 %'},
    {key:'units2025', label:'Units 2025'},
    {key:'units2026', label:'Units 2026'},
    {key:'deltaUnitsPct', label:'\u0394 Units %'},
    {key:'aov2025', label:'AOV 2025'},
    {key:'aov2026', label:'AOV 2026'},
  ], r=> `<tr>
    <td class="left"><b>${esc(r.country)}</b> <span class="dim-text">${esc(COUNTRY_NAMES[r.country]||'')}</span></td>
    <td>${fmtEUR(r.revenue2025)}</td><td>${fmtEUR(r.revenue2026)}</td>
    <td class="${deltaClass(r.deltaRevenue)==='pos'?'pos-text':deltaClass(r.deltaRevenue)==='neg'?'neg-text':''}">${fmtEUR(r.deltaRevenue)}</td>
    <td class="${deltaClass(r.deltaRevenuePct)==='pos'?'pos-text':deltaClass(r.deltaRevenuePct)==='neg'?'neg-text':''}">${fmtPct(r.deltaRevenuePct)}</td>
    <td>${fmtNum(r.units2025)}</td><td>${fmtNum(r.units2026)}</td>
    <td class="${deltaClass(r.deltaUnitsPct)==='pos'?'pos-text':deltaClass(r.deltaUnitsPct)==='neg'?'neg-text':''}">${fmtPct(r.deltaUnitsPct)}</td>
    <td>${fmtEUR2(r.aov2025)}</td><td>${fmtEUR2(r.aov2026)}</td>
  </tr>`, 'revenue2026','desc');

  document.getElementById('content').innerHTML = `
  <section class="section active" id="tab-country">
    <div class="row-title"><div><h2 class="section-title">Country Breakdown</h2><div class="section-desc">All 13 sell-in markets &middot; Scope: ${esc(scopeLabel())}</div></div></div>
    <div class="grid grid-2 block">
      <div class="panel"><div class="panel-title">Revenue by country</div><div class="panel-sub">2025 vs 2026, ordered by 2026 revenue</div><div class="chart-box tall"><canvas id="chart-country-rev"></canvas></div></div>
      <div class="panel"><div class="panel-title">Units by country</div><div class="panel-sub">2025 vs 2026, ordered by 2026 revenue</div><div class="chart-box tall"><canvas id="chart-country-units"></canvas></div></div>
    </div>
    <div class="panel">
      <div class="panel-title">Country summary table</div>
      <div class="panel-sub">Click column headers to sort</div>
      ${tableContainer('country')}
    </div>
  </section>`;

  const cc = getChartColors();
  makeChart('chart-country-rev', { type:'bar', data:{ labels: byCountry.map(c=>c.country),
    datasets:[{label:'2025', data:byCountry.map(c=>c.revenue2025), backgroundColor:cc.c2025, borderRadius:3},
      {label:'2026', data:byCountry.map(c=>c.revenue2026), backgroundColor:cc.c2026_rev, borderRadius:3}]},
    options: baseBarOpts({ plugins:{ tooltip:{callbacks:{label:(ctx)=> ctx.dataset.label+': '+fmtEUR(ctx.parsed.y)}} } }) });

  makeChart('chart-country-units', { type:'bar', data:{ labels: byCountry.map(c=>c.country),
    datasets:[{label:'2025', data:byCountry.map(c=>c.units2025), backgroundColor:cc.c2025, borderRadius:3},
      {label:'2026', data:byCountry.map(c=>c.units2026), backgroundColor:cc.c2026_units, borderRadius:3}]},
    options: baseBarOpts({ plugins:{ tooltip:{callbacks:{label:(ctx)=> ctx.dataset.label+': '+fmtNum(ctx.parsed.y)}} } }) });
}

// ================================= RETURNS =================================
function renderReturns(){
  const o = getSellinOverall();
  const byCountry = getByCountryRows().slice().sort((x,y)=>y.returns2026-x.returns2026);
  const prodRows = getSellinProductRows();
  const byReturns = prodRows.slice().sort((a,b)=> b.returns2026 - a.returns2026).slice(0,15);
  const byReturnsGrowth = prodRows.slice().sort((a,b)=> (b.deltaReturns) - (a.deltaReturns)).slice(0,15);

  let kpis = '';
  kpis += kpiCard('Returns 2026', fmtNum(o.returns2026), o.deltaReturnsPct, fmtPct(o.deltaReturnsPct)+' YoY', true, fmtNum(o.returns2025)+' in 2025');
  kpis += kpiCard('\u0394 Returns', fmtNum(o.deltaReturns), o.deltaReturns, fmtPct(o.deltaReturnsPct), true);
  kpis += kpiCard('Return Rate 2026', fmtPctRaw(o.returnRate2026), o.returnRate2026-o.returnRate2025, fmtPP(o.returnRate2026-o.returnRate2025)+' YoY', true, fmtPctRaw(o.returnRate2025)+' in 2025');
  kpis += kpiCard('Units Returned per 1,000 sold', fmtNum(o.returnRate2026*1000), null, 'vs '+fmtNum(o.returnRate2025*1000)+' in 2025', true);

  registerTable('returns-leaders', byReturns, [
    {key:'title', label:'Product', left:true}, {key:'brand', label:'Brand', left:true},
    {key:'returns2025', label:'Returns 2025'}, {key:'returns2026', label:'Returns 2026'}, {key:'deltaReturns', label:'\u0394'},
  ], r=> `<tr><td class="left">${productCell(r.asin,r.title)}</td><td class="left">${esc(r.brand)}</td>
    <td>${fmtNum(r.returns2025)}</td><td>${fmtNum(r.returns2026)}</td>
    <td class="${r.deltaReturns>0?'neg-text':r.deltaReturns<0?'pos-text':''}">${r.deltaReturns>=0?'+':''}${fmtNum(r.deltaReturns)}</td></tr>`,
    'returns2026','desc');

  registerTable('returns-growth', byReturnsGrowth, [
    {key:'title', label:'Product', left:true}, {key:'brand', label:'Brand', left:true},
    {key:'returns2025', label:'Returns 2025'}, {key:'returns2026', label:'Returns 2026'}, {key:'deltaReturns', label:'\u0394'},
  ], r=> `<tr><td class="left">${productCell(r.asin,r.title)}</td><td class="left">${esc(r.brand)}</td>
    <td>${fmtNum(r.returns2025)}</td><td>${fmtNum(r.returns2026)}</td>
    <td class="${r.deltaReturns>0?'neg-text':r.deltaReturns<0?'pos-text':''}">${r.deltaReturns>=0?'+':''}${fmtNum(r.deltaReturns)}</td></tr>`,
    'deltaReturns','desc');

  document.getElementById('content').innerHTML = `
  <section class="section active" id="tab-returns">
    <div class="row-title"><div><h2 class="section-title">Returns Analysis</h2><div class="section-desc">Customer returns, H1 2025 vs H1 2026 &middot; Scope: ${esc(scopeLabel())}</div></div></div>
    <div class="banner">Overall return rate improved from <b>${fmtPctRaw(SELLIN.overall.returnRate2025)}</b> to <b>${fmtPctRaw(SELLIN.overall.returnRate2026)}</b> even as units sold grew ${fmtPct(SELLIN.overall.deltaUnitsPct)} — but two markets moved the wrong way: Poland (1.8% \u2192 3.4%) and the Netherlands (2.4% \u2192 3.0%).</div>
    <div class="grid grid-4 block">${kpis}</div>
    <div class="panel block">
      <div class="panel-title">Returns by country</div>
      <div class="chart-box tall"><canvas id="chart-returns-country"></canvas></div>
    </div>
    <div class="grid grid-2">
      <div class="panel"><div class="panel-title">Top 15 products by return volume</div><div class="panel-sub">2026 returns, highest first</div>${tableContainer('returns-leaders')}</div>
      <div class="panel"><div class="panel-title">Top 15 products by return growth</div><div class="panel-sub">Largest YoY increase in return count</div>${tableContainer('returns-growth')}</div>
    </div>
  </section>`;

  const cc = getChartColors();
  makeChart('chart-returns-country', { type:'bar', data:{ labels: byCountry.map(c=>c.country),
    datasets:[{label:'Returns 2025', data:byCountry.map(c=>c.returns2025), backgroundColor:cc.c2025, borderRadius:3},
      {label:'Returns 2026', data:byCountry.map(c=>c.returns2026), backgroundColor:cc.c2026_returns, borderRadius:3}]},
    options: baseBarOpts({}) });
}

// ================================= ADVERTISING =================================
function renderAds(){
  const a = getAdsOverall();
  const banner = `<div class="banner">Advertising data covers <b>DE, ES, FR, IT and UK</b> only (5 of 13 sell-in markets). ACOS = Ad Spend / Attributed Sales. TACOS = Ad Spend / Sell-In Revenue, using sell-in revenue from the same ads-covered countries.</div>`;

  if(a.unavailable){
    const selNames = selectedCountries().map(c=>COUNTRY_NAMES[c]||c).join(', ') || 'the selected countries';
    document.getElementById('content').innerHTML = `
    <section class="section active" id="tab-ads">
      <div class="row-title"><div><h2 class="section-title">Advertising Performance</h2><div class="section-desc">Scope: ${esc(scopeLabel())}</div></div></div>
      ${banner}
      <div class="panel"><div class="empty-state">No advertising data available for ${esc(selNames)}. This dataset only tracks Amazon Ads spend in DE, ES, FR, IT and UK — include at least one of those in the country filter.</div></div>
    </section>`;
    return;
  }

  const byCountry = getAdsByCountryRows().slice().sort((x,y)=>y.spend2026-x.spend2026);
  const {rows: adsProdRows} = getAdsProductRows();
  const adsProdSorted = adsProdRows.slice().sort((x,y)=>y.spend2026-x.spend2026);

  let kpis = '';
  kpis += kpiCard('Ad Spend 2026', fmtEUR(a.spend2026), a.deltaSpendPct, fmtPct(a.deltaSpendPct)+' YoY', true, fmtEUR(a.spend2025)+' in 2025');
  kpis += kpiCard('ACOS 2026', fmtPctRaw(a.acos2026), (a.acos2026-a.acos2025), fmtPP(a.acos2026-a.acos2025)+' YoY', true, fmtPctRaw(a.acos2025)+' in 2025');
  kpis += kpiCard('TACOS 2026', fmtPctRaw(a.tacos2026), (a.tacos2026-a.tacos2025), fmtPP(a.tacos2026-a.tacos2025)+' YoY', true, fmtPctRaw(a.tacos2025)+' in 2025');
  kpis += kpiCard('Cost / Attributed Unit', fmtEUR2(a.costPerUnit2026), (a.costPerUnit2026-a.costPerUnit2025), (a.costPerUnit2026-a.costPerUnit2025>=0?'+':'')+fmtEUR2(a.costPerUnit2026-a.costPerUnit2025)+' YoY', true, fmtEUR2(a.costPerUnit2025)+' in 2025');

  registerTable('ads-country', byCountry, [
    {key:'country', label:'Country', left:true}, {key:'spend2025', label:'Spend 2025'}, {key:'spend2026', label:'Spend 2026'},
    {key:'acos2026', label:'ACOS 2026'}, {key:'tacos2026', label:'TACOS 2026'},
    {key:'attribUnits2026', label:'Attrib. Units 2026'}, {key:'sellInRevenue2026', label:'Sell-In Rev 2026'},
  ], r=> `<tr><td class="left"><b>${esc(r.country)}</b></td><td>${fmtEUR(r.spend2025)}</td><td>${fmtEUR(r.spend2026)}</td>
    <td>${fmtPctRaw(r.acos2026)}</td><td>${fmtPctRaw(r.tacos2026)}</td>
    <td>${fmtNum(r.attribUnits2026)}</td><td>${fmtEUR(r.sellInRevenue2026)}</td></tr>`, 'spend2026','desc');

  registerTable('ads-product', adsProdSorted, [
    {key:'title', label:'Product', left:true}, {key:'brand', label:'Brand', left:true},
    {key:'spend2025', label:'Spend 2025'}, {key:'spend2026', label:'Spend 2026'}, {key:'deltaSpendPct', label:'\u0394 Spend %'},
    {key:'acos2026', label:'ACOS 2026'}, {key:'tacos2026', label:'TACOS 2026'},
  ], r=> `<tr><td class="left">${productCell(r.asin,r.title)}</td><td class="left">${esc(r.brand)}</td>
    <td>${fmtEUR2(r.spend2025)}</td><td>${fmtEUR2(r.spend2026)}</td>
    <td class="${deltaClass(r.deltaSpendPct)==='pos'?'':''}">${fmtPct(r.deltaSpendPct)}</td>
    <td class="${r.acos2026>0.25?'neg-text':''}">${fmtPctRaw(r.acos2026)}</td><td>${fmtPctRaw(r.tacos2026)}</td></tr>`, 'spend2026','desc');

  document.getElementById('content').innerHTML = `
  <section class="section active" id="tab-ads">
    <div class="row-title"><div><h2 class="section-title">Advertising Performance</h2><div class="section-desc">Scope: ${esc(scopeLabel())}</div></div></div>
    ${banner}
    <div class="grid grid-4 block">${kpis}</div>
    <div class="grid grid-2 block">
      <div class="panel"><div class="panel-title">Ad spend by country</div><div class="chart-box"><canvas id="chart-ads-spend"></canvas></div></div>
      <div class="panel"><div class="panel-title">ACOS vs TACOS by country — 2026</div><div class="panel-sub">ACOS = efficiency of ads themselves; TACOS = ad spend as % of total sell-in</div><div class="chart-box"><canvas id="chart-ads-acostacos"></canvas></div></div>
    </div>
    <div class="panel block"><div class="panel-title">Ads by country</div>${tableContainer('ads-country')}</div>
    <div class="panel"><div class="panel-title">Ads by product</div><div class="panel-sub">Sorted by 2026 spend &middot; rows with ACOS above 25% are flagged</div>${tableContainer('ads-product')}</div>
  </section>`;

  const cc = getChartColors();
  const isDark = isDarkMode();
  const gridColor = isDark ? '#1C202F' : '#EDEFF2';

  makeChart('chart-ads-spend', { type:'bar', data:{ labels: byCountry.map(c=>c.country),
    datasets:[{label:'2025', data:byCountry.map(c=>c.spend2025), backgroundColor:cc.c2025, borderRadius:3},
      {label:'2026', data:byCountry.map(c=>c.spend2026), backgroundColor:cc.c2026_spend, borderRadius:3}]},
    options: baseBarOpts({ plugins:{ tooltip:{callbacks:{label:(ctx)=> ctx.dataset.label+': '+fmtEUR(ctx.parsed.y)}} } }) });

  makeChart('chart-ads-acostacos', { type:'bar', data:{ labels: byCountry.map(c=>c.country),
    datasets:[{label:'ACOS', data:byCountry.map(c=> (c.acos2026||0)*100), backgroundColor:cc.c2026_returns, borderRadius:3},
      {label:'TACOS', data:byCountry.map(c=> (c.tacos2026||0)*100), backgroundColor:cc.c2026_tacos, borderRadius:3}]},
    options: baseBarOpts({ plugins:{ tooltip:{callbacks:{label:(ctx)=> ctx.dataset.label+': '+ctx.parsed.y.toFixed(1)+'%'}} },
      scales:{ x:{grid:{display:false}}, y:{grid:{color:gridColor}, ticks:{callback:(v)=>v+'%'}} } }) });
}

// ================================= PRODUCT WINNERS & LOSERS =================================
function renderProducts(){
  const rows = getSellinProductRows();
  const metric = productsSubtab; // 'revenue' or 'units'
  const dKey = metric==='revenue' ? 'deltaRevenue' : 'deltaUnits';
  const pKey = metric==='revenue' ? 'deltaRevenuePct' : 'deltaUnitsPct';

  const growers = rows.slice().sort((a,b)=> b[dKey]-a[dKey]).slice(0,10);
  const fallers = rows.slice().sort((a,b)=> a[dKey]-b[dKey]).slice(0,10);

  const cols = [
    {key:'title', label:'Product', left:true}, {key:'brand', label:'Brand', left:true},
    {key: metric==='revenue'?'revenue2025':'units2025', label: metric==='revenue'?'Rev 2025':'Units 2025'},
    {key: metric==='revenue'?'revenue2026':'units2026', label: metric==='revenue'?'Rev 2026':'Units 2026'},
    {key: dKey, label:'\u0394'}, {key: pKey, label:'\u0394 %'}, {key:'status', label:'Status'},
  ];
  const rowFn = r=> {
    const v25 = metric==='revenue'? r.revenue2025 : r.units2025;
    const v26 = metric==='revenue'? r.revenue2026 : r.units2026;
    const fmt = metric==='revenue'? fmtEUR : fmtNum;
    return `<tr><td class="left">${productCell(r.asin,r.title)}</td><td class="left">${esc(r.brand)}</td>
    <td>${fmt(v25)}</td><td>${fmt(v26)}</td>
    <td class="${r[dKey]>=0?'pos-text':'neg-text'}">${r[dKey]>=0?'+':''}${fmt(r[dKey])}</td>
    <td class="${r[dKey]>=0?'pos-text':'neg-text'}">${fmtPct(r[pKey])}</td>
    <td>${statusBadge(r.status)}</td></tr>`;
  };

  registerTable('prod-growers', growers, cols, rowFn, dKey, 'desc');
  registerTable('prod-fallers', fallers, cols, rowFn, dKey, 'asc');

  document.getElementById('content').innerHTML = `
  <section class="section active" id="tab-products">
    <div class="row-title"><div><h2 class="section-title">Product Winners & Losers</h2><div class="section-desc">Ranked by absolute impact, not percentage &middot; Scope: ${esc(scopeLabel())}</div></div></div>
    <div class="subtabs">
      <button class="${metric==='revenue'?'active':''}" onclick="productsSubtab='revenue'; renderProducts();">By Revenue</button>
      <button class="${metric==='units'?'active':''}" onclick="productsSubtab='units'; renderProducts();">By Units</button>
    </div>
    <div class="grid grid-2">
      <div class="panel"><div class="panel-title">Top 10 growing</div>${tableContainer('prod-growers')}</div>
      <div class="panel"><div class="panel-title">Top 10 falling</div>${tableContainer('prod-fallers')}</div>
    </div>
  </section>`;
}

// ================================= SPAIN GAP =================================
function renderEsGap(){
  const deRows = getEsGapDeRows();
  const otherRows = getEsGapRows().filter(r=> !r.countries.includes('DE'));

  const totalDeRevenue = sum(deRows,'revenueDe2026');
  const shareOfCompany = safeDiv(totalDeRevenue, SELLIN.overall.revenue2026);
  const highCount = deRows.filter(r=>r.priority==='High').length;

  let scopeParts = [];
  scopeParts.push(state.brand==='ALL' ? 'All brands' : state.brand);
  if(state.q) scopeParts.push('"'+state.q+'"');

  const banner = `<div class="banner">This table surfaces <b>candidates</b> for a Germany → Spain expansion gap — it does not confirm an oversight. Plausible deliberate reasons include the EU GPSR Responsible Person requirement, Pan-EU VAT registration thresholds, EN71 toy-safety certification, or launch sequencing. Minimum threshold: ${fmtEUR(ES_GAP_MIN_REVENUE)} 2026 revenue.</div>`;

  let kpis = '';
  kpis += kpiCard('Revenue in Germany (ES gap)', fmtEUR(totalDeRevenue), null, deRows.length+' candidate product'+(deRows.length===1?'':'s'), false);
  kpis += kpiCard('Share of Company Revenue', fmtPctRaw(shareOfCompany), null, 'of total 2026 sell-in revenue', false);
  kpis += kpiCard('High-Priority Candidates', fmtNum(highCount), null, 'brand already live in Spain, healthy return rate', false);
  kpis += kpiCard('Other-Country Candidates', fmtNum(otherRows.length), null, 'sold elsewhere (not Germany), not in Spain', false);

  let insight = '';
  const topPick = deRows.slice().sort((a,b)=> (b.priority==='High'?1:0)-(a.priority==='High'?1:0) || b.revenueDe2026-a.revenueDe2026)[0];
  if(topPick){
    const aovTxt = topPick.aovDe2026!==null ? fmtEUR2(topPick.aovDe2026) : 'n/a';
    const retTxt = topPick.returnRateDe2026!==null ? fmtPctRaw(topPick.returnRateDe2026) : 'n/a';
    const shortTitle = topPick.title.length>60 ? topPick.title.slice(0,60)+'…' : topPick.title;
    if(topPick.brandAlreadyInEs){
      insight = `<div class="insight-card good"><span class="tag">Top candidate</span><p><b>${esc(shortTitle)}</b> (${esc(topPick.brand)}) sold ${fmtEUR(topPick.revenueDe2026)} in Germany in 2026 (AOV ${aovTxt}, return rate ${retTxt}) with zero 2026 revenue in Spain. ${esc(topPick.brand)} already sells in Spain, so VAT registration and an EU GPSR Responsible Person are most likely already in place — this is the lowest-friction candidate in the list.</p></div>`;
    } else {
      insight = `<div class="insight-card warn"><span class="tag">Top candidate</span><p><b>${esc(shortTitle)}</b> (${esc(topPick.brand)}) sold ${fmtEUR(topPick.revenueDe2026)} in Germany in 2026 (AOV ${aovTxt}, return rate ${retTxt}) with zero 2026 revenue in Spain. ${esc(topPick.brand)} has no presence in Spain today — check EU GPSR Responsible Person and VAT registration before treating this as a quick win.</p></div>`;
    }
  }

  registerTable('es-gap-de', deRows, [
    {key:'title', label:'Product', left:true}, {key:'brand', label:'Brand', left:true},
    {key:'esRevenue2025', label:'ES Revenue 2025'},
    {key:'revenueDe2026', label:'Revenue DE 2026'}, {key:'aovDe2026', label:'AOV DE 2026'},
    {key:'returnRateDe2026', label:'Return Rate DE'}, {key:'acosDe2026', label:'ACOS DE 2026'},
    {key:'brandAlreadyInEs', label:'Brand Live in ES'}, {key:'priority', label:'Priority'},
  ], r=> `<tr><td class="left">${productCell(r.asin,r.title)}</td><td class="left">${esc(r.brand)}</td>
    <td class="${r.esRevenue2025>0?'neg-text':''}">${r.esRevenue2025>0?fmtEUR2(r.esRevenue2025):'Never sold'}</td>
    <td>${fmtEUR(r.revenueDe2026)}</td><td>${fmtEUR2(r.aovDe2026)}</td>
    <td class="${r.returnRateDe2026!==null && r.returnRateDe2026>SELLIN.overall.returnRate2026*1.5?'neg-text':''}">${fmtPctRaw(r.returnRateDe2026)}</td>
    <td>${r.acosDe2026!==null?fmtPctRaw(r.acosDe2026):'—'}</td>
    <td class="${r.brandAlreadyInEs?'pos-text':'neg-text'}">${r.brandAlreadyInEs?'Yes':'No'}</td>
    <td>${priorityBadge(r.priority)}</td></tr>`, 'revenueDe2026', 'desc');

  registerTable('es-gap-other', otherRows, [
    {key:'title', label:'Product', left:true}, {key:'brand', label:'Brand', left:true},
    {key:'esRevenue2025', label:'ES Revenue 2025'},
    {key:'revenue2026', label:'Revenue 2026'}, {key:'units2026', label:'Units 2026'},
    {key:'countryCount', label:'# Countries'}, {key:'countriesLabel', label:'Countries', left:true},
  ], r=> `<tr><td class="left">${productCell(r.asin,r.title)}</td><td class="left">${esc(r.brand)}</td>
    <td class="${r.esRevenue2025>0?'neg-text':''}">${r.esRevenue2025>0?fmtEUR2(r.esRevenue2025):'Never sold'}</td>
    <td>${fmtEUR(r.revenue2026)}</td><td>${fmtNum(r.units2026)}</td>
    <td>${r.countryCount}</td><td class="left">${esc(r.countriesLabel)}</td></tr>`, 'revenue2026', 'desc');

  document.getElementById('content').innerHTML = `
  <section class="section active" id="tab-es-gap">
    <div class="row-title"><div><h2 class="section-title">Spain — Opportunities</h2><div class="section-desc">Germany-sold products absent from Spain, prioritized by revenue and risk signals &middot; Country filter does not apply here (see banner) &middot; Scope: ${esc(scopeParts.join(' · '))}</div></div></div>
    ${banner}
    <div class="grid grid-4 block">${kpis}</div>
    ${insight}
    <div class="panel block"><div class="panel-title">Germany → Spain gap</div><div class="panel-sub">Sorted by 2026 revenue in Germany &middot; "ES Revenue 2025" shows whether the ASIN was ever sold in Spain — "Never sold" is a fresh-market candidate, a euro amount means it was sold in 2025 and discontinued in 2026 &middot; Priority: High = brand already live in Spain and a healthy return rate, Low = return rate notably above the company average</div>${tableContainer('es-gap-de')}</div>
    <div class="panel"><div class="panel-title">Other countries, not sold in Spain</div><div class="panel-sub">Same gap logic for markets other than Germany &middot; minimum ${fmtEUR(ES_GAP_MIN_REVENUE)} threshold</div>${tableContainer('es-gap-other')}</div>
  </section>`;
}
// ================================= INSIGHTS =================================
function renderInsights(){
  document.getElementById('content').innerHTML = `
  <section class="section active" id="tab-insights">
    <div class="row-title"><div><h2 class="section-title">Key Insights &amp; Recommendations</h2><div class="section-desc">Full H1 2025 vs 2026 dataset — this tab is not affected by the filters above, so the picture stays complete.</div></div></div>

    <div class="block">
      <div class="panel-title" style="margin-bottom:12px;">What's driving the numbers</div>
      <div class="insight-card good"><span class="tag">Headline</span><p>Sell-in revenue is up <b>+18.8%</b> (&euro;2.44M &rarr; &euro;2.89M) and units are up <b>+23.9%</b> (365k &rarr; 452k). Growth is <b>volume-led, not price-led</b>: average ticket actually fell &minus;4.1% (&euro;6.68 &rarr; &euro;6.40). Worth confirming this mix shift toward lower-ticket SKUs / more promotions is intentional.</p></div>

      <div class="insight-card"><span class="tag">Country contribution</span><p><b>Spain (+&euro;118k, +65.9%)</b>, <b>Italy (+&euro;90k, +44.8%)</b> and <b>UK (+&euro;238k, from a &euro;841 base)</b> explain almost all of the growth. <b>Germany</b>, still the largest market at &euro;1.70M, is the one drag: <b>&minus;&euro;51k (&minus;2.9%)</b> even after ad spend there was cut &minus;10.8%.</p></div>

      <div class="insight-card good"><span class="tag">Where ads are working</span><p>Spain and Italy grew revenue sharply <i>while</i> becoming more efficient: Spain's TACOS fell from 5.6% to 3.7% and ACOS from 18.7% to 14.2%; Italy's TACOS fell from 5.7% to 4.2%. That combination (growth + falling ad-to-sales ratio) is the pattern to replicate in France and Germany.</p></div>

      <div class="insight-card warn"><span class="tag">Where ads are not</span><p>Account-level ACOS worsened from 18.8% to 20.8% even though TACOS improved slightly (6.7% &rarr; 6.2%) — spend is being used less efficiently at the campaign level, offset only by sell-in growing faster than spend overall. The <b>BLADE</b> brand is the clearest problem: ACOS 37.6%, TACOS 15.9%, and its lead SKU (Blade XXL Battle Set) is down &minus;&euro;45k in revenue while 2026 ad spend on it rose to &euro;4,178. That's rising spend behind a shrinking product.</p></div>

      <div class="insight-card warn"><span class="tag">Products underperforming ad spend</span><p>Galupy's Unicorn Butterfly House Playset (B0C5XXV8W3) is running at <b>106.7% ACOS</b> — spending more on ads than it earns back in attributed sales. INKEE Paw Patrol bath bombs (B0BQJBCCBS) fell &minus;66.5% in revenue while still drawing &euro;1,598 in 2026 spend. Both are candidates to pause or restructure before the next optimization cycle.</p></div>

      <div class="insight-card good"><span class="tag">Products that could take more budget</span><p>The INKEE bath bomb range is the standout: multiple SKUs (Spongebob, Galupy Unicorn, Peppa Pig, Paw Patrol lines) are growing 100&ndash;320% YoY at ACOS of 11&ndash;13%, well under the 20.8% account average. INKEE is already the top-spending brand (&euro;81.6k in 2026) at a healthy 17.2% ACOS / 6.1% TACOS — there is headroom to shift budget from BLADE/GALUPY into this range rather than spreading it further.</p></div>

      <div class="insight-card warn"><span class="tag">Music Box — flag before scaling</span><p>The Unicorn Music Box campaign Christian is actively optimizing (B0C1C93JRT) grew +40.6% in revenue, which is good, but its return rate is 5.47% — more than 3.5x the account average of 1.46% — and ACOS is 28.5%, also above average. Worth resolving the return driver (sizing, breakage, expectation mismatch) before pushing more ad spend behind it.</p></div>

      <div class="insight-card"><span class="tag">Returns</span><p>Returns overall improved (2.01% &rarr; 1.46% return rate) despite unit volume growing +23.9% — a genuinely good result. The exceptions: <b>Poland</b> (1.8% &rarr; 3.4%) and the <b>Netherlands</b> (2.4% &rarr; 3.0%) both got worse, and <b>Stretchy Legends D'Molition</b> figures sit at a 7.7% return rate. Small markets, but worth a root-cause check before they scale.</p></div>

      <div class="insight-card"><span class="tag">UK — new market, expensive so far</span><p>UK sell-in jumped from &euro;841 to &euro;238,510 — mostly a market-entry effect, not something ad spend alone explains, since ad spend there only started in 2026 (&euro;25,784). But its efficiency is the weakest of the five ads markets: 37.9% ACOS and 10.8% TACOS, both worse than any other country. Structure matters more than budget here — worth a proper campaign audit while UK spend is still small.</p></div>
    </div>

    <div class="panel">
      <div class="panel-title">Recommended actions</div>
      <div class="panel-sub">Ordered by estimated economic impact, not by ease of execution</div>
      <ol class="reco-list">
        <li>Cut or restructure ad spend on <b>BLADE</b> (37.6% ACOS, revenue declining) and reallocate toward the <b>INKEE bath bomb range</b> (11&ndash;17% ACOS, 100%+ growth) — same account, materially better return on the same euro.</li>
        <li>Pause or rebuild the Galupy Unicorn Butterfly House Playset campaign (B0C5XXV8W3) immediately — 106.7% ACOS means every attributed sale currently costs more in ads than it earns.</li>
        <li>Diagnose the Music Box return rate (5.47% vs 1.46% account average) before increasing its ad budget further; fixing the return driver likely improves ROI more than any bid change.</li>
        <li>Investigate the Germany decline (&minus;2.9% revenue on the largest market) — check whether it's demand softening, stock availability, or price/competitor pressure, since a 1-point swing in Germany moves the total more than any other single country.</li>
        <li>Document what changed in Spain and Italy (both up 45&ndash;66% in revenue while ad efficiency improved) and test the same keyword/bid/promo approach in France, where growth (+11.6%) and ad efficiency (ACOS up to 14.7%) both lag.</li>
        <li>Build UK campaign structure properly now, while spend is still &euro;26k — its ACOS (37.9%) and TACOS (10.8%) are already the worst of the five ads markets, and that gap will be more expensive to fix once volume is 5x higher.</li>
        <li>Audit Poland and Netherlands for return drivers (packaging, sizing, transit damage) — both moved backward YoY (PL 1.8%&rarr;3.4%, NL 2.4%&rarr;3.0%) while every other mid-size market held flat or improved.</li>
        <li>Confirm the &minus;4.1% average-ticket decline is a deliberate mix/pricing strategy rather than margin erosion from promotions — it's currently masked by strong unit growth in the headline numbers.</li>
      </ol>
    </div>
  </section>`;
}

// ================================= TAB SWITCHING =================================
const RENDERERS = { summary:renderSummary, sellin:renderSellIn, country:renderCountry, returns:renderReturns, ads:renderAds, products:renderProducts, 'es-gap':renderEsGap, insights:renderInsights };

function switchTab(id){
  activeTab = id;
  document.querySelectorAll('#tabs button').forEach(b=> b.classList.toggle('active', b.dataset.tab===id));
  RENDERERS[id]();
}
function rerenderActive(){ RENDERERS[activeTab](); }

// ================================= FILTER BAR =================================
function updateCountryToggleLabel(){
  const btn = document.getElementById('ms-country-toggle');
  if(!btn) return;
  if(isAllCountries()) btn.textContent = 'All countries';
  else if(state.countries.size===0) btn.textContent = 'No countries \u25BE';
  else if(state.countries.size<=2) btn.textContent = [...state.countries].sort().join(', ');
  else btn.textContent = state.countries.size + ' countries selected';
  btn.textContent += ' \u25BE';
}

function initCountryMultiselect(){
  const menu = document.getElementById('ms-country-menu');
  const sortedCountries = SELLIN.byCountry.slice().sort((a,b)=>b.revenue2026-a.revenue2026).map(c=>c.country);
  menu.innerHTML = sortedCountries.map(cc=>
    `<label><input type="checkbox" value="${cc}" ${state.countries.has(cc)?'checked':''}> ${cc} <span class="dim-text">${COUNTRY_NAMES[cc]||''}</span>${ADS_COUNTRIES.includes(cc)?' <span class="badge-ads">Ads</span>':''}</label>`
  ).join('') + `<div class="ms-actions"><button type="button" id="ms-country-all">Select all</button><button type="button" id="ms-country-none">Clear</button></div>`;

  menu.querySelectorAll('input[type=checkbox]').forEach(cb=>{
    cb.addEventListener('change', ()=>{
      if(cb.checked) state.countries.add(cb.value); else state.countries.delete(cb.value);
      updateCountryToggleLabel();
      onFilterChange();
    });
  });
  menu.querySelector('#ms-country-all').addEventListener('click', ()=>{
    state.countries = new Set(ALL_COUNTRIES);
    menu.querySelectorAll('input[type=checkbox]').forEach(cb=> cb.checked = true);
    updateCountryToggleLabel(); onFilterChange();
  });
  menu.querySelector('#ms-country-none').addEventListener('click', ()=>{
    state.countries = new Set();
    menu.querySelectorAll('input[type=checkbox]').forEach(cb=> cb.checked = false);
    updateCountryToggleLabel(); onFilterChange();
  });

  const toggle = document.getElementById('ms-country-toggle');
  toggle.addEventListener('click', (e)=>{ e.stopPropagation(); menu.classList.toggle('open'); });
  document.addEventListener('click', (e)=>{
    const wrap = document.getElementById('ms-country');
    if(wrap && !wrap.contains(e.target)) menu.classList.remove('open');
  });
  updateCountryToggleLabel();
}

function initFilters(){
  initCountryMultiselect();

  const bSel = document.getElementById('f-brand');
  bSel.innerHTML = '<option value="ALL">All brands</option>' + BRANDS.map(b=> `<option value="${esc(b)}">${esc(b)}</option>`).join('');
  bSel.addEventListener('change', e=>{ state.brand = e.target.value; onFilterChange(); });

  const search = document.getElementById('f-search');
  let debounce;
  search.addEventListener('input', e=>{ clearTimeout(debounce); debounce = setTimeout(()=>{ state.q = e.target.value.trim(); onFilterChange(); }, 220); });

  document.getElementById('f-reset').addEventListener('click', ()=>{
    state = { countries: new Set(ALL_COUNTRIES), brand:'ALL', q:'' };
    document.getElementById('ms-country-menu').querySelectorAll('input[type=checkbox]').forEach(cb=> cb.checked = true);
    updateCountryToggleLabel();
    bSel.value='ALL'; search.value='';
    onFilterChange();
  });
}
function onFilterChange(){
  const isFiltered = !isAllCountries() || state.brand!=='ALL' || !!state.q;
  document.getElementById('f-summary').textContent = isFiltered ? 'Filtered: '+scopeLabel() : '';
  document.getElementById('filter-echo').textContent = 'View: ' + scopeLabel();
  rerenderActive();
}

// ================================= INIT =================================
function init(){
  const tabsNav = document.getElementById('tabs');
  tabsNav.innerHTML = TABS.map((t,i)=> `<button data-tab="${t.id}" class="${t.id==='summary'?'active':''}"><span class="n">0${i+1}</span>${esc(t.label)}</button>`).join('');
  tabsNav.querySelectorAll('button').forEach(b=> b.addEventListener('click', ()=> switchTab(b.dataset.tab)));
  initFilters();

  // Theme toggle listener
  const toggleBtn = document.getElementById('theme-toggle');
  if (toggleBtn) {
    const updateToggleUI = (theme) => {
      const icon = document.getElementById('theme-toggle-icon');
      const text = document.getElementById('theme-toggle-text');
      if (theme === 'light') {
        if (icon) icon.textContent = '🌙';
        if (text) text.textContent = 'Dark Mode';
        toggleBtn.style.background = 'rgba(0,0,0,0.04)';
        toggleBtn.style.borderColor = 'rgba(0,0,0,0.08)';
        toggleBtn.style.color = 'var(--text)';
      } else {
        if (icon) icon.textContent = '☀️';
        if (text) text.textContent = 'Light Mode';
        toggleBtn.style.background = 'rgba(255,255,255,0.06)';
        toggleBtn.style.borderColor = 'rgba(255,255,255,0.12)';
        toggleBtn.style.color = '#fff';
      }
    };
    
    let currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    updateToggleUI(currentTheme);
    
    toggleBtn.addEventListener('click', () => {
      currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', currentTheme);
      localStorage.setItem('craze-theme', currentTheme);
      updateToggleUI(currentTheme);
      applyChartTheme();
      rerenderActive();
    });
  }

  document.getElementById('filter-echo').textContent = 'View: ' + scopeLabel();
  switchTab('summary');
}
document.addEventListener('DOMContentLoaded', init);
