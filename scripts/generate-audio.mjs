import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ctx=vm.createContext({window:{}});
vm.runInContext(await fs.readFile(path.join(root,'data.js'),'utf8'),ctx);
const lessons=ctx.window.LESSONS;
const args=process.argv.slice(2);
const dry=args.includes('--dry-run');
const all=args.includes('--all');
const model='gpt-4o-mini-tts', voice='coral';
const settings=[['en',0,'Speak in natural conversational American English, with warm, clear delivery. Read only the supplied sentence.'],['slow',0,'Speak in natural American English, slowly and clearly for a language learner. Keep natural word connections and intonation. Do not spell words or add explanations. Read only the supplied sentence.'],['ja',1,'Speak in natural Japanese, with clear, warm conversational delivery. Read only the supplied sentence.']];
const key=process.env.LISTENING_TTS_API_KEY || process.env.OPENAI_API_KEY;
if(!dry && !key) {console.error('Missing LISTENING_TTS_API_KEY. Set it securely; never put it in repository files.');process.exit(1);}
await fs.mkdir(path.join(root,'audio'),{recursive:true});
const records=[];
for(let i=0;i<lessons.length;i++) {
 const record={};
 for(const [kind,column,instructions] of settings) {
  const body={model,voice,input:lessons[i][column],instructions,response_format:'mp3'};
  const hash=crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
  const relative=`audio/${String(i+1).padStart(2,'0')}-${kind}-${hash.slice(0,12)}.mp3`;
  const destination=path.join(root,relative), stamp=destination+'.sha256';
  record[kind]=relative;
  if(dry) continue;
  if(!all && i>0) continue;
  let valid=false;
  try {valid=(await fs.readFile(stamp,'utf8'))===hash && (await fs.stat(destination)).size>0;} catch{}
  if(valid) {console.log(`Reuse ${relative}`);continue;}
  const response=await fetch('https://api.openai.com/v1/audio/speech',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(120000)});
  if(!response.ok) {console.error(`Audio generation failed: HTTP ${response.status}. Check API billing, permissions, and connectivity. No manifest was published.`);process.exit(1);}
  const buffer=Buffer.from(await response.arrayBuffer());
  if(!buffer.length || !response.headers.get('content-type')?.startsWith('audio/')) {console.error('Unexpected audio response; stopping.');process.exit(1);}
  await fs.writeFile(destination+'.tmp',buffer);
  await fs.rename(destination+'.tmp',destination);
  await fs.writeFile(stamp,hash);
  console.log(`Generated ${relative}`);
 }
 records.push(record);
}
if(dry) {console.log(`${lessons.length} lessons; ${records.length*3} audio files. Default generation: first lesson only; --all: full set. Model ${model}, voice ${voice}.`);process.exit(0);}
if(!all) {console.log('First lesson sample generated. Listen to audio/01-en-*.mp3, 01-slow-*.mp3 and 01-ja-*.mp3 before generating the full set with --all. App is unchanged.');process.exit(0);}
const manifest={model,voice,aiGenerated:true,lessons:records};
await fs.writeFile(path.join(root,'audio-manifest.js.tmp'),`window.AUDIO_MANIFEST = ${JSON.stringify(manifest)};\n`);
await fs.rename(path.join(root,'audio-manifest.js.tmp'),path.join(root,'audio-manifest.js'));
console.log('Full audio manifest saved. Audio files and manifest are public assets; API key is never included.');
