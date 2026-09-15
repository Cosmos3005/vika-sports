const q=new URLSearchParams(location.search);
const $=s=>document.querySelector(s);
const text=k=>q.get(k)||'';
const sport=text('sport')||'sport';
const eventId=text('eventId');
const source=text('source')||'';
const homeName=text('home')||'Команда 1';
const awayName=text('away')||'Команда 2';

function set(id,value){const el=$(id);if(el)el.textContent=value??'—'}
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function num(v){const n=Number.parseFloat(String(v??'').replace(',','.').replace('%',''));return Number.isFinite(n)?n:null}
function findStat(stats,names){const wanted=names.map(x=>x.toLowerCase());for(const s of stats||[]){const n=(s.name||s.label||s.displayName||'').toLowerCase();if(wanted.some(w=>n.includes(w)))return s.displayValue??s.value??'—'}return '—'}
function numericStat(stats,names){return num(findStat(stats,names))}

function teamStats(summary){
  const box=summary?.boxscore?.teams||[];
  const out={home:{},away:{}};
  for(const t of box){const side=t.homeAway==='home'?'home':'away';out[side].team=t.team?.displayName||side;out[side].stats=t.statistics||[]}
  return out;
}

function getCompetitors(summary){
  return summary?.header?.competitions?.[0]?.competitors||[];
}

function renderStats(summary){
  const t=teamStats(summary),hs=t.home.stats||[],as=t.away.stats||[];
  const rows=[
    ['Владение',findStat(hs,['possession']),findStat(as,['possession'])],
    ['Удары',findStat(hs,['shots']),findStat(as,['shots'])],
    ['Удары в створ',findStat(hs,['shots on target','shotsontarget']),findStat(as,['shots on target','shotsontarget'])],
    ['Угловые',findStat(hs,['corners']),findStat(as,['corners'])],
    ['Фолы',findStat(hs,['fouls']) ,findStat(as,['fouls'])]
  ];
  const target=$('#liveStats');
  if(!target)return rows;
  target.innerHTML=rows.map(r=>`<div class="data-row"><span>${esc(r[0])}</span><b>${esc(r[1])} · ${esc(r[2])}</b></div>`).join('');
  if(!rows.some(r=>r[1]!=='—'||r[2]!=='—'))target.innerHTML='<div class="data-row"><span>Расширенные данные</span><b>Источник пока не дал статистику</b></div>';
  return rows;
}

function renderLeaders(summary){
  const target=$('#keyPlayers');if(!target)return;
  const leaders=summary?.leaders||[];
  if(!leaders.length){target.innerHTML='<div class="data-row"><span>Ключевые игроки</span><b>Нет данных</b></div>';return}
  const items=[];
  for(const group of leaders.slice(0,5)){
    const cat=group.name||group.displayName||'Метрика';
    for(const x of (group.leaders||[]).slice(0,2))items.push(`<div class="data-row"><span>${esc(cat)}</span><b>${esc(x.athlete?.displayName||'Игрок')} · ${esc(x.displayValue||x.value||'—')}</b></div>`);
  }
  target.innerHTML=items.length?items.join(''):'<div class="data-row"><span>Ключевые игроки</span><b>Нет данных</b></div>';
}

function findDecimalOdds(value){
  if(value===null||value===undefined)return null;
  if(typeof value==='number'&&value>1&&value<100)return value;
  if(typeof value==='string'){
    const m=value.match(/(?:^|\s)([1-9]\d*(?:[\.,]\d{1,2})?)(?:\s|$)/);if(m){const n=num(m[1]);if(n>1&&n<100)return n;}
  }
  return null;
}

function extractOdds(summary){
  const roots=[summary?.pickcenter?.odds,summary?.odds,summary?.header?.competitions?.[0]?.odds].filter(Boolean).flat();
  for(const root of roots){
    const candidates=[root.moneyline?.home,root.moneyline?.away,root.homeTeamOdds?.moneyLine,root.awayTeamOdds?.moneyLine,root.homeTeamOdds?.price,root.awayTeamOdds?.price,root.homeOdds,root.awayOdds,root.price].map(findDecimalOdds).filter(Boolean);
    if(candidates.length)return candidates[0];
  }
  return null;
}

function renderOdds(summary){
  const odds=extractOdds(summary),target=$('#marketData');if(!target)return null;
  if(!odds){target.innerHTML='<div class="data-row"><span>Букмекерская линия</span><b>Не подключена</b></div><div class="data-row"><span>Fair / Edge</span><b>Будет после независимой линии</b></div>';return null}
  target.innerHTML=`<div class="data-row"><span>Коэффициент</span><b>${odds.toFixed(2)}</b></div><div class="data-row"><span>Линия</span><b>Получена из данных события</b></div>`;
  return odds;
}

function buildFeatureStats(summary){
  const t=teamStats(summary),hs=t.home.stats||[],as=t.away.stats||[];
  return {
    shots:{home:numericStat(hs,['shots']),away:numericStat(as,['shots'])},
    shotsOnTarget:{home:numericStat(hs,['shots on target','shotsontarget']),away:numericStat(as,['shots on target','shotsontarget'])},
    possession:{home:numericStat(hs,['possession']),away:numericStat(as,['possession'])}
  };
}

