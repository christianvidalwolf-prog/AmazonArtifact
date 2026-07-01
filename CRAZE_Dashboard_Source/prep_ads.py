import pandas as pd
import numpy as np
import json
import sys

# Usage: python prep_ads.py [path_to_sellin_report.xlsx] [path_to_ads_report.xlsx]
SELLIN = sys.argv[1] if len(sys.argv) > 1 else 'Informe_Sell_In_S1_2025_vs_2026_Titulos_EN.xlsx'
ADS = sys.argv[2] if len(sys.argv) > 2 else 'Ads_Weekly_2025_vs_2026_with_TACOS_EN.xlsx'

def clean(v):
    if pd.isna(v):
        return None
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating,)):
        return round(float(v), 4)
    return v

# country name mapping ads->sellin
CMAP = {'UK':'GB'}
RCMAP = {'GB':'UK'}

ads_raw = pd.read_excel(ADS, sheet_name='Ads Data W1-W26', header=3)
ads_raw['CountrySellin'] = ads_raw['Country'].map(lambda c: CMAP.get(c, c))

# ASIN -> brand/title map from sell-in Productos Total
prod_total = pd.read_excel(SELLIN, sheet_name='Productos Total')
asin_map = prod_total.set_index('ASIN')[['Brand','Product title EN']].to_dict('index')

# sell-in country-level revenue/units per ASIN (for TACOS, cost/unit at product-country level)
prod_country = pd.read_excel(SELLIN, sheet_name='Productos País')
si_pc = prod_country.set_index(['Country','ASIN'])

ADS_COUNTRIES = ['DE','ES','FR','IT','GB']  # sellin-code, GB=UK in ads file

# ---- Ads overall (2025 vs 2026), restricted to the 5 ads countries ----
def agg_year(df):
    return {
        'spend': clean(df['Ad Spend'].sum()),
        'attribSales': clean(df['Attributed Sales'].sum()),
        'attribUnits': clean(df['Attributed Units'].sum()),
    }

overall = {}
for y in [2025, 2026]:
    overall[y] = agg_year(ads_raw[ads_raw['Year']==y])

# sell-in revenue & units restricted to the 5 ads countries, matching Ads note methodology
si_ads_countries = prod_country[prod_country['Country'].isin(ADS_COUNTRIES)]
sellin_ads_scope = {
    2025: clean(si_ads_countries['Revenue 2025'].sum()),
    2026: clean(si_ads_countries['Revenue 2026'].sum()),
}
sellin_units_ads_scope = {
    2025: clean(si_ads_countries['Units 2025'].sum()),
    2026: clean(si_ads_countries['Units 2026'].sum()),
}

def safe_div(a,b):
    if a is None or b is None or b == 0:
        return None
    return round(a/b, 4)

adsOverall = {
    'spend2025': overall[2025]['spend'], 'spend2026': overall[2026]['spend'],
    'deltaSpend': round(overall[2026]['spend']-overall[2025]['spend'],2),
    'deltaSpendPct': safe_div(overall[2026]['spend']-overall[2025]['spend'], overall[2025]['spend']),
    'attribSales2025': overall[2025]['attribSales'], 'attribSales2026': overall[2026]['attribSales'],
    'attribUnits2025': overall[2025]['attribUnits'], 'attribUnits2026': overall[2026]['attribUnits'],
    'acos2025': safe_div(overall[2025]['spend'], overall[2025]['attribSales']),
    'acos2026': safe_div(overall[2026]['spend'], overall[2026]['attribSales']),
    'tacos2025': safe_div(overall[2025]['spend'], sellin_ads_scope[2025]),
    'tacos2026': safe_div(overall[2026]['spend'], sellin_ads_scope[2026]),
    'costPerUnit2025': safe_div(overall[2025]['spend'], overall[2025]['attribUnits']),
    'costPerUnit2026': safe_div(overall[2026]['spend'], overall[2026]['attribUnits']),
    'sellInRevenueUsed2025': sellin_ads_scope[2025], 'sellInRevenueUsed2026': sellin_ads_scope[2026],
    'sellInUnitsUsed2025': sellin_units_ads_scope[2025], 'sellInUnitsUsed2026': sellin_units_ads_scope[2026],
}

