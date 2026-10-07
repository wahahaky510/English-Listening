const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function setup({auto=false,hold=false}={}) {
 const elements={}, calls=[];
 const get=id=>elements[id]??=( {value:'',textContent:'',checked:false,add(o){if(!this.value)this.value=o.value;},replaceChildren(){this.value='';}} );
 get('rate').value='0.9'; get('gap').value='0'; get('auto').checked=auto;
 const voices=[{lang:'en-US',name:'English',voiceURI:'en',localService:true},{lang:'ja-JP',name:'Japanese',voiceURI:'ja',localService:true}];
 const synth={getVoices:()=>voices,cancel(){},speak(u){calls.push({text:u.text,lang:u.lang,rate:u.rate,english:get('english').textContent,japanese:get('japanese').textContent});if(!hold)queueMicrotask(()=>u.onend());}};
 const context=vm.createContext({document:{getElementById:get},window:{speechSynthesis:synth},SpeechSynthesisUtterance:function(text){this.text=text;},Option:function(text,value){this.text=text;this.value=value;},localStorage:{getItem(){return null;},setItem(){}},navigator:{},setTimeout,console});
 vm.runInContext(fs.readFileSync('data.js','utf8'),context); context.LESSONS=context.window.LESSONS;
 vm.runInContext(fs.readFileSync('app.js','utf8'),context);
 return {get,calls,context};
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