function modelReadiness(summary,features){
  const hasId=!!eventId,hasStats=!!(summary?.boxscore?.teams||[]).length;
  const hasFeatureSet=sport==='football'
    ? [features?.shots,features?.shotsOnTarget,features?.possession].filter(x=>x?.home!==null&&x?.away!==null).length>=2
    : !!summary?.header?.competitions?.[0]?.competitors?.every(x=>num(x.score)!==null);
  const ready=[hasId,hasStats,hasFeatureSet].filter(Boolean).length;
  set('#dataReadiness',`${ready}/3`);
  return {hasId,hasStats,hasFeatureSet,ready};
}

function applyModel(summary,features){
  if(!window.VikaAIEngine){set('#modelState','ENGINE ERROR');set('#aiHeadline','Модуль VikaAI не загружен');set('#aiDecision','NO BET · ENGINE');return;}
  const competitors=getCompetitors(summary),h=competitors.find(x=>x.homeAway==='home'),a=competitors.find(x=>x.homeAway==='away');
  if(!h||!a){set('#modelState','DATA BUILDING');set('#aiHeadline','Нет полной пары участников');set('#aiDecision','NO BET · DATA INCOMPLETE');return;}
  const result=window.VikaAIEngine.calculate({sport,home:h,away:a,stats:features});
  if(!result){set('#modelState','DATA BUILDING');set('#aiProbability','—');set('#fairOdds','—');set('#edge','—');set('#confidence','—');set('#aiHeadline','Недостаточно признаков для честной оценки');set('#aiText','Vika не заполняет пропуски выдуманными данными. Для beta-модели нужен реальный счёт и достаточный набор текущих признаков.');set('#aiDecision','NO BET · DATA INCOMPLETE');return;}
  const selection=result.selection;
  const selectedName=window.VikaAIEngine.label(selection,{home:h.team?.displayName||homeName,away:a.team?.displayName||awayName});
  set('#modelState','BETA MODEL · LIVE');
  set('#aiProbability',`${result.probability.toFixed(1)}%`);
  set('#fairOdds',result.fair?result.fair.toFixed(2):'—');
  const odds=extractOdds(summary),edge=window.VikaAIEngine.edge(result.probability,odds);
  set('#edge',edge===null?'—':`${edge>=0?'+':''}${(edge*100).toFixed(1)}%`);
  set('#confidence',`${result.confidence.toFixed(0)}%`);
  set('#aiHeadline',`Модель склоняется к: ${selectedName}`);
  set('#aiText',result.reason);
  set('#modelReason',`Признаков: ${result.quality} · ${result.features.join(', ')} · вероятность не откалибрована на историческом backtest.`);
  set('#aiDecision',edge!==null&&edge>=0.03?'WATCH · VALUE КАНДИДАТ':'WATCH · НЕ ПУБЛИКОВАТЬ СТАВКУ');
}

async function load(){
  set('#matchTitle',`${homeName} vs ${awayName}`);
  set('#matchMeta',`${sport.toUpperCase()} · ${text('status')||'PRE'} · ${source||'REAL DATA'}`);
  set('#matchLeague',text('league')||'VIKA SPORTS');
  set('#matchScore',text('score')||'– : –');
  set('#matchTime',text('time')||'—');
  set('#matchStatus',(text('status')||'REAL DATA').toUpperCase());
  if(!eventId||source!=='ESPN public'){set('#dataReadiness','0/3');set('#modelState','DATA BUILDING');set('#aiHeadline','Сигнал пока не строим');set('#aiText','У события нет идентификатора детализации из реального источника. Vika ждёт полноценные данные матча.');set('#aiDecision','NO BET · DATA INCOMPLETE');return;}
  try{
    const path={football:'soccer/eng.1',basketball:'basketball/nba',hockey:'hockey/nhl',tennis:'tennis/atp',mma:'mma/ufc'}[sport];
    if(!path)throw new Error('unsupported sport');
    const r=await fetch(`https://site.api.espn.com/apis/site/v2/sports/${path}/summary?event=${encodeURIComponent(eventId)}`,{cache:'no-store'});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    const s=await r.json();
    const competitors=getCompetitors(s),h=competitors.find(x=>x.homeAway==='home'),a=competitors.find(x=>x.homeAway==='away');
    if(h&&a){set('#matchTitle',`${h.team?.displayName||homeName} vs ${a.team?.displayName||awayName}`);set('#matchScore',`${h.score??'0'} : ${a.score??'0'}`)}
    const rows=renderStats(s);renderLeaders(s);renderOdds(s);
    const features=buildFeatureStats(s);const readiness=modelReadiness(s,features);
    if(readiness.ready<3){set('#aiHeadline','Сигнал не публикуем: данных пока мало');set('#aiText','Событие подтверждено, но beta-модель ждёт полный набор реальных признаков.');set('#aiDecision','NO BET · DATA INCOMPLETE');}
    applyModel(s,features);
    const note=$('#sourceNote');if(note)note.textContent=`REAL DATA · ESPN summary · event ${eventId}`;
  }catch(err){
    set('#dataReadiness','1/3');set('#modelState','DATA FALLBACK');set('#aiHeadline','Источник детализации временно недоступен');set('#aiText','Базовые данные события сохранены. Vika не подменяет недоступную статистику выдуманными значениями.');set('#aiDecision','NO BET · SOURCE CHECK');
    const note=$('#sourceNote');if(note)note.textContent='REAL DATA · базовая карточка события';
  }
}

document.addEventListener('DOMContentLoaded',load);