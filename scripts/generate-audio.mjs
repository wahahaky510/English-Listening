import fs from 'node:fs/promises';
import {setGlobalProxyFromEnv} from 'node:http';
setGlobalProxyFromEnv();
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ctx=vm.createContext({window:{}});
vm.runInContext(await fs.readFile(path.join(root,'data.js'),'utf8'),ctx);
const args=process.argv.slice(2);
const course=args.includes('--course') ? args[args.indexOf('--course')+1] : 'daily';
if(!['daily','intermediate'].includes(course)) throw new Error('Unknown course');
if(course==='intermediate') vm.runInContext(await fs.readFile(path.join(root,'intermediate-data.js'),'utf8'),ctx);
const lessons=course==='intermediate'?ctx.window.INTERMEDIATE_LESSONS:ctx.window.LESSONS;
const manifestFile=course==='intermediate'?'intermediate-audio-manifest.js':'audio-manifest.js';
const manifestVariable=course==='intermediate'?'INTERMEDIATE_AUDIO_MANIFEST':'AUDIO_MANIFEST';
const dry=args.includes('--dry-run');
const all=args.includes('--all');
const model='gpt-4o-mini-tts', voice='coral';
const voices={en:'coral',slow:'coral',ja:'shimmer'};
const settings=[['en',0,'Speak in natural conversational American English, with warm, clear delivery. Read only the supplied sentence.'],['slow',0,'Speak in natural American English, slowly and clearly for a language learner. Keep natural word connections and intonation. Do not spell words or add explanations. Read only the supplied sentence.'],['ja',1,'日本語の母語話者が親しい相手に話すように、標準的な日本語の自然なアクセントと滑らかなイントネーションで読んでください。落ち着いた明るい声で、日常会話の速さにしてください。単語や音節を一つずつ区切らず、意味のまとまりで話してください。語尾を不自然に引き伸ばさず、句読点で短く自然に間を取ってください。英語風のアクセント、棒読み、過剰な演技は避けてください。入力された日本語だけを読み、説明や挨拶は追加しないでください。']];
const key=process.env.LISTENING_TTS_API_KEY || process.env.OPENAI_API_KEY;
if(!dry && !key) {console.error('Missing LISTENING_TTS_API_KEY. Set it securely; never put it in repository files.');process.exit(1);}
await fs.mkdir(path.join(root,'audio'),{recursive:true});
const records=[];
for(let i=0;i<lessons.length;i++) {
 const record={};
 await Promise.all(settings.map(async ([kind,column,instructions]) => {
  const body={model,voice:voices[kind],input:lessons[i][column],instructions,response_format:'mp3',...(kind==='slow'?{speed:0.7}:{})};
  const hash=crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
  const relative=`audio/${course==='intermediate'?'intermediate-':''}${String(i+1).padStart(2,'0')}-${kind}-${hash.slice(0,12)}.mp3`;
  const destination=path.join(root,relative), stamp=destination+'.sha256';
  record[kind]=relative;
  if(dry) return;
  if(!all && i>0) return;
  let valid=false;
  try {valid=(await fs.readFile(stamp,'utf8'))===hash && (await fs.stat(destination)).size>0;} catch{}
  if(valid) {console.log(`Reuse ${relative}`);return;}
  const response=await fetch('https://api.openai.com/v1/audio/speech',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(120000)});
  if(!response.ok) {
   let code='unknown', type='unknown';
   try {const failure=await response.json();code=failure.error?.code || code;type=failure.error?.type || type;}catch{}
   console.error(`Audio generation failed: HTTP ${response.status}, code=${code}, type=${type}. No manifest was published.`);process.exit(1);
  }
  const buffer=Buffer.from(await response.arrayBuffer());
  if(!buffer.length || !response.headers.get('content-type')?.startsWith('audio/')) {console.error('Unexpected audio response; stopping.');process.exit(1);}
  await fs.writeFile(destination+'.tmp',buffer);
  await fs.rename(destination+'.tmp',destination);
  await fs.writeFile(stamp,hash);
  console.log(`Generated ${relative}`);
 }));
 records.push(record);
}
if(dry) {console.log(`${lessons.length} lessons; ${records.length*3} audio files. Default generation: first lesson only; --all: full set. Model ${model}, voice ${voice}.`);process.exit(0);}
if(!all) {console.log(`First lesson sample generated for ${course}. Listen to its generated MP3s before generating the full set with --all. App is unchanged.`);process.exit(0);}
const manifest={model,voice,voices,aiGenerated:true,lessons:records};
await fs.writeFile(path.join(root,manifestFile+'.tmp'),`window.${manifestVariable} = ${JSON.stringify(manifest)};\n`);
await fs.rename(path.join(root,manifestFile+'.tmp'),path.join(root,manifestFile));
console.log('Full audio manifest saved. Audio files and manifest are public assets; API key is never included.');
