window.VikaAIEngine=(function(){
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  const num=v=>{const n=Number.parseFloat(String(v??'').replace(',','.').replace('%',''));return Number.isFinite(n)?n:null};
  const sigmoid=x=>1/(1+Math.exp(-clamp(x,-8,8)));
  const fair=p=>p>0?100/p:null;
  const implied=o=>o>1?100/o:null;
  const pct=(a,b)=>a!==null&&b!==null&&a+b!==0?(a-b)/(a+b):null;
  const scoreOf=(competitor)=>num(competitor?.score);
  const confidence=(base,quality,penalty=0)=>clamp(base+quality*6-penalty,35,88);

  function footballLive({home,away,stats,clock}){
    const sh=stats?.shots?.home??null, sa=stats?.shots?.away??null;
    const sth=stats?.shotsOnTarget?.home??null, sta=stats?.shotsOnTarget?.away??null;
    const ph=stats?.possession?.home??null, pa=stats?.possession?.away??null;
    const gh=scoreOf(home), ga=scoreOf(away);
    const haveScore=gh!==null&&ga!==null;
    const features=[];
    if(sh!==null&&sa!==null)features.push('shots');
    if(sth!==null&&sta!==null)features.push('shots_on_target');
    if(ph!==null&&pa!==null)features.push('possession');
    if(haveScore)features.push('score');
    if(features.length<3)return null;

    let edge=0;
    if(haveScore)edge+=clamp(gh-ga,-3,3)*1.05;
    if(sh!==null&&sa!==null)edge+=clamp((sh-sa)/6,-1.5,1.5)*0.55;
    if(sth!==null&&sta!==null)edge+=clamp((sth-sta)/3,-1.7,1.7)*0.9;
    if(ph!==null&&pa!==null)edge+=clamp((ph-pa)/18,-1.2,1.2)*0.25;
    edge=clamp(edge,-3.5,3.5);

    const homeWin=clamp(sigmoid(edge)*100,5,90);
    const awayWin=clamp((1-sigmoid(edge))*100,5,90);
    const tied=haveScore&&gh===ga;
    const draw=tied?clamp(22-Math.abs(edge)*2,10,24):clamp(16-Math.abs(edge)*1.5,7,16);
    const scale=100/(homeWin+awayWin+draw);
    const probs={home:homeWin*scale,draw:draw*scale,away:awayWin*scale};
    const entries=[['home',probs.home],['draw',probs.draw],['away',probs.away]].sort((a,b)=>b[1]-a[1]);
    const top=entries[0];
    return {sport:'football',selection:top[0],probability:top[1],probabilities:probs,fair:fair(top[1]),confidence:confidence(48,features.length,Math.abs(edge)<0.35?4:0),quality:features.length,features,experimental:true,reason:`Live-оценка: счёт ${gh}:${ga}, доступно признаков ${features.length}/4. Учтены счёт, удары, удары в створ и владение, только если они реально получены.`};
  }

  function tennisLive({home,away}){
    const hs=scoreOf(home), as=scoreOf(away);
    const hsets=Array.isArray(home?.linescores)?home.linescores.filter(x=>num(x?.value??x)!=null).map(x=>num(x?.value??x)):[];
    const asets=Array.isArray(away?.linescores)?away.linescores.filter(x=>num(x?.value??x)!=null).map(x=>num(x?.value??x)):[];
    if(hs===null||as===null)return null;
    const setDiff=hsets.filter((v,i)=>asets[i]!==undefined&&v>asets[i]).length-hsets.filter((v,i)=>asets[i]!==undefined&&v<asets[i]).length;
    const gameDiff=hs-as;
    const raw=clamp(setDiff*1.9+gameDiff*0.18,-4,4);
    const homeProb=clamp(sigmoid(raw)*100,8,92);
    const p=raw>=0?homeProb:100-homeProb;
    const selection=homeProb>=50?'home':'away';
    const quality=(hsets.length||asets.length)?2:1;
    return {sport:'tennis',selection,probability:p,fair:fair(p),confidence:confidence(42,quality,2),quality,features:['live_score',...(quality>1?['set_scores']:[])],experimental:true,reason:`Live-оценка по текущему счёту${quality>1?' и сетам':''}. Без рейтинга, формы, подачи и рыночной линии это только beta-слой, не финальный прогноз.`};
  }

  function calculate({sport,home,away,stats,clock}){
    if(sport==='football')return footballLive({home,away,stats,clock});
    if(sport==='tennis')return tennisLive({home,away});
    return null;
  }

  function edge(probability,odds){const o=num(odds);if(probability===null||o===null||o<=1)return null;return probability/100*o-1;}
  function label(selection,names){return selection==='home'?names.home:selection==='away'?names.away:'Ничья';}

  return {calculate,edge,fair,implied,label,num};
})();
