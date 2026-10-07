const $ = id => document.getElementById(id);
const synth = window.speechSynthesis;
const courses=[{id:'daily',name:'日常英語・初中級／50文',lessons:LESSONS,audio:window.AUDIO_MANIFEST}];
if(window.INTERMEDIATE_LESSONS) courses.push({id:'intermediate',name:'日常英語・中級／100文',lessons:window.INTERMEDIATE_LESSONS,audio:window.INTERMEDIATE_AUDIO_MANIFEST});
let course=courses[0], currentLessons=course.lessons, currentAudio=course.audio;
let recorded=currentAudio?.lessons?.length===currentLessons.length;
try {course=courses.find(c=>c.id===localStorage.getItem('course')) || course;} catch {}
currentLessons=course.lessons;currentAudio=course.audio;recorded=currentAudio?.lessons?.length===currentLessons.length;
courses.forEach(c=>$('course').add(new Option(c.name,c.id)));
$('course').value=course.id;
let index = 0, running = false, generation = 0, voices = [], activeCancel, recordedPlayer;
try { index = Math.max(0, Math.min(currentLessons.length-1, Number(localStorage.getItem(course.id==='daily'?'lesson':'lesson:'+course.id)) || 0)); } catch {}
let order=Array.from({length:currentLessons.length},(_,i)=>i), cursor=index, roundComplete=false;
function shuffleOrder() {
 order=Array.from({length:currentLessons.length},(_,i)=>i);
 if($('random').checked) {
  for(let i=order.length-1;i>0;i--) {const j=Math.floor(Math.random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
  cursor=0; index=order[0];
 } else cursor=index;
 roundComplete=false;
}
function fillSelection() {
 $('selection').replaceChildren();
 currentLessons.forEach(([en],i)=>$('selection').add(new Option(`${i+1}. ${en}`,i)));
 $('progress').max=currentLessons.length;
}
fillSelection();
function render() {
 $('position').textContent = $('random').checked ? `${cursor+1} / ${currentLessons.length} · 例文 ${index+1}` : `${index+1} / ${currentLessons.length}`;
 $('progress').value = cursor+1;
 $('selection').value = index;
 $('english').textContent = 'まずは、耳で聞いてみましょう。';
 $('japanese').textContent = '';
 $('prev').disabled = cursor === 0;
 $('next').disabled = cursor === order.length-1;
 try { localStorage.setItem(course.id==='daily'?'lesson':'lesson:'+course.id, index);localStorage.setItem('course',course.id); } catch {}
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
 if(recorded) {
  $('enVoice').replaceChildren(); $('enVoice').add(new Option('OpenAI · Coral（AI生成音声）','recorded'));
  $('jaVoice').replaceChildren(); $('jaVoice').add(new Option(`OpenAI · ${currentAudio.voices?.ja || currentAudio.voice || 'coral'}（日本語・AI生成音声）`,'recorded'));
  $('enVoice').disabled=true; $('jaVoice').disabled=true; $('play').disabled=false; return;
 }
 $('enVoice').disabled=false; $('jaVoice').disabled=false;
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
async function playRecording(kind, rate, token) {
 const controller=new AbortController();
 activeCancel=()=>controller.abort();
 let url;
 try {
  const response=await fetch(currentAudio.lessons[index][kind],{signal:controller.signal});
  if(!response.ok) throw new Error(response.status===404 ? '音声ファイルが見つかりません。ページを再読み込みして、もう一度開始してください。' : '音声を読み込めませんでした。通信状態を確認してください。');
  const blob=await response.blob();
  if(token!==generation) return false;
  url=URL.createObjectURL(blob);
  return await new Promise((resolve,reject) => {
   const audio=recordedPlayer || new Audio();
   audio.src=url;
   audio.playbackRate=rate;
   let settled=false;
   const finish=(ok,error)=>{if(settled)return;settled=true;activeCancel=null;audio.pause();audio.removeAttribute('src');audio.load();error?reject(error):resolve(ok);};
   activeCancel=()=>finish(false);
   audio.onended=()=>finish(token===generation);
   audio.onerror=()=>finish(false,new Error('保存音声を再生できませんでした。'));
   audio.play().catch(()=>finish(false,new Error('音声の再生ができませんでした。もう一度「練習を開始」を押してください。')));
  });
 } catch(error) {
  if(token!==generation) return false;
  throw error;
 } finally {
  if(url) URL.revokeObjectURL(url);
  if(token===generation) activeCancel=null;
 }
}
async function play() {
 if(running) { stop(); $('phase').textContent='停止中'; $('status').textContent='再開すると、この例文の最初から練習します。'; return; }
 if($('random').checked && roundComplete) {shuffleOrder();render();}
 running=true; const token=++generation;
 $('play').textContent='停止';
 try {
  if(recorded) {
   recordedPlayer ||= new Audio();
   recordedPlayer.src='data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';
   // Start this same player during the click, before any network await.
   await recordedPlayer.play();
   recordedPlayer.pause();
   if(token!==generation) return;
  }
  do {
   const [en,ja] = currentLessons[index], rate=Number($('rate').value);
   const stages=[{label:'聞く · 1/4',show:false,lang:'en',text:en,count:2,rate},{label:'ゆっくり · 2/4',show:true,lang:'en',text:en,count:1,rate:rate*.7},{label:'意味を確認 · 3/4',show:true,translation:true,lang:'ja',text:ja,count:1,rate:1.5},{label:'もう一度聞く · 4/4',show:true,lang:'en',text:en,count:2,rate}];
   for(const stage of stages) {
    $('english').textContent=stage.show?en:'まずは、耳で聞いてみましょう。';
    $('japanese').textContent=stage.translation?ja:'';
    $('phase').textContent=stage.label;
    for(let n=0;n<stage.count;n++) {
     $('status').textContent=`${stage.lang==='en'?'英語':'日本語'}を読み上げ中 · ${n+1}/${stage.count}回`;
     const ok = recorded ? await playRecording(stage.lang==='ja'?'ja':stage.rate===rate*.7?'slow':'en',stage.lang==='ja'?stage.rate:rate,token) : await speak(stage.text,stage.lang,stage.rate,token);
     if(!ok) return;
     await new Promise(resolve=>setTimeout(resolve,Number($('gap').value)));
     if(token!==generation) return;
    }
   }
   if(cursor===order.length-1) {roundComplete=true;break;}
   if(!$('auto').checked) break;
   cursor++; index=order[cursor]; render();
  } while(token===generation);
  if(token===generation) { stop(); $('phase').textContent='完了'; $('status').textContent='この練習が終わりました。もう一度聞くこともできます。'; }
 } catch(error) { if(token===generation) { stop(); $('phase').textContent='音声エラー'; $('status').textContent=error.name==='NotAllowedError' ? 'ブラウザが音声再生をブロックしました。このサイトのサウンドを許可して、もう一度開始してください。' : error.message; } }
}
function move(to) { stop(); index=to; cursor=order.indexOf(to); roundComplete=false; render(); $('phase').textContent='準備できました'; $('status').textContent='開始すると、英文を隠して2回読み上げます。'; }
$('course').onchange=()=>{
 stop();course=courses.find(c=>c.id===$('course').value) || courses[0];
 currentLessons=course.lessons;currentAudio=course.audio;recorded=currentAudio?.lessons?.length===currentLessons.length;
 index=0;try {index=Math.max(0,Math.min(currentLessons.length-1,Number(localStorage.getItem(course.id==='daily'?'lesson':'lesson:'+course.id))||0));}catch{}
 fillSelection();shuffleOrder();render();loadVoices();
 $('phase').textContent='準備できました';$('status').textContent='開始すると、英文を隠して2回読み上げます。';
};
$('play').onclick=play;
$('prev').onclick=()=>move(order[Math.max(0,cursor-1)]);
$('next').onclick=()=>move(order[Math.min(order.length-1,cursor+1)]);
$('random').onchange=()=>{stop();shuffleOrder();render();$('phase').textContent='準備できました';$('status').textContent=$('random').checked?'ランダム順で全例文を1回ずつ練習します。':'例文の番号順で練習します。';};
$('selection').onchange=()=>move(Number($('selection').value));
$('rate').oninput=()=>{$('rateValue').textContent=`${$('rate').value}倍`;};
if(synth) synth.onvoiceschanged=loadVoices;
render(); loadVoices();
if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js', {updateViaCache:'none'}).then(()=>navigator.serviceWorker.ready).then(()=>{$('connection').textContent=recorded?'AI音声・再生分を保存':'アプリ保存済み';}).catch(()=>{$('connection').textContent='オフライン保存不可';});
