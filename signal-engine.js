window.VikaSignalEngine=(function(){
  const RULES={minEdge:0.03,minProbability:55,minConfidence:60,minReadiness:3,minQuality:2};
  function evaluate({prediction,odds,dataReadiness=0,quality=0,conflict=false,mode='prematch'}={}){
    if(!prediction)return{status:'NO_BET',label:'NO BET · NO MODEL',reason:'Нет результата VikaAI.'};
    if(!odds||!Number.isFinite(Number(odds)))return{status:'WATCH_NO_LINE',label:'WATCH · НЕТ ЛИНИИ',reason:'Нет независимого коэффициента. Без линии Vika не публикует value-сигнал.'};
    const o=Number(odds),edge=(Number(prediction.probability)/100*o)-1;
    if(Number(prediction.probability)<RULES.minProbability)return{status:'PASS_PROB',label:'PASS · НИЗКАЯ ВЕРОЯТНОСТЬ',reason:`Вероятность ${Number(prediction.probability).toFixed(1)}%, порог ${RULES.minProbability}%.`,edge};
    if(Number(prediction.confidence)<RULES.minConfidence)return{status:'PASS_CONF',label:'PASS · НИЗКАЯ УВЕРЕННОСТЬ',reason:`Confidence ${Number(prediction.confidence).toFixed(0)}%, порог ${RULES.minConfidence}%.`,edge};
    if(Number(dataReadiness)<RULES.minReadiness||Number(quality)<RULES.minQuality)return{status:'PASS_DATA',label:'NO BET · DATA QUALITY',reason:`Качество данных недостаточно: readiness ${dataReadiness}/3, quality ${quality}.`,edge};
    if(conflict)return{status:'BLOCK_CONFLICT',label:'⚠️ НЕ ВХОДИТЬ · КОНФЛИКТ МОДЕЛЕЙ',reason:'Статистические и контекстные модели расходятся. Сигнал заблокирован.',edge};
    if(edge<RULES.minEdge)return{status:'PASS_EDGE',label:'PASS · НЕТ VALUE',reason:`Edge ${edge>=0?'+':''}${(edge*100).toFixed(1)}%, нужен минимум +${(RULES.minEdge*100).toFixed(0)}%.`,edge};
    return{status:'SIGNAL',label:mode==='live'?'🔴 SIGNAL · LIVE VALUE':'🟢 SIGNAL · VALUE',reason:`Edge ${edge>=0?'+':''}${(edge*100).toFixed(1)}%, вероятность ${Number(prediction.probability).toFixed(1)}%, confidence ${Number(prediction.confidence).toFixed(0)}%.`,edge};
  }
  return{RULES,evaluate};
})();
