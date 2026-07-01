# CRAZE H1 2025 vs 2026 — Executive Dashboard

Self-contained HTML/JS dashboard (no server, no build tooling) comparing Amazon
sell-in, returns and advertising performance for H1 (weeks 1–26) 2025 vs 2026.

## How it's built

The final artifact (`dashboard_final.html`) is **one static HTML file** with the
data baked in as a JS object — there's no backend and no fetch of the source
Excel files at runtime. It's assembled from these pieces:

```
Informe_Sell_In_*.xlsx  ──┐
                           ├─► prep_data.py ──► sellin_data.json ──┐
Ads_Weekly_*.xlsx  ───────┘                                        │
                           └─► prep_ads.py ───► ads_data.json ─────┼─► build.py ──► dashboard_final.html
                                                                    │
dashboard_template.html (CSS + HTML shell, data placeholders) ─────┤
app.js (all client-side logic, filtering, charts, tables) ─────────┘
```

## Files

| File | What it does |
|---|---|
| `prep_data.py` | Reads the Sell-In Excel report, pulls the already-computed summary sheets (`Resumen`, `Productos Total`, `Productos País`, etc.) and writes `sellin_data.json` — country totals, per-ASIN totals, and the full per-country/per-ASIN table used for dynamic filtering. |
| `prep_ads.py` | Reads the Ads Weekly Excel report (raw weekly ASIN×country rows), aggregates to ASIN×country×year, joins brand/title from the Sell-In file, and writes `ads_data.json` — ads overall, by country, by product, by brand, and the full per-product/per-country table. |
| `dashboard_template.html` | HTML structure + all CSS (light corporate theme: navy header, single copper accent, IBM Plex Mono for numbers). Contains two placeholders, `/*__SELLIN_DATA__*/` and `/*__ADS_DATA__*/`, and a `<script src="app.js">` tag that `build.py` inlines. |
| `app.js` | All client-side logic: filter state (country multi-select, brand, product search), aggregation functions, Chart.js rendering per tab, sortable/copyable tables, and the "Ask the Data" Claude Q&A panel. Vanilla JS, no framework. |
| `build.py` | Stitches everything into one file: replaces the two placeholders with the JSON, inlines `app.js` in place of the `<script src>` tag. |
| `smoketest.js` | Node harness that stubs `document`/`Chart`/`fetch` and exercises every tab across several filter combinations (single country, multi-country, brand filter, search, empty selection, non-ads country, the Ask-the-Data round trip). Run this after any change to `app.js` before rebuilding — it catches undefined-reference and aggregation bugs without needing a browser. |

## Rebuilding from scratch

```bash
pip install pandas openpyxl

# 1. Regenerate the data JSON from the source Excel files
python prep_data.py Informe_Sell_In_S1_2025_vs_2026_Titulos_EN.xlsx
python prep_ads.py Informe_Sell_In_S1_2025_vs_2026_Titulos_EN.xlsx Ads_Weekly_2025_vs_2026_with_TACOS_EN.xlsx

# 2. (Optional but recommended) sanity-check app.js logic before building
node smoketest.js

# 3. Assemble the final single-file dashboard
python build.py --output dashboard_final.html
```

Open `dashboard_final.html` directly in a browser — everything except the
"Ask the Data" tab works fully offline.

## Data notes worth knowing before you touch this

- **Sell-in = Ordered revenue / Ordered units**, not Dispatched. This was
  verified row-by-row (6,493/6,493 matches) against the raw Vendor Central
  export (`Sell_in_2025.xlsx` / `Sell_in_2026.xlsx`, not included here).
- **Ads coverage is 5 of 13 sell-in markets**: DE, ES, FR, IT, UK (UK maps to
  `GB` in the sell-in file — see `CMAP`/`RCMAP` in `prep_ads.py`). The
  dashboard shows an explicit "no data" state rather than zeros when a
  filtered country has no ads coverage — don't quietly default to 0.
- **Revenue can be negative** in the raw data (return/credit adjustments in
  some ASIN×country rows). Any filter that drops rows based on `revenue > 0`
  will silently under-count — always test for `=== 0` on both years, not
  `<= 0`. This bit us once already: a multi-country filter combined with a
  `>0` guard excluded a product with a net-negative revenue row and inflated
  the aggregate by the size of that row.
- **Country filter is multi-select** (`state.countries` is a `Set`, defaults
  to all countries). When it's not "all countries", `app.js` re-aggregates
  from the per-country/per-ASIN tables client-side rather than using the
  precomputed totals — see `aggregateProductsByAsin` / `aggregateAdsByAsin`.
- **"Ask the Data" calls `https://api.anthropic.com/v1/messages` directly
  from the browser** with `model: 'claude-sonnet-4-6'`, no API key handling
  needed inside Claude.ai/Claude Code artifacts. It sends a compact text
  summary of the *currently filtered* data (not the full dataset) as context
  on the first turn, then resends the running conversation each call (the API
  is stateless). This tab requires network access; the rest of the dashboard
  does not.

## Known simplifications

- Charts use Chart.js loaded from `cdnjs.cloudflare.com` — requires network
  access to render (tables and KPI numbers still work without it).
- The "Ordered vs Dispatched" and "multi-country filter" fixes described
  above are already applied in this version of `app.js` / `prep_*.py`.
