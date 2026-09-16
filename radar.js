window.VikaRadar=(function(){
  const ESPN={football:'soccer/eng.1',tennis:'tennis/atp',basketball:'basketball/nba',hockey:'hockey/nhl',mma:'mma/ufc'};
  const LABEL={football:'Футбол',tennis:'Теннис',basketball:'Баскетбол',hockey:'Хоккей',mma:'MMA'};
  const money=v=>{const n=Number(v);if(!Number.isFinite(n))return null;return n>=100?1+n/100:n<=-100?1+100/Math.abs(n):n>1?n:null};
  const rank=c=>{const n=Number(c?.rank??c?.ranking?.rank);return Number.isFinite(n)?n:null};
  const odds=o=>{if(!o)return{};return{home:money(o.moneyline?.home??o.homeTeamOdds?.moneyLine??o.homeTeamOdds?.price??o.homeOdds),away:money(o.moneyline?.away??o.awayTeamOdds?.moneyLine??o.awayTeamOdds?.price??o.awayOdds),draw:money(o.moneyline?.draw??o.drawOdds)}};
  async function fetchSport(sport){try{const r=await fetch(`https://site.api.espn.com/apis/site/v2/sports/${ESPN[sport]}/scoreboard`,{cache:'no-store'});if(!r.ok)throw 0;return(await r.json()).events||[]}catch{return[]}}
  async function fetchRanks(sport){try{const r=await fetch(`https://site.api.espn.com/apis/v2/sports/${ESPN[sport]}/standings`,{cache:'no-store'});if(!r.ok)throw 0;const d=await r.json(),m=new Map();const walk=x=>{if(!x)return;if(Array.isArray(x)){x.forEach(walk);return}if(x.team){let n=Number(x.rank??x.seed);const stats=x.stats||[];if(!Number.isFinite(n)){const s=stats.find(v=>/rank|seed|playoff/i.test(String(v.name||v.abbreviation||'')));n=Number(s?.value)}if(x.team.id&&Number.isFinite(n))m.set(String(x.team.id),n)}walk(x.children);walk(x.entries);walk(x.standings);walk(x.groups)};walk(d);return m}catch{return new Map()}}
  async function fetchSummary(sport,eventId){try{const r=await fetch(`https://site.api.espn.com/apis/site/v2/sports/${ESPN[sport]}/summary?event=${encodeURIComponent(eventId)}`,{cache:'no-store'});if(!r.ok)throw 0;return await r.json()}catch{return null}}
  function eventMode(e){return e?.status?.type?.state==='in'?'live':'prematch'}
  function completed(e){const t=e?.status?.type||{};return t.completed===true||['post','final'].includes(String(t.name||'').toLowerCase())||['post','final'].includes(String(t.state||'').toLowerCase())}
  function finalResult(e){const c=e?.competitions?.[0]?.competitors||[],h=c.find(x=>x.homeAway==='home'),a=c.find(x=>x.homeAway==='away');const hs=Number(h?.score),as=Number(a?.score);if(!Number.isFinite(hs)||!Number.isFinite(as))return null;return{result:hs>as?'home':as>hs?'away':'draw',score:`${hs} : ${as}`}}
  function settleCompleted(e){if(!completed(e)||!window.VikaBacktest||!e?.id)return false;const fin=finalResult(e);if(!fin)return false;window.VikaBacktest.settleEvent(e.id,fin.result,fin.score);return true}
  function statNumber(stats,names){for(const s of stats||[]){const n=String(s?.name||s?.label||s?.displayName||'').toLowerCase().replace(/[^a-z0-9]+/g,'');for(const x of names){const key=String(x).toLowerCase().replace(/[^a-z0-9]+/g,'');if(n===key){const v=Number(String(s?.value??s?.displayValue??'').replace('%',''));if(Number.isFinite(v))return v}}}return null}
  function liveStats(summary){const out={shots:{home:null,away:null},shotsOnTarget:{home:null,away:null},possession:{home:null,away:null}};for(const t of summary?.boxscore?.teams||[]){const side=t.homeAway==='home'?'home':'away',s=t.statistics||[];out.shots[side]=statNumber(s,['shots']);out.shotsOnTarget[side]=statNumber(s,['shots on target','shotsontarget']);out.possession[side]=statNumber(s,['possession'])}return out}
  function summaryOdds(summary){const roots=[summary?.pickcenter?.odds,summary?.odds,summary?.header?.competitions?.[0]?.odds].filter(Boolean).flat();for(const r of roots){const o=odds(r);if(o.home||o.away||o.draw)return o}return{}}
  function marketSelection(o){const valid=Object.entries(o||{}).filter(([,v])=>Number.isFinite(v)&&v>1);if(!valid.length)return null;return valid.sort((a,b)=>a[1]-b[1])[0][0]}
  function modelConflict(livePrediction,prematchPrediction,available,mode){if(mode!=='live'||!livePrediction)return false;const live=livePrediction.selection,pre=prematchPrediction?.selection,liveP=Number(livePrediction.probability);if(pre&&pre!==live&&liveP>=55&&Number(prematchPrediction.probability)>=55)return true;const market=marketSelection(available);if(market&&market!==live&&liveP>=55)return true;return false}
  function logSignal(row){if(row?.status!=='SIGNAL'||!window.VikaBacktest||!row.eventId)return null;const ledgerId=`${row.eventId}:${row.sport}:${row.mode}:${row.selection}`;return window.VikaBacktest.addPrediction({id:ledgerId,eventId:row.eventId,home:row.home,away:row.away,sport:row.sport,market:'1X2',selection:row.selection,probability:row.probability,fair:row.fair,odds:row.odds,edge:row.edge,mode:row.mode})}
  async function model(e,sport,ranks,summary){
    const c=e?.competitions?.[0],t=c?.competitors||[],h=t.find(x=>x.homeAway==='home'),a=t.find(x=>x.homeAway==='away');
    if(!h||!a||!window.VikaAIEngine||!window.VikaSignalEngine||completed(e))return null;
    const hr=rank(h)??ranks.get(String(h.team?.id)),ar=rank(a)??ranks.get(String(a.team?.id));if(hr!=null)h.rank=hr;if(ar!=null)a.rank=ar;
    const mode=eventMode(e);if(mode==='live'&&!['football','tennis'].includes(sport))return null;
    const stats=mode==='live'&&sport==='football'?liveStats(summary):null;
    const prediction=window.VikaAIEngine.calculate({sport,home:h,away:a,stats,mode});if(!prediction)return null;
    const boardOdds=odds(c.odds?.[0]||e.odds?.[0]),sumOdds=summaryOdds(summary),available={...boardOdds,...Object.fromEntries(Object.entries(sumOdds).filter(([,v])=>v!=null))},line=available[prediction.selection];
    const prePrediction=mode==='live'&&sport==='football'?window.VikaAIEngine.calculate({sport,home:h,away:a,mode:'prematch'}):null;
    const conflict=modelConflict(prediction,prePrediction,available,mode);
    const quality=Number(prediction.quality||0),readiness=mode==='live'&&sport==='football'?(quality>=3?3:quality>=2?2:1):(quality>=2?3:Math.min(2,quality+1));
    const signal=window.VikaSignalEngine.evaluate({prediction,odds:line,dataReadiness:readiness,quality,conflict,mode});
    const row={eventId:e.id,sport,mode,home:h.team?.displayName||'Home',away:a.team?.displayName||'Away',time:e.date,selection:prediction.selection,probability:prediction.probability,fair:prediction.fair,odds:line??null,edge:signal.edge??null,confidence:prediction.confidence,status:signal.status==='SIGNAL'?'SIGNAL':'WATCH',reason:signal.reason,modelReason:prediction.reason,conflict,liveStats:stats};
    if(row.status==='SIGNAL')logSignal(row);
    return row;
  }
  let state={rows:[],meta:{scanned:0,liveStats:0,settled:0}};
  function ensureControls(){
    const box=document.querySelector('#radarResults');if(!box||document.querySelector('#radarControls'))return;
    const controls=document.createElement('div');controls.id='radarControls';controls.className='radar-controls';controls.innerHTML='<button class="active" data-filter="all">Все</button><button data-filter="signal">🔥 SIGNAL</button><button data-filter="live">🔴 LIVE</button><button data-filter="value">Value</button><button data-filter="conflict">⚠️ Конфликт</button><select id="radarSort"><option value="edge">По Edge</option><option value="confidence">По уверенности</option><option value="odds">По кэфу</option><option value="time">По времени</option></select>';
    box.parentNode.insertBefore(controls,box);
    controls.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;controls.querySelectorAll('button').forEach(x=>x.classList.remove('active'));b.classList.add('active');renderState()});
    controls.querySelector('#radarSort').addEventListener('change',renderState);
  }
  function renderState(){
    const box=document.querySelector('#radarResults'),metaBox=document.querySelector('#radarMeta');if(!box)return;ensureControls();
    const filter=document.querySelector('#radarControls .active')?.dataset.filter||'all',sort=document.querySelector('#radarSort')?.value||'edge';
    let rows=state.rows.slice();
    if(filter==='signal')rows=rows.filter(x=>x.status==='SIGNAL');
    if(filter==='live')rows=rows.filter(x=>x.mode==='live');
    if(filter==='value')rows=rows.filter(x=>x.edge!=null&&x.edge>=0.03);
    if(filter==='conflict')rows=rows.filter(x=>x.conflict);
    rows.sort((a,b)=>sort==='confidence'?b.confidence-a.confidence:sort==='odds'?(b.odds??-999)-(a.odds??-999):sort==='time'?new Date(a.time)-new Date(b.time):(b.edge??-999)-(a.edge??-999));
    const signals=state.rows.filter(x=>x.status==='SIGNAL'),watch=state.rows.filter(x=>x.status==='WATCH'),conflicts=state.rows.filter(x=>x.conflict),bt=window.VikaBacktest?.summary?.();
    if(metaBox)metaBox.textContent=`Последний скан: ${new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})} · проверено ${state.meta.scanned} · LIVE stats ${state.meta.liveStats} · SIGNAL ${signals.length} · WATCH ${watch.length} · конфликт ${conflicts.length} · закрыто ${state.meta.settled}${bt?` · журнал ${bt.settled} закрыто / ${bt.open} открыто`:''}`;
    if(!rows.length){box.innerHTML='<div class="radar-empty">По выбранному фильтру сейчас ничего нет. Vika не заполняет список выдуманными сигналами.</div>';return}
    box.innerHTML=rows.slice(0,20).map(x=>{const edge=x.edge==null?'нет линии':`${x.edge>=0?'+':''}${(x.edge*100).toFixed(1)}%`;const q=x.selection==='home'?x.home:x.selection==='away'?x.away:'Ничья';const href=`match.html?sport=${encodeURIComponent(x.sport)}&eventId=${encodeURIComponent(x.eventId)}&home=${encodeURIComponent(x.home)}&away=${encodeURIComponent(x.away)}&mode=${encodeURIComponent(x.mode)}`;return `<article class="radar-row"><div><span class="radar-status ${x.status.toLowerCase()}">${x.status==='SIGNAL'?'🔥 SIGNAL':'👁 WATCH'}</span>${x.conflict?'<span class="radar-status watch">⚠️ КОНФЛИКТ МОДЕЛЕЙ</span> ':''}<b>${x.home} · ${x.away}</b><small>${q} · ${LABEL[x.sport]||x.sport} · ${x.mode==='live'?'LIVE':'PREMATCH'}${x.liveStats?' · live stats':''}</small></div><div class="radar-metrics"><span>AI <b>${x.probability.toFixed(1)}%</b></span><span>Fair <b>${x.fair.toFixed(2)}</b></span><span>Кэф <b>${x.odds==null?'—':x.odds.toFixed(2)}</b></span><span>Edge <b>${edge}</b></span><span>Conf <b>${x.confidence.toFixed(0)}%</b></span></div><a href="${href}">Открыть →</a></article>`}).join('');
  }
  function draw(rows,meta){state={rows,meta};renderState()}
  async function scan(){const sports=Object.keys(ESPN),meta={scanned:0,liveStats:0,settled:0},results=await Promise.all(sports.map(async sport=>{const events=await fetchSport(sport),ranks=await fetchRanks(sport);return Promise.all(events.map(async e=>{meta.scanned++;if(settleCompleted(e))meta.settled++;const live=eventMode(e)==='live'&&['football','tennis'].includes(sport),summary=live?await fetchSummary(sport,e.id):null;if(summary?.boxscore?.teams?.length)meta.liveStats++;return model(e,sport,ranks,summary)}))}));const rows=results.flat().filter(Boolean);rows.sort((a,b)=>(b.status==='SIGNAL')-(a.status==='SIGNAL')||(b.mode==='live')-(a.mode==='live')||(b.edge??-999)-(a.edge??-999)||b.confidence-a.confidence);draw(rows,meta);return rows}
  document.addEventListener('DOMContentLoaded',()=>{if(document.querySelector('#radarResults')){ensureControls();scan();setInterval(scan,120000)}});return{scan};
})();
