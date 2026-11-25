"""Build an offline course index from the bulletin cache and verified corrections."""
from pathlib import Path
import argparse,json,re,unicodedata
from urllib.parse import quote
from bs4 import BeautifulSoup as Soup
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('cache', type=Path, help='Research directory containing pages/ and optional sis/records.json')
root=parser.parse_args().cache
data=Path(__file__).resolve().parents[1]/'data'
def read(p): return json.loads(p.read_text(encoding='utf-8-sig'))
def clean(t):
 return re.sub(r'\s+',' ',unicodedata.normalize('NFKC',t)).strip()
def tidy(t):
 return re.sub(r'\s+([.,;)])',r'\1',re.sub(r'\(\s+','(',clean(t)))
programs=sum((read(f) for f in sorted(data.glob('*programs.json'))),[])
courses={}
overrides={}
for f in sorted(data.glob('*overrides.json')):
 for code,fields in read(f).items():overrides.setdefault(code,{}).update(fields)
sis=read(root/'sis/records.json') if (root/'sis/records.json').exists() else {}
syllabi={}
for f in sorted(data.glob('*syllabi.json')):syllabi.update(read(f))
def titlecase(s):
 s=clean(s).rstrip('.')
 if s.upper()!=s:return s
 acr={'AI','CS','SQL','NLP','R','II','III','IV','I','HCI','UX','ML','C','UNIX','GIS','EE','V'}
 return ' '.join(x if x in acr else x.lower() if i and x in {'AND','OF','TO','FOR','IN','THE','WITH','ON','OR'} else x.capitalize() for i,x in enumerate(s.split()))
def extract_label(text,kind):
 m=re.search(r'\b'+kind+r'[\s-]?requisites?\s*:\s*',text,re.I)
 if not m:return ''
 return re.split(r'(?<=[.!?])\s+(?=[A-Z])|(?:Pre|Co)[ -]?requisite[s]?:',text[m.end():],maxsplit=1,flags=re.I)[0][:420].strip()
def abbrev(s):
 # Keep short catalog excerpts with a direct link to the full description.
 w=s.split()
 if len(w)>24:
  k=' '.join(w[:24])
  m=re.search(r'[.!?](?:\s|$)',k)
  return k[:m.start()+1] if m and m.start()>55 else k.rstrip(',.;:')+'…'
 return s
def extract(code,file):
 page=Soup(file.read_bytes(),'html.parser')
 a=next((x for x in page.select('article.search-courseresult') if x.h3 and clean(x.h3.get_text(' ',strip=True)).startswith(code+' ')),None)
 hdr=clean(a.h3.get_text(' ',strip=True))[len(code):].strip() if a else ''
 m=re.search(r'\s*(-?\d+(?:\.\d+)?)\s*(?:[-–]\s*(\d+(?:\.\d+)?))?\s*(?:points?|pts?)\b',hdr,re.I)
 d={'title':titlecase(hdr[:m.start()] if m else hdr) or code,'credits':[float(m[1]),float(m[2] or m[1])] if m else None,
    'source':'https://bulletin.columbia.edu/search/?P='+quote(code),'preText':'','coText':'','description':''}
 if m and d['credits'][0]<0: d['credits'][0]=abs(d['credits'][0]); d['credits'][1]=abs(d['credits'][1])
 ds=a.select('.courseblockdesc') if a else []
 content=' '.join(clean(t.get_text(' ',strip=True)) for t in ds)
 for kind,css,key in [('Pre','.prereq','preText'),('Co','.coreq','coText')]:
  tags=list(dict.fromkeys(tidy(t.get_text(' ',strip=True)) for t in a.select(css))) if a else []
  d[key]=re.sub(r'^(?:Pre|Co)[ -]?requisites?\s*:\s*','',tags[0],flags=re.I) if tags else extract_label(content,kind)
 for t in (a.select('.prereq,.coreq,.testdesc') if a else []): t.decompose()
 paragraphs=[clean(x.get_text(' ',strip=True)) for t in ds for x in (t.select('p.closed') or [t])]
 desc=next((p for p in paragraphs if len(p)>5),'')
 # Remove repeated registration formulas before the actual course description.
 if re.match(r'^(?:Pre|Co)[ -]?requisites?:',desc,re.I):
  candidates=re.split(r'(?<=[.!?])\s+(?=[A-Z])|\s+(?=(?:This course |The course |An introduction |Introduction to |How a market |Covers |Topics include |Designed for |Vectors in dimensions |Matrices, |A calculus-based |Theory and practice |Course Overview:))',desc)
  desc=next((v for v in candidates if len(v)>24 and not re.match(r'^(?:Pre|Co)[ -]?requisit|^Students without|^Students may|^At least|^The second term|^See ',v,re.I)),desc)
 if not desc or not d['credits']:
  supp=sis.get(code,{})
  if supp:
   rows=supp['rows']; headings=supp.get('headings',[])
   d['sourceExtra']=supp['url']
   if not hdr and len(headings)>1:d['title']=titlecase(headings[1])
   if not d['credits'] and (cm:=re.search(r'(\d+(?:\.\d+)?)(?:\s*[-–]\s*(\d+(?:\.\d+)?))?',rows.get('Points',''))):d['credits']=[float(cm[1]),float(cm[2] or cm[1])]
   desc=desc or rows.get('Course Description','')
   for kind,k in [('Pre','preText'),('Co','coText')]:d[k]=d[k] or extract_label(desc,kind) or rows.get(kind+'requisites','')
 if not desc:d['note']='The individual listing gives no course description or preparation details. Check the linked source or section before selecting it.'
 d['description']=abbrev(tidy(desc))
 if code in syllabi:d['syllabus']=syllabi[code]
 return d