# ---- Ads by country ----
adsByCountry = []
for c in ads_raw['Country'].unique():
    sc = CMAP.get(c, c)
    row = {'country': sc}
    yearly = {}
    for y in [2025,2026]:
        sub = ads_raw[(ads_raw['Country']==c)&(ads_raw['Year']==y)]
        yearly[y] = agg_year(sub)
    si_rev = {y: clean(prod_country[(prod_country['Country']==sc)][f'Revenue {y}'].sum()) for y in [2025,2026]}
    si_units = {y: clean(prod_country[(prod_country['Country']==sc)][f'Units {y}'].sum()) for y in [2025,2026]}
    row.update({
        'spend2025': yearly[2025]['spend'], 'spend2026': yearly[2026]['spend'],
        'deltaSpend': round(yearly[2026]['spend']-yearly[2025]['spend'],2),
        'deltaSpendPct': safe_div(yearly[2026]['spend']-yearly[2025]['spend'], yearly[2025]['spend']),
        'attribSales2025': yearly[2025]['attribSales'], 'attribSales2026': yearly[2026]['attribSales'],
        'attribUnits2025': yearly[2025]['attribUnits'], 'attribUnits2026': yearly[2026]['attribUnits'],
        'acos2025': safe_div(yearly[2025]['spend'], yearly[2025]['attribSales']),
        'acos2026': safe_div(yearly[2026]['spend'], yearly[2026]['attribSales']),
        'tacos2025': safe_div(yearly[2025]['spend'], si_rev[2025]),
        'tacos2026': safe_div(yearly[2026]['spend'], si_rev[2026]),
        'costPerUnit2025': safe_div(yearly[2025]['spend'], yearly[2025]['attribUnits']),
        'costPerUnit2026': safe_div(yearly[2026]['spend'], yearly[2026]['attribUnits']),
        'sellInRevenue2025': si_rev[2025], 'sellInRevenue2026': si_rev[2026],
        'sellInUnits2025': si_units[2025], 'sellInUnits2026': si_units[2026],
    })
    adsByCountry.append(row)
adsByCountry.sort(key=lambda x: x['spend2026'] or 0, reverse=True)

# ---- Ads by ASIN x Country (for product table + brand rollup), summed across weeks ----
grp = ads_raw.groupby(['CountrySellin','ASIN','Year']).agg(
    spend=('Ad Spend','sum'), attribSales=('Attributed Sales','sum'), attribUnits=('Attributed Units','sum')
).reset_index()

records = {}
for _, r in grp.iterrows():
    key = (r['CountrySellin'], r['ASIN'])
    if key not in records:
        info = asin_map.get(r['ASIN'], {'Brand':'UNKNOWN','Product title EN': r['ASIN']})
        records[key] = {'country': r['CountrySellin'], 'asin': r['ASIN'], 'brand': info['Brand'], 'title': info['Product title EN'],
                         'spend2025':0.0,'spend2026':0.0,'attribSales2025':0.0,'attribSales2026':0.0,'attribUnits2025':0,'attribUnits2026':0}
    rec = records[key]
    rec[f'spend{r["Year"]}'] = clean(r['spend'])
    rec[f'attribSales{r["Year"]}'] = clean(r['attribSales'])
    rec[f'attribUnits{r["Year"]}'] = clean(r['attribUnits'])

adsByProductCountry = []
for (country, asin), rec in records.items():
    si_key = (country, asin)
    si_rev2025 = si_pc.loc[si_key, 'Revenue 2025'] if si_key in si_pc.index else 0
    si_rev2026 = si_pc.loc[si_key, 'Revenue 2026'] if si_key in si_pc.index else 0
    si_units2025 = si_pc.loc[si_key, 'Units 2025'] if si_key in si_pc.index else 0
    si_units2026 = si_pc.loc[si_key, 'Units 2026'] if si_key in si_pc.index else 0
    acos2025 = safe_div(rec['spend2025'], rec['attribSales2025'])
    acos2026 = safe_div(rec['spend2026'], rec['attribSales2026'])
    tacos2025 = safe_div(rec['spend2025'], si_rev2025)
    tacos2026 = safe_div(rec['spend2026'], si_rev2026)
    adsByProductCountry.append({
        'c': country, 'a': asin,
        's5': round(rec['spend2025'] or 0,2), 's6': round(rec['spend2026'] or 0,2),
        'as5': round(rec['attribSales2025'] or 0,2), 'as6': round(rec['attribSales2026'] or 0,2),
        'au5': int(rec['attribUnits2025'] or 0), 'au6': int(rec['attribUnits2026'] or 0),
        'ac5': acos2025, 'ac6': acos2026, 'tc5': tacos2025, 'tc6': tacos2026,
    })

