from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from urllib.request import Request, urlopen
import json, os
ROOT=os.path.dirname(os.path.abspath(__file__)); PORT=int(os.environ.get('PORT','8080'))
ESPN_MAP={'football':'soccer/eng.1','basketball':'basketball/nba','hockey':'hockey/nhl','tennis':'tennis/atp','mma':'mma/ufc'}
class Handler(SimpleHTTPRequestHandler):
 def end_headers(self): self.send_header('Cache-Control','no-store'); super().end_headers()
 def json(self,obj,status=200):
  raw=json.dumps(obj,ensure_ascii=False).encode('utf-8'); self.send_response(status); self.send_header('Content-Type','application/json; charset=utf-8'); self.send_header('Content-Length',str(len(raw))); self.end_headers(); self.wfile.write(raw)
 def do_GET(self):
  p=urlparse(self.path)
  if p.path=='/api/scoreboard':
   sport=parse_qs(p.query).get('sport',['football'])[0]; path=ESPN_MAP.get(sport)
   if not path:return self.json({'source':'demo','events':[],'message':'Для этого спорта нужен отдельный провайдер.'})
   url='https://site.api.espn.com/apis/site/v2/sports/'+path+'/scoreboard'
   try:
    req=Request(url,headers={'User-Agent':'VikaSports/1.0'}); data=json.load(urlopen(req,timeout=8)); return self.json({'source':'ESPN','events':data.get('events',[])})
   except Exception as e:return self.json({'source':'fallback','events':[],'error':str(e)},200)
  if p.path=='/api/thesportsdb':
   date=parse_qs(p.query).get('date',[''])[0]
   if not date:return self.json({'events':[]})
   url=f'https://www.thesportsdb.com/api/v1/json/123/eventsday.php?d={date}'
   try:
    req=Request(url,headers={'User-Agent':'VikaSports/1.0'}); data=json.load(urlopen(req,timeout=8)); return self.json({'source':'TheSportsDB','events':data.get('events') or []})
   except Exception as e:return self.json({'source':'fallback','events':[],'error':str(e)},200)
  return super().do_GET()
os.chdir(ROOT); print(f'Vika Sports запущен: http://127.0.0.1:{PORT}'); ThreadingHTTPServer(('0.0.0.0',PORT),Handler).serve_forever()
