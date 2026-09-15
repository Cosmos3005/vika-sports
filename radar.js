window.VikaRadar=(function(){
  const ESPN={football:'soccer/eng.1',tennis:'tennis/atp',basketball:'basketball/nba',hockey:'hockey/nhl',mma:'mma/ufc'};
  const LABEL={football:'Футбол',tennis:'Теннис',basketball:'Баскетбол',hockey:'Хоккей',mma:'MMA'};
  const money=v=>{const n=Number(v);if(!Number.isFinite(n))return null;return n>=100?1+n/100:n<=-100?1+100/Math.abs(n):n>1?n:null};
  const record=c=>{const a=Array.isArray(c?.records)?c.records:[c?.records||c?.record];for(const r of a){const m=String(r?.summary||r?.displayValue||'').match(/(\d+)\s*[-:]\s*(\d+)/);if(m){const w=Number(m[1]),l=Number(m[2]);if(w+l)return w/(w+l)}}return null};
  const rank=c=>{const n=Number(c?.rank??c?.ranking?.rank);return Number.isFinite(n)?n:null};
  const odds=o=>{if(!o)return{};return{home:money(o.moneyline?.home??o.homeTeamOdds?.moneyLine??o.homeOdds),away:money(o.moneyline?.away??o.awayTeamOdds?.moneyLine??o.awayOdds),draw:money(o.moneyline?.draw??o.drawOdds)}};
  function probability(h,a,sport,hr,ar){
    const hf=record(h),af=record(a);if(hf==null||af==null)return null;
    const ranked=Number.isFinite(hr)&&Number.isFinite(ar);
    if(sport==='football'){
      if(!ranked)return{p:{home:52,draw:25,away:23},features:1,reason:'Есть форма, но нет рейтинговой пары'};
      const z=(hf-af)*2.6+(ar-hr)/20*.55+.22,s=1/(1+Math.exp(-Math.max(-8,Math.min(8,z)))),H=s*100,A=(1-s)*100,D=Math.max(9,Math.min(24,22-Math.abs(z)*3)),k=100/(H+A+D);return{p:{home:H*k,draw:D*k,away:A*k},features:2};
    }
    const z=(hf-af)*3+(ranked?(ar-hr)/25*.35:0),s=1/(1+Math.exp(-Math.max(-8,Math.min(8,z))));return{p:{home:s*100,away:(1-s)*100},features:ranked?2:1};
  }
  function model(e,sport,ranks){
    const c=e?.competitions?.[0],t=c?.competitors||[],h=t.find(x=>x.homeAway==='home'),a=t.find(x=>x.homeAway==='away');if(!h||!a)return null;
    const hr=rank(h)??ranks.get(String(h.team?.id)),ar=rank(a)??ranks.get(String(a.team?.id)),m=probability(h,a,sport,hr,ar);if(!m)return null;
    const pick=Object.entries(m.p).sort((x,y)=>y[1]-x[1])[0],line=odds((c.odds||e.odds||[])[0])[pick[0]],prob=pick[1],fair=100/prob,edge=line!=null?(prob/100*line-1):null;
    const confidence=Math.min(78,58+m.features*4),ready=m.features>=2;
    let status='WATCH',reason=line==null?'Нет независимой линии':!ready?'Недостаточно подтверждений':prob<55?'Вероятность ниже порога 55%':confidence<60?'Недостаточная уверенность':edge<.03?'Нет требуемого Edge +3%':'Все базовые условия сигнала выполнены';
    if(line!=null&&ready&&prob>=55&&confidence>=60&&edge>=.03)status='SIGNAL';
    return{eventId:e.id,sport,home:h.team?.displayName||'Home',away:a.team?.displayName||'Away',time:e.date,selection:pick[0],probability:prob,fair,odds:line,edge,confidence,status,reason};
  }
  async function fetchSport(sport){try{const r=await fetch(`https://site.api.espn.com/apis/site/v2/sports/${ESPN[sport]}/scoreboard`,{cache:'no-store'});if(!r.ok)throw 0;return(await r.json()).events||[]}catch{return[]}}
  async function fetchRanks(sport){try{const r=await fetch(`https://site.api.espn.com/apis/v2/sports/${ESPN[sport]}/standings`,{cache:'no-store'});if(!r.ok)throw 0;const d=await r.json(),m=new Map();const walk=x=>{if(!x)return;if(Array.isArray(x)){x.forEach(walk);return}if(x.team){const stats=x.stats||[];let n=Number(x.rank??x.seed);if(!Number.isFinite(n)){const s=stats.find(v=>/rank|seed|playoff/i.test(String(v.name||v.abbreviation||'')));n=Number(s?.value)}if(x.team.id&&Number.isFinite(n))m.set(String(x.team.id),n)}walk(x.children);walk(x.entries);walk(x.standings);walk(x.groups)};walk(d);return m}catch{return new Map()}}
  function draw(rows,meta){const box=document.querySelector('#radarResults'),metaBox=document.querySelector('#radarMeta');if(!box)return;const signals=rows.filter(x=>x.status==='SIGNAL'),watch=rows.filter(x=>x.status==='WATCH');if(metaBox)metaBox.textContent=`Последний скан: ${new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})} · проверено ${meta.scanned} · SIGNAL ${signals.length} · WATCH ${watch.length}`;if(!rows.length){box.innerHTML='<div class="radar-empty">Пока нет матчей, которые можно корректно проверить. Vika ничего не выдумывает.</div>';return}box.innerHTML=rows.slice(0,10).map(x=>{const edge=x.edge==null?'нет линии':`${x.edge>=0?'+':''}${(x.edge*100).toFixed(1)}%`;const q=x.selection==='home'?x.home:x.selection==='away'?x.away:'Ничья';const href=`match.html?sport=${encodeURIComponent(x.sport)}&eventId=${encodeURIComponent(x.eventId)}&home=${encodeURIComponent(x.home)}&away=${encodeURIComponent(x.away)}`;return `<article class="radar-row"><div><span class="radar-status ${x.status.toLowerCase()}">${x.status==='SIGNAL'?'🔥 SIGNAL':'👁 WATCH'}</span><b>${x.home} · ${x.away}</b><small>${q} · ${LABEL[x.sport]||x.sport}</small></div><div class="radar-metrics"><span>AI <b>${x.probability.toFixed(1)}%</b></span><span>Fair <b>${x.fair.toFixed(2)}</b></span><span>Edge <b>${edge}</b></span><span>Conf <b>${x.confidence}%</b></span></div><a href="${href}">Открыть →</a></article>`}).join('')}
  async function scan(){const sports=Object.keys(ESPN),meta={scanned:0},results=await Promise.all(sports.map(async sport=>{const events=await fetchSport(sport);const ranks=await fetchRanks(sport);return events.map(e=>{meta.scanned++;return model(e,sport,ranks)}).filter(Boolean)}));const rows=results.flat();rows.sort((a,b)=>(b.status==='SIGNAL')-(a.status==='SIGNAL')||(b.edge??-999)-(a.edge??-999)||b.confidence-a.confidence);draw(rows,meta);return rows}
  document.addEventListener('DOMContentLoaded',()=>{if(document.querySelector('#radarResults')){scan();setInterval(scan,120000)}});return{scan};
})();