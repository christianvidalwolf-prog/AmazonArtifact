import pandas as pd
import numpy as np
import json
import sys

# Usage: python prep_data.py [path_to_sellin_report.xlsx]
# Defaults to a file named exactly this in the current directory.
SELLIN = sys.argv[1] if len(sys.argv) > 1 else 'Informe_Sell_In_S1_2025_vs_2026_Titulos_EN.xlsx'

def clean(v):
    if pd.isna(v):
        return None
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating,)):
        return round(float(v), 4)
    return v

# ---------- SELL-IN ----------
resumen = pd.read_excel(SELLIN, sheet_name='Resumen', header=3)
resumen.columns = [c.strip() for c in resumen.columns]
total_row = resumen.iloc[0]
country_rows = resumen.iloc[5:19]
country_rows = country_rows[country_rows['Nivel'].notna()]
country_rows = country_rows[country_rows['Nivel'] != 'Nivel']

overall = {
    'revenue2025': clean(total_row['Revenue 2025']),
    'revenue2026': clean(total_row['Revenue 2026']),
    'deltaRevenue': clean(total_row['Δ Revenue']),
    'deltaRevenuePct': clean(total_row['Δ Revenue %']),
    'units2025': clean(total_row['Units 2025']),
    'units2026': clean(total_row['Units 2026']),
    'deltaUnits': clean(total_row['Δ Units']),
    'deltaUnitsPct': clean(total_row['Δ Units %']),
    'aov2025': clean(total_row['Ticket medio 2025']),
    'aov2026': clean(total_row['Ticket medio 2026']),
    'deltaAov': clean(total_row['Δ Ticket medio']),
    'returns2025': clean(total_row['Devoluciones 2025']),
    'returns2026': clean(total_row['Devoluciones 2026']),
    'deltaReturns': clean(total_row['Δ Devoluciones']),
    'deltaReturnsPct': clean(total_row['Δ Devoluciones %']),
    'returnRate2025': clean(total_row['Return rate 2025']),
    'returnRate2026': clean(total_row['Return rate 2026']),
}

byCountry = []
for _, r in country_rows.iterrows():
    byCountry.append({
        'country': r['Nivel'],
        'revenue2025': clean(r['Revenue 2025']),
        'revenue2026': clean(r['Revenue 2026']),
        'deltaRevenue': clean(r['Δ Revenue']),
        'deltaRevenuePct': clean(r['Δ Revenue %']),
        'units2025': clean(r['Units 2025']),
        'units2026': clean(r['Units 2026']),
        'deltaUnits': clean(r['Δ Units']),
        'deltaUnitsPct': clean(r['Δ Units %']),
        'aov2025': clean(r['Ticket medio 2025']),
        'aov2026': clean(r['Ticket medio 2026']),
        'deltaAov': clean(r['Δ Ticket medio']),
        'returns2025': clean(r['Devoluciones 2025']),
        'returns2026': clean(r['Devoluciones 2026']),
        'deltaReturns': clean(r['Δ Devoluciones']),
        'deltaReturnsPct': clean(r['Δ Devoluciones %']),
        'returnRate2025': clean(r['Return rate 2025']),
        'returnRate2026': clean(r['Return rate 2026']),
    })
byCountry.sort(key=lambda x: x['revenue2026'] or 0, reverse=True)

# ---------- Products Total (886 rows) ----------
prod_total = pd.read_excel(SELLIN, sheet_name='Productos Total')
prod_total = prod_total[~((prod_total['Revenue 2025']==0)&(prod_total['Revenue 2026']==0))].copy()

def mk_product(r):
    isNew = (r['Revenue 2025']==0 and r['Revenue 2026']>0)
    isDisc = (r['Revenue 2026']==0 and r['Revenue 2025']>0)
    return {
        'asin': r['ASIN'],
        'brand': r['Brand'],
        'title': r['Product title EN'],
        'revenue2025': clean(r['Revenue 2025']),
        'revenue2026': clean(r['Revenue 2026']),
        'deltaRevenue': clean(r['Δ Revenue']),
        'deltaRevenuePct': clean(r['Δ Revenue %']),
        'units2025': clean(r['Units 2025']),
        'units2026': clean(r['Units 2026']),
        'deltaUnits': clean(r['Δ Units']),
        'deltaUnitsPct': clean(r['Δ Units %']),
        'aov2025': clean(r['Ticket medio 2025']),
        'aov2026': clean(r['Ticket medio 2026']),
        'returns2025': clean(r['Devoluciones 2025']),
        'returns2026': clean(r['Devoluciones 2026']),
        'deltaReturns': clean(r['Δ Devoluciones']),
        'returnRate2025': clean(r['Return rate 2025']),
        'returnRate2026': clean(r['Return rate 2026']),
        'status': 'new' if isNew else ('discontinued' if isDisc else 'active'),
    }

