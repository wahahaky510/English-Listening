const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
test('both published courses have complete matching audio assets',()=>{
 const context=vm.createContext({window:{}});
 for(const file of ['data.js','intermediate-data.js','audio-manifest.js','intermediate-audio-manifest.js']) vm.runInContext(fs.readFileSync(file,'utf8'),context);
 for(const [data,manifest,count] of [[context.window.LESSONS,context.window.AUDIO_MANIFEST,50],[context.window.INTERMEDIATE_LESSONS,context.window.INTERMEDIATE_AUDIO_MANIFEST,100]]) {
  assert.equal(data.length,count);assert.equal(manifest.lessons.length,count);
  assert.equal(manifest.voices.ja,'shimmer');
  assert.equal(new Set(data.map(pair=>pair[0])).size,count);
  for(let i=0;i<count;i++) {
   assert.ok(data[i].every(text=>typeof text==='string' && text.trim()));
   for(const kind of ['en','slow','ja']) {
    const path=manifest.lessons[i][kind];
    assert.match(path,/^audio\/[a-zA-Z0-9-]+\.mp3$/);
    assert.ok(fs.statSync(path).size>0,`${path} is missing or empty`);
   }
  }
 }
});
