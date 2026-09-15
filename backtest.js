window.VikaBacktest=(function(){
  const KEY='vika_sports_prediction_ledger_v1';
  const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch{return[]}};
  const write=x=>localStorage.setItem(KEY,JSON.stringify(x));
  function addPrediction(p){const a=read();const id=p.id||`${Date.now()}-${Math.random().toString(36).slice(2,7)}`;const duplicate=a.find(x=>x.id===id);if(duplicate)return duplicate;const row={id,createdAt:new Date().toISOString(),sport:p.sport,selection:p.selection,probability:Number(p.probability),fair:p.fair??null,odds:p.odds??null,edge:p.edge??null,mode:p.mode??'prematch',status:'OPEN',result:null,won:null};a.push(row);write(a);return row}
  function settle(id,result){const a=read(),i=a.findIndex(x=>x.id===id);if(i<0)return null;const x=a[i];x.status='SETTLED';x.result=result;x.won=x.selection===result;write(a);return x}
  function summary(){const a=read(),s=a.filter(x=>x.status==='SETTLED'),w=s.filter(x=>x.won).length;return{total:a.length,open:a.filter(x=>x.status==='OPEN').length,settled:s.length,wins:w,losses:s.length-w,hitRate:s.length?w/s.length*100:null,brier:s.length?s.reduce((z,x)=>z+Math.pow(x.probability/100-(x.won?1:0),2),0)/s.length:null}}
  function clear(){write([])}
  return{read,addPrediction,settle,summary,clear,KEY};
})();
