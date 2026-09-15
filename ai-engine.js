window.VikaAIEngine=(function(){
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  const num=v=>{const n=Number.parseFloat(String(v??'').replace(',','.').replace('%',''));return Number.isFinite(n)?n:null};
  const sigmoid=x=>1/(1+Math.exp(-clamp(x,-8,8)));
  const fair=p=>p>0?100/p:null;
  const implied=o=>o>1?100/o:null;
  const confidence=(base,quality,penalty=0)=>clamp(base+quality*6-penalty,35,88);
  const scoreOf=c=>num(c?.score);

  function footballLive({home,away,stats}){
    const sh=stats?.shots?.home??null,sa=stats?.shots?.away??null,sth=stats?.shotsOnTarget?.home??null,sta=stats?.shotsOnTarget?.away??null,ph=stats?.possession?.home??null,pa=stats?.possession?.away??null,gh=scoreOf(home),ga=scoreOf(away);
    const features=[];if(sh!==null&&sa!==null)features.push('shots');if(sth!==null&&sta!==null)features.push('shots_on_target');if(ph!==null&&pa!==null)features.push('possession');if(gh!==null&&ga!==null)features.push('score');
    if(features.length<3)return null;let edge=0;if(gh!==null&&ga!==null)edge+=clamp(gh-ga,-3,3)*1.05;if(sh!==null&&sa!==null)edge+=clamp((sh-sa)/6,-1.5,1.5)*.55;if(sth!==null&&sta!==null)edge+=clamp((sth-sta)/3,-1.7,1.7)*.9;if(ph!==null&&pa!==null)edge+=clamp((ph-pa)/18,-1.2,1.2)*.25;edge=clamp(edge,-3.5,3.5);
    const hw=clamp(sigmoid(edge)*100,5,90),aw=clamp((1-sigmoid(edge))*100,5,90),draw=(gh===ga?clamp(22-Math.abs(edge)*2,10,24):clamp(16-Math.abs(edge)*1.5,7,16)),scale=100/(hw+aw+draw),probs={home:hw*scale,draw:draw*scale,away:aw*scale};
    const top=Object.entries(probs).sort((a,b)=>b[1]-a[1])[0];return {sport:'football',selection:top[0],probability:top[1],probabilities:probs,fair:fair(top[1]),confidence:confidence(48,features.length,Math.abs(edge)<.35?4:0),quality:features.length,features,experimental:true,reason:`Live-оценка: счёт ${gh}:${ga}, признаки ${features.length}/4. Учтены только реально полученные показатели.`};
  }

  function parseRecord(c){
    const records=c?.records||c?.record||[];const list=Array.isArray(records)?records:[records];for(const r of list){const s=String(r?.summary||r?.displayValue||'');const m=s.match(/(\d+)\s*[-:]\s*(\d+)/);if(m){const w=Number(m[1]),l=Number(m[2]);if(w+l)return w/(w+l)}}return null;
  }
  function rankOf(c){return num(c?.rank??c?.ranking?.rank??c?.athlete?.rank)}
  function ratingOf(c){return num(c?.rating??c?.ratings?.[0]?.value??c?.powerRating)}

  function footballPrematch({home,away,odds}){
    const hw=parseRecord(home),aw=parseRecord(away),hr=ratingOf(home),ar=ratingOf(away),hRank=rankOf(home),aRank=rankOf(away);const features=[];if(hw!==null&&aw!==null)features.push('recent_record');if(hr!==null&&ar!==null)features.push('rating');if(hRank!==null&&aRank!==null)features.push('ranking');
    if(features.length<2)return null;let score=0;if(hw!==null&&aw!==null)score+=(hw-aw)*2.6;if(hr!==null&&ar!==null)score+=clamp((hr-ar)/10,-2,2)*.8;if(hRank!==null&&aRank!==null)score+=clamp((aRank-hRank)/20,-2,2)*.55;score+=.22;
    const homeRaw=clamp(sigmoid(score)*100,8,86),awayRaw=clamp((1-sigmoid(score))*100,8,86),drawRaw=clamp(22-Math.abs(score)*3,9,24),scale=100/(homeRaw+awayRaw+drawRaw),probs={home:homeRaw*scale,draw:drawRaw*scale,away:awayRaw*scale};const top=Object.entries(probs).sort((a,b)=>b[1]-a[1])[0];
    return {sport:'football',selection:top[0],probability:top[1],probabilities:probs,fair:fair(top[1]),confidence:confidence(44,features.length),quality:features.length,features,experimental:true,reason:`PREMATCH beta: использованы ${features.join(', ')}. Модель не считает сигнал готовым без достаточного набора независимых признаков.`};
  }

  function tennisLive({home,away}){
    const hs=scoreOf(home),as=scoreOf(away);if(hs===null||as===null)return null;const hsets=(home?.linescores||[]).map(x=>num(x?.value??x)).filter(v=>v!==null),asets=(away?.linescores||[]).map(x=>num(x?.value??x)).filter(v=>v!==null);const setDiff=hsets.filter((v,i)=>asets[i]!==undefined&&v>asets[i]).length-hsets.filter((v,i)=>asets[i]!==undefined&&v<asets[i]).length,raw=clamp(setDiff*1.9+(hs-as)*.18,-4,4),hp=clamp(sigmoid(raw)*100,8,92),selection=hp>=50?'home':'away',p=selection==='home'?hp:100-hp;return {sport:'tennis',selection,probability:p,fair:fair(p),confidence:confidence(42,hsets.length||asets.length?2:1,2),quality:hsets.length||asets.length?2:1,features:['live_score',...(hsets.length||asets.length?['set_scores']:[])],experimental:true,reason:`Live-оценка по счёту${hsets.length||asets.length?' и сетам':''}. Без рейтинга, формы, подачи и линии это beta-слой.`};
  }

  function tennisPrematch({home,away}){
    const hw=parseRecord(home),aw=parseRecord(away),hr=ratingOf(home),ar=ratingOf(away),hRank=rankOf(home),aRank=rankOf(away);const features=[];if(hw!==null&&aw!==null)features.push('recent_record');if(hr!==null&&ar!==null)features.push('rating');if(hRank!==null&&aRank!==null)features.push('ranking');if(features.length<2)return null;let score=0;if(hw!==null&&aw!==null)score+=(hw-aw)*3;if(hr!==null&&ar!==null)score+=clamp((hr-ar)/10,-2,2);if(hRank!==null&&aRank!==null)score+=clamp((aRank-hRank)/20,-2,2)*.7;const hp=clamp(sigmoid(score)*100,10,90),selection=hp>=50?'home':'away',p=selection==='home'?hp:100-hp;return {sport:'tennis',selection,probability:p,fair:fair(p),confidence:confidence(42,features.length,2),quality:features.length,features,experimental:true,reason:`PREMATCH beta: ${features.join(', ')}. Подача, покрытие, H2H и качество соперников пока не загружены, поэтому сигнал не считается production-ready.`};
  }

  function calculate({sport,home,away,stats,mode='live',odds}){if(sport==='football')return mode==='prematch'?footballPrematch({home,away,odds}):footballLive({home,away,stats});if(sport==='tennis')return mode==='prematch'?tennisPrematch({home,away}):tennisLive({home,away});return null}
  function edge(probability,odds){const o=num(odds);return probability!==null&&o!==null&&o>1?probability/100*o-1:null}
  function label(selection,names){return selection==='home'?names.home:selection==='away'?names.away:'Ничья'}
  function settle(prediction,result){if(!prediction||!result)return null;const won=prediction.selection===result;return {...prediction,result,won,brier:Math.pow(prediction.probability/100-(won?1:0),2)}}
  function summarize(items){const a=(items||[]).filter(Boolean),n=a.length,w=a.filter(x=>x.won).length;return {count:n,wins:w,losses:n-w,hitRate:n?w/n*100:null,brier:n?a.reduce((s,x)=>s+x.brier,0)/n:null}}
  function calibration(items){const buckets=[0,1,2,3,4].map(i=>({range:`${50+i*10}-${60+i*10}%`,count:0,wins:0}));for(const x of items||[]){const i=clamp(Math.floor((x.probability-50)/10),0,4);if(x.probability>=50){buckets[i].count++;if(x.won)buckets[i].wins++}}return buckets.map(b=>({...b,actual:b.count?b.wins/b.count*100:null}))}
  return {calculate,edge,fair,implied, label, num, settle, summarize, calibration};
})();
