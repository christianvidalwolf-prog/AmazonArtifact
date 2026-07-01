"""
Combines dashboard_template.html + app.js + sellin_data.json + ads_data.json
into a single self-contained HTML file (dashboard_final.html).

Usage:
    python build.py
    python build.py --output MyDashboard.html
"""
import argparse

parser = argparse.ArgumentParser()
parser.add_argument('--template', default='dashboard_template.html')
parser.add_argument('--app', default='app.js')
parser.add_argument('--sellin-json', default='sellin_data.json')
parser.add_argument('--ads-json', default='ads_data.json')
parser.add_argument('--output', default='dashboard_final.html')
args = parser.parse_args()

html = open(args.template, encoding='utf-8').read()
sellin = open(args.sellin_json, encoding='utf-8').read()
ads = open(args.ads_json, encoding='utf-8').read()
appjs = open(args.app, encoding='utf-8').read()

html = html.replace('/*__SELLIN_DATA__*/', sellin)
html = html.replace('/*__ADS_DATA__*/', ads)
html = html.replace('<script src="app.js"></script>', '<script>\n' + appjs + '\n</script>')

open(args.output, 'w', encoding='utf-8').write(html)
print(f'Wrote {args.output} ({len(html)/1024/1024:.2f} MB)')