products = [mk_product(r) for _, r in prod_total.iterrows()]

# Top movers (revenue) - by absolute impact, min base rules already embedded in status flag
def top_movers(df, metric_val, metric_pct, n=15, ascending=False):
    d = df.copy()
    d = d.sort_values(metric_val, ascending=ascending)
    return d.head(n)

top_grow_rev_total = [mk_product(r) for _, r in top_movers(prod_total, 'Δ Revenue', 'Δ Revenue %', 15, False).iterrows()]
top_fall_rev_total = [mk_product(r) for _, r in top_movers(prod_total, 'Δ Revenue', 'Δ Revenue %', 15, True).iterrows()]
top_grow_units_total = [mk_product(r) for _, r in top_movers(prod_total, 'Δ Units', 'Δ Units %', 15, False).iterrows()]
top_fall_units_total = [mk_product(r) for _, r in top_movers(prod_total, 'Δ Units', 'Δ Units %', 15, True).iterrows()]

# Returns leaders
returns_leaders = sorted(products, key=lambda x: x['returns2026'] or 0, reverse=True)[:15]
returns_growth_leaders = sorted(products, key=lambda x: (x['deltaReturns'] or 0), reverse=True)[:15]

# ---------- Products by Country (for per-country winners/losers + drill-down) ----------
prod_country = pd.read_excel(SELLIN, sheet_name='Productos País')
prod_country = prod_country[~((prod_country['Revenue 2025']==0)&(prod_country['Revenue 2026']==0))].copy()

def mk_product_c(r):
    isNew = (r['Revenue 2025']==0 and r['Revenue 2026']>0)
    isDisc = (r['Revenue 2026']==0 and r['Revenue 2025']>0)
    def r2(v):
        return round(float(v),2) if pd.notna(v) else 0
    return {
        'c': r['Country'], 'a': r['ASIN'], 'b': r['Brand'],
        'r5': r2(r['Revenue 2025']), 'r6': r2(r['Revenue 2026']), 'dr': r2(r['Δ Revenue']),
        'drp': clean(r['Δ Revenue %']),
        'u5': int(r['Units 2025']), 'u6': int(r['Units 2026']), 'du': int(r['Δ Units']),
        'dup': clean(r['Δ Units %']),
        'rt5': int(r['Devoluciones 2025']), 'rt6': int(r['Devoluciones 2026']),
        'st': 'new' if isNew else ('discontinued' if isDisc else 'active'),
    }

top_grow_rev_country = [mk_product_c(r) for _, r in prod_country.sort_values('Δ Revenue', ascending=False).groupby('Country').head(8).iterrows()]
top_fall_rev_country = [mk_product_c(r) for _, r in prod_country.sort_values('Δ Revenue', ascending=True).groupby('Country').head(8).iterrows()]

# Full country-level product table (for dynamic client-side filtering by country/brand/ASIN)
productsByCountry = [mk_product_c(r) for _, r in prod_country.iterrows()]

print('products', len(products))
print('prod_country rows kept', len(prod_country))

json.dump({
    'overall': overall, 'byCountry': byCountry, 'products': products,
    'topGrowRevenueTotal': top_grow_rev_total, 'topFallRevenueTotal': top_fall_rev_total,
    'topGrowUnitsTotal': top_grow_units_total, 'topFallUnitsTotal': top_fall_units_total,
    'productsByCountry': productsByCountry,
    'returnsLeaders': returns_leaders, 'returnsGrowthLeaders': returns_growth_leaders,
}, open('sellin_data.json','w'), ensure_ascii=False)
print('sellin json size KB', len(json.dumps({'products':products,'productsByCountry':productsByCountry}))/1024)
