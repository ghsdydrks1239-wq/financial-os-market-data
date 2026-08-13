import os, zipfile, xml.etree.ElementTree as ET
from pathlib import Path

xlsx = Path('.tmp/boe-latest-yield/GLC Nominal daily data current month.xlsx')
if not xlsx.exists():
    raise SystemExit(f'missing {xlsx}')

NS = {'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships','p':'http://schemas.openxmlformats.org/package/2006/relationships'}
with zipfile.ZipFile(xlsx) as z:
    shared=[]
    if 'xl/sharedStrings.xml' in z.namelist():
        root=ET.fromstring(z.read('xl/sharedStrings.xml'))
        for si in root.findall('m:si', NS):
            shared.append(''.join(t.text or '' for t in si.iterfind('.//m:t', NS)))
    wb=ET.fromstring(z.read('xl/workbook.xml'))
    rels=ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
    relmap={r.attrib['Id']:r.attrib['Target'] for r in rels}
    sheets=[]
    for s in wb.find('m:sheets',NS):
        rid=s.attrib.get('{%s}id'%NS['r'])
        target=relmap[rid]
        if not target.startswith('xl/'):
            target='xl/'+target.lstrip('/')
        sheets.append((s.attrib['name'],target))
    print('SHEETS', sheets)
    for name,target in sheets:
        root=ET.fromstring(z.read(target))
        print('--- SHEET', name, target)
        rows=root.findall('.//m:sheetData/m:row',NS)[:14]
        for row in rows:
            vals=[]
            for c in row.findall('m:c',NS):
                ref=c.attrib.get('r')
                typ=c.attrib.get('t')
                v=c.find('m:v',NS)
                val='' if v is None else (v.text or '')
                if typ=='s' and val.isdigit(): val=shared[int(val)]
                elif typ=='inlineStr':
                    val=''.join(t.text or '' for t in c.iterfind('.//m:t',NS))
                vals.append(f'{ref}={val}')
            print('ROW',row.attrib.get('r'), ' | '.join(vals[:20]))
