const $ = id => document.getElementById(id);
const synth = window.speechSynthesis;
let index = 0, running = false, generation = 0, voices = [], activeCancel;
try { index = Math.max(0, Math.min(49, Number(localStorage.getItem('lesson')) || 0)); } catch {}
LESSONS.forEach(([en], i) => $('selection').add(new Option(`${i+1}. ${en}`, i)));
function render() {
 $('position').textContent = `${index+1} / ${LESSONS.length}`;
 $('progress').value = index+1;
 $('selection').value = index;
 $('english').textContent = 'まずは、耳で聞いてみましょう。';
 $('japanese').textContent = '';
 $('prev').disabled = index === 0;
 $('next').disabled = index === LESSONS.length-1;
 try { localStorage.setItem('lesson', index); } catch {}
}
function loadVoices() {
 voices = synth ? synth.getVoices() : [];
 for (const [id, lang] of [['enVoice','en'],['jaVoice','ja']]) {
  const select = $(id), previous = select.value;
  select.replaceChildren();
  const matches = voices.filter(v => v.lang.toLowerCase().startsWith(lang)).sort((a,b) => Number(b.localService)-Number(a.localService));
  for(const v of matches) select.add(new Option(`${v.name} (${v.localService?'端末内':'通信が必要な場合あり'})`, v.voiceURI));
  if(!matches.length) select.add(new Option('対応する音声がありません', ''));
  if(matches.some(v=>v.voiceURI===previous)) select.value = previous;
 }
 $('play').disabled = !synth || !$('enVoice').value || !$('jaVoice').value;
 if ($('play').disabled) $('status').textContent = '英語・日本語の音声が必要です。端末の音声設定と対応ブラウザを確認してください。';
}
function stop() {
 generation++; running = false;
 if(activeCancel) activeCancel();
 if(synth) synth.cancel();
 $('play').textContent = '練習を開始';
}
function speak(text, lang, rate, token) {
 return new Promise((resolve,reject) => {
  if(token !== generation) return resolve(false);
  const voice = voices.find(v=>v.voiceURI === $(lang==='en'?'enVoice':'jaVoice').value);
  if(!voice) return reject(new Error('対応する音声がありません。'));
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice; utterance.lang = voice.lang; utterance.rate = rate;
  let settled=false;
  const finish = (ok,error) => { if(settled)return; settled=true; activeCancel=null; error ? reject(error) : resolve(ok); };
  activeCancel = () => finish(false);
  utterance.onend = () => finish(token === generation);
  utterance.onerror = e => finish(false, token===generation?new Error(`読み上げを開始できませんでした（${e.error}）。音声設定を確認してください。`):null);
  synth.speak(utterance);
 });
}
async function play() {
 if(running) { stop(); $('phase').textContent='停止中'; $('status').textContent='再開すると、この例文の最初から練習します。'; return; }
 running=true; const token=++generation;
 $('play').textContent='停止';
 try {
  do {
   const [en,ja] = LESSONS[index], rate=Number($('rate').value);
   const stages=[{label:'聞く · 1/4',show:false,lang:'en',text:en,count:2,rate},{label:'ゆっくり · 2/4',show:true,lang:'en',text:en,count:1,rate:rate*.7},{label:'意味を確認 · 3/4',show:true,translation:true,lang:'ja',text:ja,count:1,rate:1},{label:'もう一度聞く · 4/4',show:true,lang:'en',text:en,count:2,rate}];
   for(const stage of stages) {
    $('english').textContent=stage.show?en:'まずは、耳で聞いてみましょう。';
    $('japanese').textContent=stage.translation?ja:'';
    $('phase').textContent=stage.label;
    for(let n=0;n<stage.count;n++) {
     $('status').textContent=`${stage.lang==='en'?'英語':'日本語'}を読み上げ中 · ${n+1}/${stage.count}回`;
     if(!await speak(stage.text,stage.lang,stage.rate,token)) return;
     await new Promise(resolve=>setTimeout(resolve,Number($('gap').value)));
     if(token!==generation) return;
    }
   }
   if(!$('auto').checked || index===LESSONS.length-1) break;
   index++; render();
  } while(token===generation);
  if(token===generation) { stop(); $('phase').textContent='完了'; $('status').textContent='この練習が終わりました。もう一度聞くこともできます。'; }
 } catch(error) { if(token===generation) { stop(); $('phase').textContent='音声エラー'; $('status').textContent=error.message; } }
}
function move(to) { stop(); index=to; render(); $('phase').textContent='準備できました'; $('status').textContent='開始すると、英文を隠して2回読み上げます。'; }
$('play').onclick=play;
$('prev').onclick=()=>move(Math.max(0,index-1));
$('next').onclick=()=>move(Math.min(LESSONS.length-1,index+1));
$('selection').onchange=()=>move(Number($('selection').value));
$('rate').oninput=()=>{$('rateValue').textContent=`${$('rate').value}倍`;};
if(synth) synth.onvoiceschanged=loadVoices;
render(); loadVoices();
if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').then(()=>navigator.serviceWorker.ready).then(()=>{$('connection').textContent='オフライン保存済み';}).catch(()=>{$('connection').textContent='オフライン保存不可';});
