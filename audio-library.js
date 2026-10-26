/** Local-only audio library. MP3 blobs are stored in browser IndexedDB, never in Firebase. */
const DB_NAME='malaga-games-media-v3';
const STORE='clips';
const MAX_MP3_BYTES=30*1024*1024;
export const CUES=[
 {key:'jingle',label:'Show-Intro',icon:'🎬',desc:'Großer Einmarsch oder neue Kategorie'},
 {key:'start',label:'Spielstart',icon:'🚀',desc:'Wenn die Zeit oder Runde startet'},
 {key:'correct',label:'Richtige Antwort',icon:'✅',desc:'Erfolg / richtiger Treffer'},
 {key:'wrong',label:'Falsche Antwort',icon:'❌',desc:'Fehler / Punkt an den Gegner'},
 {key:'reveal',label:'Auflösung',icon:'✨',desc:'Enthüllung einer Quizlösung'},
 {key:'winner',label:'Spiel gewonnen',icon:'🏆',desc:'Fanfare für den Sieger'},
 {key:'suspense',label:'Spannung',icon:'⚡',desc:'Dramatische Entscheidung'},
 {key:'tick',label:'Letzte 3 Sekunden',icon:'⏳',desc:'Dieser Ton ertönt bei 3, 2 und 1'},
 {key:'timeout',label:'Zeit abgelaufen',icon:'⏰',desc:'Schlusssignal bei 0 Sekunden'}
];
function openDB(){
 if(typeof indexedDB==='undefined')return Promise.reject(new Error('Dein Browser unterstützt den lokalen MP3-Speicher nicht.'));
 return new Promise((resolve,reject)=>{
  const req=indexedDB.open(DB_NAME,1);
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'key'})};
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error||new Error('Audio-Datenbank lässt sich nicht öffnen.'));
 });
}
async function transact(mode,perform){
 const db=await openDB();
 try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,mode),req=perform(tx.objectStore(STORE));
  let result;
  req.onsuccess=()=>{result=req.result};req.onerror=()=>reject(req.error);
  tx.oncomplete=()=>resolve(result);
  tx.onerror=()=>reject(tx.error||new Error('Audiodatei nicht speicherbar.'));
  tx.onabort=()=>reject(tx.error||new Error('Audiodatei nicht speicherbar.'));
 })}finally{db.close()}
}
export function validateMP3(file){
 if(!file||!(file instanceof Blob)||(!/\.mp3$/i.test(file.name||'')&&!['audio/mpeg','audio/mp3'].includes(file.type)))throw Error('Bitte eine MP3-Datei (.mp3) auswählen.');
 if(file.size<=0||file.size>MAX_MP3_BYTES)throw Error('Die MP3 muss zwischen 1 Byte und 30 MB groß sein.');
}
export const readAudio=()=>transact('readonly',store=>store.getAll());
export async function saveAudio(key,file){validateMP3(file);const value={key,file,fileName:file.name||'Audio.mp3',size:file.size,modified:Date.now()};await transact('readwrite',store=>store.put(value));return value}
export const removeAudio=key=>transact('readwrite',store=>store.delete(key));
