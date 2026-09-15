window.VikaBacktest=(function(){
  const KEY='vika_sports_prediction_ledger_v2';
  const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch{return[]}};
  const write=x=>localStorage.setItem(KEY,JSON.stringify(x));
  const clean=x=>String(x??'').trim().toLowerCase();
  function addPrediction(p){const a=read(),id=p.id||`${Date.now()}-${Math.random().toString(36).slice(2,7)}`;const duplicate=a.find(x=>x.id===id);if(duplicate)return duplicate;const row={id,createdAt:new Date().toISOString(),eventId:p.eventId??null,sport:p.sport??'sport',home:p.home??null,away:p.away??null,selection:p.selection??null,probability:Number(p.probability),fair:p.fair??null,odds:p.odds??null,edge:p.edge??null,mode:p.mode??'prematch',status:'OPEN',result:null,won:null,finalScore:null,settledAt:null};a.push(row);write(a);return row}
  function settle(id,result,finalScore){const a=read(),i=a.findIndex(x=>x.id===id);if(i<0)return null;const x=a[i];if(x.status==='SETTLED')return x;x.status='SETTLED';x.result=result;x.won=clean(x.selection)===clean(result);x.finalScore=finalScore??null;x.settledAt=new Date().toISOString();write(a);return x}
  function settleEvent(eventId,result,finalScore){const a=read(),ids=[];for(const x of a){if(String(x.eventId??'')===String(eventId)&&x.status==='OPEN'){settle(x.id,result,finalScore);ids.push(x.id)}}return ids}
  function settleFromScore(eventId,homeScore,awayScore,finalScore){const h=Number(homeScore),a=Number(awayScore);if(!Number.isFinite(h)||!Number.isFinite(a))return[];const result=h>a?'home':a>h?'away':'draw';return settleEvent(eventId,result,finalScore??`${h} : ${a}`)}
  function summary(){const a=read(),s=a.filter(x=>x.status==='SETTLED'),w=s.filter(x=>x.won).length,loss=s.length-w,od=s.filter(x=>Number.isFinite(Number(x.odds))&&Number(x.odds)>1),profit=od.reduce((z,x)=>z+(x.won?Number(x.odds)-1:-1),0),staked=od.length,roi=staked?profit/staked*100:null,avgOdds=od.length?od.reduce((z,x)=>z+Number(x.odds),0)/od.length:null;return{total:a.length,open:a.filter(x=>x.status==='OPEN').length,settled:s.length,wins:w,losses:loss,hitRate:s.length?w/s.length*100:null,avgOdds,roi,profit,brier:s.length?s.reduce((z,x)=>z+Math.pow(Number(x.probability)/100-(x.won?1:0),2),0)/s.length:null}}
  function clear(){write([])}
  return{read,addPrediction,settle,settleEvent,settleFromScore,summary,clear,KEY};
})();
