const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function setup({auto=false,hold=false,recorded=false,missing=false}={}) {
 const elements={}, calls=[]; const requests=[];
 const get=id=>elements[id]??=( {value:'',textContent:'',checked:false,add(o){if(!this.value)this.value=o.value;},replaceChildren(){this.value='';}} );
 get('rate').value='0.9'; get('gap').value='0'; get('auto').checked=auto;
 const voices=[{lang:'en-US',name:'English',voiceURI:'en',localService:true},{lang:'ja-JP',name:'Japanese',voiceURI:'ja',localService:true}];
 const synth={getVoices:()=>voices,cancel(){},speak(u){calls.push({text:u.text,lang:u.lang,rate:u.rate,english:get('english').textContent,japanese:get('japanese').textContent});if(!hold)queueMicrotask(()=>u.onend());}};
 const context=vm.createContext({document:{getElementById:get},window:{speechSynthesis:synth},SpeechSynthesisUtterance:function(text){this.text=text;},Option:function(text,value){this.text=text;this.value=value;},localStorage:{getItem(){return null;},setItem(){}},navigator:{},setTimeout,console, AbortController, URL:{createObjectURL:()=>"blob:test",revokeObjectURL(){}},fetch:async url=>{requests.push(url);return {ok:!missing,blob:async()=>({})};},Audio:function(url){this.pause=()=>{};this.removeAttribute=()=>{};this.load=()=>{};this.play=()=>{if(!this.src?.startsWith('data:')) {calls.push({url:this.src || url,rate:this.playbackRate,english:get("english").textContent});if(!hold)queueMicrotask(()=>this.onended());}return Promise.resolve();};}});
 vm.runInContext(fs.readFileSync('data.js','utf8'),context); context.LESSONS=context.window.LESSONS;
 if(recorded) context.window.AUDIO_MANIFEST={lessons:Array.from({length:50},(_,i)=>({en:`${i}-en.mp3`,slow:`${i}-slow.mp3`,ja:`${i}-ja.mp3`}))};
 vm.runInContext(fs.readFileSync('app.js','utf8'),context);
 return {get,calls,context,requests};
}
test('50 lessons and exact six-utterance sequence with visibility and slow rate',async()=>{
 const {get,calls,context}=setup();
 assert.equal(context.LESSONS.length,50);
 await get('play').onclick();
 assert.equal(calls.length,6);
 assert.deepEqual(calls.map(c=>c.lang),['en-US','en-US','en-US','ja-JP','en-US','en-US']);
 assert.equal(calls[0].english,'まずは、耳で聞いてみましょう。');
 assert.equal(calls[1].english,calls[0].english);
 assert.equal(calls[2].english,context.LESSONS[0][0]);
 assert.ok(Math.abs(calls[2].rate-0.63)<1e-9);
 assert.equal(calls[3].text,context.LESSONS[0][1]);
 assert.equal(calls[3].japanese,context.LESSONS[0][1]);
 assert.equal(calls[4].japanese,'');
 assert.equal(get('phase').textContent,'完了');
});
test('stop cancels the sequence and selecting next starts its own lesson',async()=>{
 const {get,calls}=setup({hold:true});
 const pending=get('play').onclick();
 await get('play').onclick();
 await pending;
 assert.equal(calls.length,1);
 get('next').onclick();
 assert.equal(get('position').textContent,'2 / 50');
 assert.equal(get('english').textContent,'まずは、耳で聞いてみましょう。');
});
test('automatic progression stops at final lesson',async()=>{
 const {get,calls}=setup({auto:true});
 get('selection').value='48'; get('selection').onchange();
 await get('play').onclick();
 assert.equal(calls.length,12);
 assert.equal(get('position').textContent,'50 / 50');
 assert.equal(get('phase').textContent,'完了');
});

test('recorded audio follows all six steps without using device speech',async()=>{
 const {get,calls,requests}=setup({recorded:true});
 await get('play').onclick();
 assert.deepEqual(requests,['0-en.mp3','0-en.mp3','0-slow.mp3','0-ja.mp3','0-en.mp3','0-en.mp3']);
 assert.equal(calls.length,6);
 assert.ok(calls.every(c=>c.url==='blob:test'));
 assert.deepEqual(calls.map(c=>c.rate),[.9,.9,.9,1.5,.9,.9]);
 assert.equal(get('phase').textContent,'完了');
});
test('missing recorded file reports error without silent device speech fallback',async()=>{
 const {get,calls}=setup({recorded:true,missing:true});
 await get('play').onclick();
 assert.equal(calls.length,0);
 assert.equal(get('phase').textContent,'音声エラー');
});
test('recorded audio stops during playback',async()=>{
 const {get,calls}=setup({recorded:true,hold:true});
 const pending=get('play').onclick();
 await new Promise(resolve=>setImmediate(resolve));
 await get('play').onclick();await pending;
 assert.equal(calls.length,1);
 assert.equal(get('phase').textContent,'停止中');
});

test('random automatic playback visits every lesson once with its original six-step sequence',async()=>{
 const {get,requests}=setup({recorded:true,auto:true});
 get('random').checked=true;get('random').onchange();
 await get('play').onclick();
 assert.equal(requests.length,300);
 const visited=[];
 for(let i=0;i<requests.length;i+=6){
  const id=Number(requests[i].split('-')[0]);visited.push(id);
  assert.deepEqual(requests.slice(i,i+6),[`${id}-en.mp3`,`${id}-en.mp3`,`${id}-slow.mp3`,`${id}-ja.mp3`,`${id}-en.mp3`,`${id}-en.mp3`]);
 }
 assert.equal(new Set(visited).size,50);
 assert.equal(get('phase').textContent,'完了');
 assert.equal(get('next').disabled,true);
 // Starting again creates another complete round.
 await get('play').onclick();
 assert.equal(requests.length,600);
 assert.equal(new Set(requests.slice(300).filter((_,i)=>i%6===0)).size,50);
});
test('random navigation goes back to the same lesson; switching off restores numeric order',()=>{
 const {get}=setup();
 get('random').checked=true;get('random').onchange();
 const first=get('selection').value;
 get('next').onclick();const second=get('selection').value;
 assert.notEqual(first,second);
 get('prev').onclick();assert.equal(get('selection').value,first);
 get('random').checked=false;get('random').onchange();
 const before=Number(get('selection').value);
 if(before<49){get('next').onclick();assert.equal(get('selection').value,before+1);}
});
test('stopping random playback keeps the same lesson on restart',async()=>{
 const {get,requests}=setup({recorded:true,hold:true});
 get('random').checked=true;get('random').onchange();
 const pending=get('play').onclick();await new Promise(r=>setImmediate(r));
 await get('play').onclick();await pending;
 const pending2=get('play').onclick();await new Promise(r=>setImmediate(r));
 await get('play').onclick();await pending2;
 assert.equal(requests[0],requests[1]);
});
