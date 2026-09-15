(function(){
  const ESPN={football:'soccer/eng.1',basketball:'basketball/nba',hockey:'hockey/nhl',tennis:'tennis/atp',mma:'mma/ufc'};
  const moneyToDecimal=v=>{const n=Number(v);if(!Number.isFinite(n))return null;return n>0?1+n/100:1+100/Math.abs(n)};
  const parseRecord=c=>{const list=Array.isArray(c?.records)?c.records:[c?.records||c?.record];for(const r of list){const s=String(r?.summary||r?.displayValue||'');const m=s.match(/(\d+)\s*[-:]\s*(\d+)/);if(m)return Number(m[1])/(Number(m[1])+Number(m[2]));}return null};
  const rankOf=c=>{const n=Number(c?.rank??c?.ranking?.rank);return Number.isFinite(n)?n:null};
  function calcFootball(home,away,odds){
    const hw=parseRecord(home),aw=parseRecord(away),hr=Number(home?.rank),ar=Number(away?.rank);const features=[];
    if(hw!=null&&aw!=null)features.push('form');if(Number.isFinite(hr)&&Number.isFinite(ar))features.push('ranking');
    if(features.length<2)return null;
    let score=(hw-aw)*2.6+(ar-hr)/20*.55+.22;
    const sig=x=>1/(1+Math.exp(-Math.max(-8,Math.min(8,x))));
    const h=Math.max(8,Math.min(86,sig(score)*100)),a=Math.max(8,Math.min(86,(1-sig(score))*100)),d=Math.max(9,Math.min(24,22-Math.abs(score)*3)),scale=100/(h+a+d);
    const p={home:h*scale,draw:d*scale,away:a*scale};const top=Object.entries(p).sort((x,y)=>y[1]-x[1])[0];const prob=top[1];const fair=100/prob;
    const odd=odds?.[top[0]]??null;const edge=odd?prob/100*odd-1:null;const confidence=Math.max(35,Math.min(88,44+features.length*6));
    let status='WATCH';if(odd&&edge>=.03&&prob>=55&&confidence>=60)status='SIGNAL';if(!odd)status='WATCH';
    return {selection:top[0],probability:prob,fair,odds:odd,edge,confidence,status,features};
  }
  function calcTennis(home,away){
    const hw=parseRecord(home),aw=parseRecord(away);if(hw==null||aw==null)return null;const score=(hw-aw)*3, p=1/(1+Math.exp(-Math.max(-8,Math.min(8,score))))*100;const prob=Math.max(10,Math.min(90,Math.max(p,100-p)));return {selection:p>=50?'home':'away',probability:prob,fair:100/prob,odds:null,edge:null,confidence:54,status:'WATCH',features:['form']};
  }
  async function load(sport){const path=ESPN[sport];if(!path)return new Map();try{const r=await fetch(`https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard`,{cache:'no-store'});if(!r.ok)return new Map();const d=await r.json();return new Map((d.events||[]).map(e=>[String(e.id),e]));}catch{return new Map()}}
  function decorate(card,e,sport){const c=e?.competitions?.[0],teams=c?.competitors||[];const home=teams.find(x=>x.homeAway==='home'),away=teams.find(x=>x.homeAway==='away');if(!home||!away)return;
    let odds={};const o=(c.odds||e.odds||[])[0];if(o?.moneyline){if(o.moneyline.home!=null)odds.home=moneyToDecimal(o.moneyline.home);if(o.moneyline.away!=null)odds.away=moneyToDecimal(o.moneyline.away);if(o.moneyline.draw!=null)odds.draw=moneyToDecimal(o.moneyline.draw)}
    const ai=sport==='football'?calcFootball(home,away,odds):sport==='tennis'?calcTennis(home,away):null;if(!ai)return;
    const row=card.querySelector('.chips');if(!row)return;const label=ai.status==='SIGNAL'?'🔥 SIGNAL':ai.status==='WATCH'?'👁 WATCH':'NO BET';const edge=ai.edge!=null?`<span class="value">Edge +${(ai.edge*100).toFixed(1)}%</span>`:'';row.innerHTML=`<span>VikaAI ${ai.probability.toFixed(1)}%</span><span>Fair <b>${ai.fair.toFixed(2)}</b></span><span>Confidence <b>${ai.confidence}%</b></span>${ai.odds?`<span>Кэф <b>${ai.odds.toFixed(2)}</b></span>`:''}${edge}<span class="vika-status ${ai.status.toLowerCase()}">${label}</span>`;
    card.dataset.confidence=ai.confidence;card.dataset.edge=ai.edge!=null?ai.edge*100:-999;
  }
  async function enhance(){const cards=[...document.querySelectorAll('.event')];if(!cards.length)return;const groups={};cards.forEach(card=>{const href=card.querySelector('a[href*="eventId="]')?.getAttribute('href')||'';const id=new URLSearchParams(href.split('?')[1]||'').get('eventId');const sport=new URLSearchParams(href.split('?')[1]||'').get('sport');if(id&&sport)groups[sport]??=[];if(id&&sport)groups[sport].push([id,card])});for(const sport of Object.keys(groups)){const map=await load(sport);groups[sport].forEach(([id,card])=>decorate(card,map.get(String(id)),sport));}}
  document.addEventListener('vika:data-loaded',()=>setTimeout(enhance,50));document.addEventListener('DOMContentLoaded',()=>setTimeout(enhance,500));window.VikaCards={enhance};
})();
