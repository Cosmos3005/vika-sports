const q=new URLSearchParams(location.search);
const $=s=>document.querySelector(s);
const text=k=>{const v=q.get(k);return v?decodeURIComponent(v):''};
const sport=text('sport')||'sport';
const eventId=text('eventId');
const source=text('source')||'';
const home=text('home')||'Команда 1';
const away=text('away')||'Команда 2';

function set(id,value){const el=$(id);if(el)el.textContent=value??'—'}
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function findStat(stats,names){const wanted=names.map(x=>x.toLowerCase());for(const s of stats||[]){const n=(s.name||s.label||s.displayName||'').toLowerCase();if(wanted.some(w=>n.includes(w)))return s.displayValue??s.value??'—'}return '—'}
function teamStats(summary){
 const box=summary?.boxscore?.teams||[];
 const out={home:{},away:{}};
 for(const t of box){const side=t.homeAway==='home'?'home':'away';out[side].team=t.team?.displayName||side;out[side].stats=t.statistics||[]}
 return out;
}
function renderStats(summary){
 const t=teamStats(summary);const hs=t.home.stats||[],as=t.away.stats||[];
 const rows=[
  ['Владение',findStat(hs,['possession']),findStat(as,['possession'])],
  ['Удары',findStat(hs,['shots']),findStat(as,['shots'])],
  ['Удары в створ',findStat(hs,['shots on target','shotsontarget']),findStat(as,['shots on target','shotsontarget'])],
  ['Угловые',findStat(hs,['corners']),findStat(as,['corners'])],
  ['Фолы',findStat(hs,['fouls']),findStat(as,['fouls'])]
 ];
 const target=$('#liveStats');if(!target)return;
 target.innerHTML=rows.map(r=>`<div class="data-row"><span>${esc(r[0])}</span><b>${esc(r[1])} · ${esc(r[2])}</b></div>`).join('');
 const has=rows.some(r=>r[1]!=='—'||r[2]!=='—');
 if(!has)target.innerHTML='<div class="data-row"><span>Расширенные данные</span><b>Источник пока не дал статистику</b></div>';
}
function renderLeaders(summary){
 const target=$('#keyPlayers');if(!target)return;
 const leaders=summary?.leaders||[];
 if(!leaders.length){target.innerHTML='<div class="data-row"><span>Ключевые игроки</span><b>Нет данных</b></div>';return}
 const items=[];
 for(const group of leaders.slice(0,5)){
   const cat=group.name||group.displayName||'Метрика';
   const leadersList=group.leaders||[];
   for(const x of leadersList.slice(0,2))items.push(`<div class="data-row"><span>${esc(cat)}</span><b>${esc(x.athlete?.displayName||'Игрок')} · ${esc(x.displayValue||x.value||'—')}</b></div>`);
 }
 target.innerHTML=items.length?items.join(''):'<div class="data-row"><span>Ключевые игроки</span><b>Нет данных</b></div>';
}
function renderOdds(summary){
 const odds=summary?.pickcenter?.odds||summary?.odds||[];const target=$('#marketData');if(!target)return;
 if(!odds.length){target.innerHTML='<div class="data-row"><span>Букмекерская линия</span><b>Не подключена</b></div><div class="data-row"><span>Fair / Edge</span><b>Vika не рассчитывает без независимой модели</b></div>';return}
 const o=odds[0];target.innerHTML=`<div class="data-row"><span>Линия</span><b>${esc(o.provider?.name||'Источник')}</b></div><div class="data-row"><span>Детали</span><b>${esc(JSON.stringify(o.overUnder||o.moneyline||{}))}</b></div>`;
}
function modelReadiness(summary){
 const hasId=!!eventId;const stats=(summary?.boxscore?.teams||[]).length>0;const odds=(summary?.pickcenter?.odds||summary?.odds||[]).length>0;const ready=[hasId,stats,odds].filter(Boolean).length;
 set('#dataReadiness',`${ready}/3`);
 set('#modelState',ready>=2?'DATA READY':'DATA BUILDING');
 set('#aiHeadline',ready>=2?'Данных достаточно для следующего расчётного слоя':'Сигнал не публикуем: независимых данных пока недостаточно');
 set('#aiText',ready>=2?'Vika получила идентификатор события и расширенные данные. Следующий слой может сравнивать статистические признаки, но вероятность не будет выдумана без проверенной модели и выборки.':'Сейчас есть реальное событие, но не полный набор признаков для честной вероятностной оценки. Vika фиксирует данные и ждёт дополнительные сигналы.');
 set('#aiDecision',ready>=2?'DATA READY · БЕЗ СИГНАЛА':'NO BET · DATA INCOMPLETE');
}
async function load(){
 set('#matchTitle',`${home} vs ${away}`);
 set('#matchMeta',`${sport.toUpperCase()} · ${text('status')||'PRE'} · ${source||'REAL DATA'}`);
 set('#matchLeague',text('league')||'VIKA SPORTS');
 set('#matchScore',text('score')||'– : –');
 set('#matchTime',text('time')||'—');
 set('#matchStatus',(text('status')||'REAL DATA').toUpperCase());
 if(!eventId||source!=='ESPN public'){
   modelReadiness(null);return;
 }
 try{
   const path={football:'soccer/eng.1',basketball:'basketball/nba',hockey:'hockey/nhl',tennis:'tennis/atp',mma:'mma/ufc'}[sport];
   if(!path)throw new Error('sport');
   const r=await fetch(`https://site.api.espn.com/apis/site/v2/sports/${path}/summary?event=${encodeURIComponent(eventId)}`,{cache:'no-store'});
   if(!r.ok)throw new Error(`HTTP ${r.status}`);
   const s=await r.json();
   const comp=s.header?.competitions?.[0];const teams=comp?.competitors||[];
   const h=teams.find(x=>x.homeAway==='home');const a=teams.find(x=>x.homeAway==='away');
   if(h&&a){set('#matchTitle',`${h.team?.displayName||home} vs ${a.team?.displayName||away}`);set('#matchScore',`${h.score??'0'} : ${a.score??'0'}`)}
   renderStats(s);renderLeaders(s);renderOdds(s);modelReadiness(s);
   const note=$('#sourceNote');if(note)note.textContent=`REAL DATA · ESPN summary · event ${eventId}`;
 }catch(err){
   set('#dataReadiness','1/3');set('#modelState','DATA FALLBACK');set('#aiHeadline','Источник детализации временно недоступен');set('#aiText','Базовые данные события сохранены. Vika не подменяет недоступную статистику выдуманными значениями.');set('#aiDecision','NO BET · SOURCE CHECK');
   const note=$('#sourceNote');if(note)note.textContent='REAL DATA · базовая карточка события';
 }
}

document.addEventListener('DOMContentLoaded',load);