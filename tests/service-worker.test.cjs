const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
async function request(path,{offline=false}={}){
 const handlers={}, saved=[];
 const old={tag:'old'};
 const fresh={tag:'new',status:200,ok:true,clone(){return this;}};
 const context=vm.createContext({URL,self:{location:{origin:'https://example.com'},addEventListener:(type,fn)=>handlers[type]=fn},caches:{open:async()=>({match:async()=>old,put:async(req,res)=>saved.push(res)})},fetch:async()=>{if(offline)throw Error('offline');return fresh;}});
 vm.runInContext(fs.readFileSync('sw.js','utf8'),context);
 let result;
 handlers.fetch({request:{method:'GET',url:'https://example.com/'+path,headers:{has:()=>false}},respondWith(value){result=value;}});
 return {response:await result,saved};
}
test('online manifest replaces old cached manifest',async()=>{const r=await request('audio-manifest.js');assert.equal(r.response.tag,'new');assert.equal(r.saved.length,1);});
test('offline manifest falls back to retained cached manifest',async()=>{const r=await request('audio-manifest.js',{offline:true});assert.equal(r.response.tag,'old');});
test('immutable audio reuses cache without downloading again',async()=>{const r=await request('audio/01-en-hash.mp3');assert.equal(r.response.tag,'old');assert.equal(r.saved.length,0);});