for f in sorted((root/'pages').glob('*.html')):courses[f.stem]=extract(f.stem,f)
known=set(courses)|set(overrides)
code_re=re.compile(r'(?<![A-Za-z])([A-Za-z]{3,5})\s*([A-Z]{1,3})\s*(\d{4})(?!\d)|(?<![A-Za-z])([A-Z]{1,3})\s*(\d{4})(?!\d)')
def canon(sub,prefix,num):
 key=sub+' '+prefix+num
 if key in known:return key
 candidates=[c for c in known if c.startswith(sub+' ') and c.endswith(num)]
 if len(candidates)==1:return candidates[0]
 if sub in {'MATH','PHIL','SOCI','POLS','ECON','STAT'} and prefix in {'W','V','G'}:return sub+' '+('GU' if int(num)>=4000 else 'UN')+num
 return key
def parse(t,code):
 # Prefer the first formal rule. Some entries repeat the same course list with legacy numbers.
 t=re.split(r'\b(?:Recommended:|Suggested preparation:|Students who |Students without|Students may|For registration|This course|Registration information|An introduction)',t,flags=re.I)[0]
 parts=[]; end=0; sub=code.split()[0]; seen=set()
 for m in code_re.finditer(t):
  if m[1]:
   if m[1].upper() not in {c.split()[0] for c in known}:continue
   sub=m[1].upper()
  key=canon(sub,m[2] or m[4],m[3] or m[5])
  if key==code:continue
  gap=t[end:m.start()]
  if key in seen:break
  if parts and (len(gap)>70 or re.search(r'\b(?:recommended|helpful|not required|not receive)\b',gap,re.I)):break
  if re.search(r'(?:is|are) (?:strongly )?recommended|helpful but not required',t[m.end():m.end()+45],re.I) and not parts:break
  if not parts or not re.search(r'\bor\b',gap,re.I):parts.append([key])
  else:parts[-1].append(key)
  seen.add(key);end=m.end()
 return ';'.join('/'.join(group) for group in parts)
def rule(s):
 return [[[c.strip() for c in bundle.split('+')] for bundle in group.split('/')] for group in s.split(';') if group.strip()]
for c,d in courses.items():
 o=overrides.get(c,{})
 for k,raw in [('pre','preText'),('co','coText')]:d[k]=rule(o[k] if k in o else parse(d[raw],c))
 for k,v in o.items():
  if k not in ['pre','co']:d[k]=v
 if d.get('description') and d.get('note','').startswith('The individual listing gives no'):d.pop('note')
 # Remove empty fields except dependency arrays.
 for k in list(d):
  if k not in {'pre','co','credits'} and not d[k]:del d[k]
seeds={c for p in programs for v in [p]+p.get('variants',[]) for s in v['sections'] for g in s['groups'] for opt in g['options'] for c in opt['courses']}
visited=set();todo=set(seeds)
while todo:
 visited.update(todo)
 todo={c for key in todo for k in ['pre','co'] for g in courses.get(key,{}).get(k,[]) for bundle in g for c in bundle}-visited
missing=visited-courses.keys()
(root/'remaining.json').write_text(json.dumps(sorted(missing)))
out={k:courses[k] for k in sorted(visited) if k in courses}
(data/'catalog.json').write_text(json.dumps(out,ensure_ascii=False,separators=(',',':')),encoding='utf8')
print('Program courses',len(seeds),'reachable',len(visited),'missing',sorted(missing))
print('Credit unknown',[k for k,d in out.items() if d['credits'] is None])
print('Summary missing',[k for k,d in out.items() if not d.get('description')])