# ---- Ads by ASIN (rolled up across the 5 ads countries) ----
prod_agg = {}
for (country, asin), rec in records.items():
    a = asin
    if a not in prod_agg:
        prod_agg[a] = {'asin': a, 'brand': rec['brand'], 'title': rec['title'],
                        'spend2025':0.0,'spend2026':0.0,'attribSales2025':0.0,'attribSales2026':0.0,
                        'attribUnits2025':0,'attribUnits2026':0,'sellInRevenue2025':0.0,'sellInRevenue2026':0.0}
    p = prod_agg[a]
    si_key = (country, asin)
    si_rev2025 = si_pc.loc[si_key, 'Revenue 2025'] if si_key in si_pc.index else 0
    si_rev2026 = si_pc.loc[si_key, 'Revenue 2026'] if si_key in si_pc.index else 0
    p['spend2025'] += rec['spend2025'] or 0; p['spend2026'] += rec['spend2026'] or 0
    p['attribSales2025'] += rec['attribSales2025'] or 0; p['attribSales2026'] += rec['attribSales2026'] or 0
    p['attribUnits2025'] += rec['attribUnits2025'] or 0; p['attribUnits2026'] += rec['attribUnits2026'] or 0
    p['sellInRevenue2025'] += si_rev2025 or 0; p['sellInRevenue2026'] += si_rev2026 or 0

adsByProduct = []
for a, p in prod_agg.items():
    p = {k: (round(v,2) if isinstance(v,float) else v) for k,v in p.items()}
    p['deltaSpend'] = round(p['spend2026']-p['spend2025'],2)
    p['deltaSpendPct'] = safe_div(p['spend2026']-p['spend2025'], p['spend2025'])
    p['acos2025'] = safe_div(p['spend2025'], p['attribSales2025'])
    p['acos2026'] = safe_div(p['spend2026'], p['attribSales2026'])
    p['tacos2025'] = safe_div(p['spend2025'], p['sellInRevenue2025'])
    p['tacos2026'] = safe_div(p['spend2026'], p['sellInRevenue2026'])
    p['costPerUnit2025'] = safe_div(p['spend2025'], p['attribUnits2025'])
    p['costPerUnit2026'] = safe_div(p['spend2026'], p['attribUnits2026'])
    adsByProduct.append(p)
adsByProduct.sort(key=lambda x: x['spend2026'], reverse=True)

# ---- Ads by brand ----
brand_agg = {}
for p in adsByProduct:
    b = p['brand']
    if b not in brand_agg:
        brand_agg[b] = {'brand': b, 'spend2025':0.0,'spend2026':0.0,'attribSales2025':0.0,'attribSales2026':0.0,
                         'attribUnits2025':0,'attribUnits2026':0,'sellInRevenue2025':0.0,'sellInRevenue2026':0.0}
    ba = brand_agg[b]
    ba['spend2025'] += p['spend2025']; ba['spend2026'] += p['spend2026']
    ba['attribSales2025'] += p['attribSales2025']; ba['attribSales2026'] += p['attribSales2026']
    ba['attribUnits2025'] += p['attribUnits2025']; ba['attribUnits2026'] += p['attribUnits2026']
    ba['sellInRevenue2025'] += p['sellInRevenue2025']; ba['sellInRevenue2026'] += p['sellInRevenue2026']

adsByBrand = []
for b, ba in brand_agg.items():
    ba = {k:(round(v,2) if isinstance(v,float) else v) for k,v in ba.items()}
    ba['deltaSpend'] = round(ba['spend2026']-ba['spend2025'],2)
    ba['acos2025'] = safe_div(ba['spend2025'], ba['attribSales2025'])
    ba['acos2026'] = safe_div(ba['spend2026'], ba['attribSales2026'])
    ba['tacos2025'] = safe_div(ba['spend2025'], ba['sellInRevenue2025'])
    ba['tacos2026'] = safe_div(ba['spend2026'], ba['sellInRevenue2026'])
    adsByBrand.append(ba)
adsByBrand.sort(key=lambda x: x['spend2026'], reverse=True)

print('adsByProduct', len(adsByProduct))
print('adsByProductCountry', len(adsByProductCountry))
print('adsByBrand', len(adsByBrand))
print('adsOverall', adsOverall)

json.dump({
    'adsOverall': adsOverall, 'adsByCountry': adsByCountry, 'adsByProduct': adsByProduct,
    'adsByBrand': adsByBrand, 'adsByProductCountry': adsByProductCountry,
}, open('ads_data.json','w'), ensure_ascii=False)

import os
print('size KB', os.path.getsize('ads_data.json')/1024)
