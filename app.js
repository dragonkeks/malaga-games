import {createTransport} from './sync.js';
import {CUES,readAudio,saveAudio,removeAudio} from './audio-library.js';

const PARAMS=new URLSearchParams(location.search);
const ROOM=(PARAMS.get('room')||'MALAGA26').toUpperCase().replace(/[^A-Z0-9-]/g,'').slice(0,24)||'MALAGA26';
const VIEW=['tv','player','host'].includes(PARAMS.get('view'))?PARAMS.get('view'):'host';
const BASE=location.origin+location.pathname;
const link=(view)=>`${BASE}?room=${ROOM}&view=${view}`;
const categories=['Geografie','Geschichte','Sprachen','Politik','Sport','Naturwissenschaften','Film & Fernsehen'];
const wheelLabels=['Geo-<br>grafie','Geschichte','Sprachen','Politik','Sport','Naturwissen-<br>schaften','Film &<br>Fernsehen'];
const finals=[...categories]; // Eine gemeinsame Kategorienliste für Glücksrad und Sammelkarten-Finale.
const drawKey=category=>'teams:'+category;
const finalCount=cards=>(cards||[]).filter(c=>finals.includes(c)).length;
const titles=['','Málaga – Wahrheit oder Wahnsinn','Bring mir die Antwort','Musik-Massaker','Padel-Tic-Tac-Toe','Schätz dich ins Aus','Das perfekte Timing','Finca-Hindernisparcours','Alles oder nichts … oder ein bisschen','Finale: Sammelkarten'];
const desc=['','Wahr oder falsch? Bis 9 Spielpunkte. Falsch schenkt dem Gegner einen Punkt.','Finde den Gegenstand! Bis 5. Falsche Gegenstände geben keinen Punkt.','Song erkennen oder mitsingen. Bis 7. Falsch = Punkt für die Gegenseite.','Padel-Tic-Tac-Toe auf dem Court. Gewinner erhält 4 Punkte.','Schätzen und Strafpunkte aus der Differenz errechnen. Kleinere Summe gewinnt.','Tennisball in den Becher: 0, 1, 2, 3, 4 und 5 Bodenkontakte – der Reihe nach.','Staffellauf durch die Finca: Du entscheidest den Gewinner.','Gesamtpunkte auf vier Antworten verteilen. Nur der Einsatz auf die korrekte Antwort bleibt.','Sieben Kategorien sammeln. Wer zuerst alle sieben schafft, gewinnt.'];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const int=v=>Number.isFinite(+v)?Math.round(+v):0;
const money=n=>new Intl.NumberFormat('de-DE').format(n||0);
const choicesLetters=['A','B','C','D'];
const toastText={value:''}; let toastTimer=null;
let state=null,secret=null,players={},submissions={},wagers={},buzz=null,me=null,user=null,mode='demo',transport=null,err='';
let nav='start', editorKey='1', wheelSpinning=false, wheelRotation=0, timerSound=true, tvSound=false, showLogin=false, selectedTeam='blue';
let playerName=localStorage.getItem(`mg:${ROOM}:name`)||'',playerTeam=localStorage.getItem(`mg:${ROOM}:team`)||'blue';
let demoPlayerJoined=false,playerWager=null;
// MP3 files are local to this browser and address; never sent to Firebase or JSON backups.
let audioAssets=new Map(),playingJingle=null,playingSong=null,mediaChannel=null;
function audioKeyForSong(question){return question?.audioId?'song:'+question.audioId:''}
async function reloadAudioAssets(){
 try{
  const entries=await readAudio(),next=new Map();
  entries.forEach(item=>next.set(item.key,{...item,url:URL.createObjectURL(item.file)}));
  const old=audioAssets;audioAssets=next;
  for(const entry of old.values())URL.revokeObjectURL(entry.url);
  if(state)render();
 }catch(ex){console.info('MP3-Speicher nicht verfügbar:',ex.message)}
}
function shareAudioChange(){mediaChannel?.postMessage('refresh')}
function stopAudio(kind){
 const active=kind==='song'?playingSong:playingJingle;
 if(active){active.pause();active.currentTime=0;}
 if(kind==='song')playingSong=null;else playingJingle=null;
}
function playFile(key,kind='jingle'){
 const asset=audioAssets.get(key);
 if(!asset)return false;
 try{
  stopAudio(kind);
  const audio=new Audio(asset.url);
  audio.volume=1;
  audio.play().catch(ex=>notify('Audio konnte nicht abgespielt werden: '+ex.message));
  if(kind==='song')playingSong=audio;else playingJingle=audio;
  return true;
 }catch(ex){notify('MP3 kann nicht abgespielt werden: '+ex.message);return true}
}
function fileLabel(key){return audioAssets.get(key)?.fileName||'Standardton'}
function soundStudio(){return `<div class="card sound-studio"><div class="section-title"><h3>🎛️ Soundstudio · eigene MP3-Jingles</h3>${badge('Nur lokal')}</div><p class="muted small">Ersetze jeden Standardton durch deine eigene MP3. Alle bisherigen Jingle-Buttons bleiben erhalten. Die Datei wird nur in diesem Browser gespeichert – kein Firebase-Upload.</p><div class="sound-list">${CUES.map(c=>`<div class="sound-row"><div class="sound-symbol">${c.icon}</div><div class="sound-info"><strong>${esc(c.label)}</strong><span>${esc(c.desc)}</span><small title="${esc(fileLabel(c.key))}">${esc(fileLabel(c.key))}</small></div><div class="sound-actions"><label class="btn secondary small sound-upload" title="MP3-Datei vom Computer wählen">MP3 wählen<input type="file" accept=".mp3,audio/mpeg" data-sound-file="${c.key}" hidden></label>${button('▶ Vorhören','preview-sound','btn ghost small',`data-sound="${c.key}"`)}${button('↺ Standard','remove-sound','btn ghost small',`data-sound="${c.key}" ${audioAssets.has('cue:'+c.key)?'':'disabled'}`)}</div></div>`).join('')}</div><div class="info-line">Wichtig: Die Sounds bleiben auch nach dem Schließen des Browsers erhalten, solange die Website-Daten nicht gelöscht werden. Auf einem neuen Laptop, in einem anderen Browser oder nach einem Adresswechsel (z. B. beim Firebase-Release) musst du die MP3s erneut auswählen. Die JSON-Spielstandsicherung enthält keine Audiodateien. Am TV auf diesem Laptop die Ton-Ausgabe ausdrücklich aktivieren.</div></div>`}

const spotifyId = value => { const match=String(value||'').match(/(?:open\.spotify\.com\/(?:intl-[a-z]{2}\/)?track\/|spotify:track:)([a-zA-Z0-9]{22})(?:[/?#]|$)/); return match?match[1]:null; };
// Themenbezogene Beispiel-Fragen; jede Kategorie besitzt ihren eigenen editierbaren Fragenpool.
const drawExamples={
  'Natur':[{text:'Welcher Baum verliert im Herbst gewöhnlich seine Nadeln?',answer:'Lärche'},{text:'Wie heißt ein junges Schaf?',answer:'Lamm'}],
  'Geschichte':[{text:'In welchem Jahr fiel die Berliner Mauer?',answer:'1989'},{text:'Wie hieß der erste Mensch auf dem Mond?',answer:'Neil Armstrong'}],
  'Sprachen':[{text:'Was bedeutet das spanische Wort „hola“ auf Deutsch?',answer:'Hallo'},{text:'Wie heißt „Danke“ auf Spanisch?',answer:'Gracias'}],
  'Politik':[{text:'Wie viele Bundesländer hat Deutschland?',answer:'16'},{text:'In welcher Stadt hat der Deutsche Bundestag seinen Sitz?',answer:'Berlin'}],
  'Sport':[{text:'Wie viele Spieler stehen beim Fußball pro Mannschaft zu Beginn auf dem Platz?',answer:'11'},{text:'Wie viele Punkte zählt ein gewonnener Tie-Break im Padel mindestens?',answer:'7 (mit zwei Punkten Vorsprung)'}],
  'Naturwissenschaften':[{text:'Welches chemische Symbol steht für Gold?',answer:'Au'},{text:'Wie viele Planeten hat unser Sonnensystem?',answer:'8'}],
  'Film & Fernsehen':[{text:'Wie heißt der Löwenjunge in „Der König der Löwen“?',answer:'Simba'},{text:'Wie heißt die Zauberschule, die Harry Potter besucht?',answer:'Hogwarts'}]
};
const qDefault={
  ...Object.fromEntries(categories.map(c=>[drawKey(c),drawExamples[c]])),
  '1':[{text:'Pablo Picasso wurde in Málaga geboren.',answer:'Wahr'},{text:'Málaga liegt in der spanischen Region Andalusien.',answer:'Wahr'}],
  '2':[{text:'Bring mir einen Gegenstand, auf dem eine Zahl steht.',answer:'Gegenstand mit eindeutig sichtbarer Zahl'}],
  '3':[{text:'Spiele einen selbst ausgewählten Song. Wie heißt er?',answer:'Trage vor der Show die Lösung ein.'}],
  '5':[{text:'Wie viele Sekunden hat eine Stunde?',answer:'3600'}],
  '8':[{text:'In welcher autonomen Gemeinschaft liegt Málaga?',choices:['Andalusien','Katalonien','Galicien','Aragón'],answer:'A'}],
  ...Object.fromEntries(finals.map(x=>['9:'+x,[{text:`Eigene Frage/Aufgabe für ${x} eintragen`,answer:'Deine Lösung'}]]))
};
// Alte V3-Fragen werden nicht überschrieben: fehlende Kategorien werden ergänzt;
// ehemalige allgemeine Fragen ("teams") und Finale-Archive bleiben zur Zuordnung erhalten.
function normalizeSecret(input){
 if(!input||typeof input!=='object')return makeSecret();
 const questions={...(input.questions||{})};let changed=false;
 if(!input.indices||!input.roster||!input.manualWagers||!input.estimateDraft){changed=true;}
 for(const [key,items] of Object.entries(qDefault)){
  if(!Array.isArray(questions[key])){questions[key]=structuredClone(items);changed=true;}
 }
 return changed?{...makeSecret(),...input,indices:input.indices||{},questions}:input;
}
// Firebase/older saved shows may lack fields added in later versions.
// Normalize public data before rendering without overwriting existing points.
function normalizeState(input){
 if(!input||typeof input!=='object'||Array.isArray(input))return null;
 const base=makeState();
 const record=(value,fallback)=>value&&typeof value==='object'&&!Array.isArray(value)?{...fallback,...value}:{...fallback};
 const teams=record(input.teams,base.teams);
 const finalCards=record(input.finalCards,base.finalCards);
 return {
  ...base,...input,
  teamNames:record(input.teamNames,base.teamNames),
  points:record(input.points,base.points),
  scores:record(input.scores,base.scores),
  gameScores:record(input.gameScores,base.gameScores),
  results:record(input.results,base.results),
  teams:{blue:Array.isArray(teams.blue)?teams.blue:[],orange:Array.isArray(teams.orange)?teams.orange:[]},
  estimatePenalties:record(input.estimatePenalties,base.estimatePenalties),
  timing:record(input.timing,base.timing),
  finalCards:{blue:Array.isArray(finalCards.blue)?finalCards.blue:[],orange:Array.isArray(finalCards.orange)?finalCards.orange:[]},
  soundEvent:record(input.soundEvent,base.soundEvent),
  options:Array.isArray(input.options)?input.options:[],
  finalCategory:finals.includes(input.finalCategory)?input.finalCategory:finals[0]
 };
}
const makeState=()=>({brand:'MÁLAGA GAMES',teamNames:{blue:'Team Blau',orange:'Team Orange'},points:{blue:0,orange:0},scores:{blue:0,orange:0},gameScores:{},results:{},activeGame:0,screen:'intro',progress:0,round:1,
  prompt:'',options:[],questionKey:'',answerRevealed:false,shownAnswer:'',buzzOpen:false,answerOpen:false,buzzWinning:null,timerEnd:0,wheelAngle:0,wheelFrom:0,wheelCategory:'',wheelSpinning:false,teams:{blue:[],orange:[]},nextDrawTeam:'blue',drawFeedback:'',drawFeedbackName:'',
  estimatePenalties:{blue:0,orange:0},estimateLast:null,estScale:1,timing:{blue:-1,orange:-1},finalCards:{blue:[],orange:[]},finalCategory:finals[0],wagerBase:null,wagerResult:null,
  soundEvent:{id:0,type:''},updatedAt:Date.now()});
const makeSecret=()=>({questions:JSON.parse(JSON.stringify(qDefault)),indices:{},roster:[],manualWagers:{blue:[0,0,0,0],orange:[0,0,0,0]},estimateDraft:{correct:'',blue:'',orange:''},notes:{},hostEmail:''});
const e=(s)=>document.getElementById(s);
function notify(msg){toastText.value=msg;renderToast();clearTimeout(toastTimer);toastTimer=setTimeout(()=>{toastText.value='';renderToast()},3800)}
function renderToast(){let t=e('toast');if(t){t.textContent=toastText.value;t.classList.toggle('visible',!!toastText.value)}}
const teamName=t=>state?.teamNames?.[t]||(t==='blue'?'Team Blau':'Team Orange');
function patch(changes){if(!state||VIEW!=='host')return;state={...state,...changes,updatedAt:Date.now()};savePublic();render()}
function priv(changes){secret={...secret,...changes};savePrivate();render()}
async function savePublic(){try{await transport.putPublic(state)}catch(ex){notify('Speichern nicht möglich: '+ex.message)}}
async function savePrivate(){try{await transport.putPrivate(secret)}catch(ex){notify('Moderator-Daten: '+ex.message)}}
function gameSelect(g){if(!state)return;nav='game'+g;if(state.activeGame===g){patch({screen:'game'});return;}const changes={activeGame:g,screen:'game',scores:state.gameScores?.[g]||{blue:0,orange:0},prompt:'',options:[],questionKey:'',answerRevealed:false,shownAnswer:'',buzzOpen:false,answerOpen:false,timerEnd:0};
 if(g===8 && !state.wagerBase){changes.wagerBase={...state.points};changes.wagerResult=null;transport.clearWagers().catch(()=>{});}
 patch(changes);
}
function screen(which){patch({screen:which,buzzOpen:false,answerOpen:false,timerEnd:0});}
function scoreTeam(team, delta, target=0){let scores={...state.scores,[team]:Math.max(0,(state.scores?.[team]||0)+delta)};patch({scores,gameScores:{...state.gameScores,[state.activeGame]:scores}});if(target && scores[team]>=target){notify(teamName(team)+' erreicht das Spielziel! Jetzt Sieg bestätigen.')} }
function scoreAnswer(team,correct,target,wrongToRival){if(!team){notify('Bitte zuerst ein antwortendes Team auswählen.');return}const winning=correct?team:(wrongToRival?(team==='blue'?'orange':'blue'):null);if(winning)scoreTeam(winning,1,target);playJingle(correct?'correct':'wrong');}
function award(g,team){if(state.results[g]){notify('Dieses Spiel wurde schon gewertet. Korrektur über „Wertung zurücknehmen“.');return}
 let points={...state.points,[team]:(state.points[team]||0)+g},results={...state.results,[g]:team};patch({points,results,screen:'break',answerOpen:false,buzzOpen:false,timerEnd:0});playJingle('winner');notify(`${teamName(team)} gewinnt ${g} Punkte!`)}
function undoAward(g){let winner=state.results[g];if(!winner)return;if(!confirm('Wertung dieses Spiels wirklich zurücknehmen?'))return;
 const points={...state.points,[winner]:Math.max(0,state.points[winner]-g)},results={...state.results};delete results[g];patch({points,results,screen:'game'});}
function nextQuestion(dir=1,key=''){key=key||(state.activeGame===9?'9:'+state.finalCategory:String(state.activeGame));const qs=secret?.questions?.[key]||[];if(!qs.length){notify('Erst eine Frage im Frageneditor hinzufügen.');return}
 const wanted=(secret.indices[key]??-1)+dir;
 if(wanted>=qs.length){notify('Alle Fragen in '+key.replace(/^teams:|^9:/,'')+' gezeigt. Bitte weitere Fragen eintragen.');return;}
 const idx=Math.max(0,wanted);secret.indices[key]=idx;savePrivate();publishQuestion(key,idx)}
function publishQuestion(key,idx){if(key==='3')stopAudio('song');const q=secret.questions[key]?.[idx];if(!q)return;let questionKey=`${key}-${idx}-${Date.now()}`;
 patch({prompt:q.text,options:key==='8'?(q.choices||[]):[],questionKey,answerRevealed:false,shownAnswer:'',buzzOpen:false,answerOpen:false,drawFeedback:'',drawFeedbackName:'',round:idx+1});transport.clearBuzz().catch(()=>{});transport.clearSubmissions().catch(()=>{});}
function revealAnswer(){const key=state.activeGame===9?'9:'+state.finalCategory:String(state.activeGame),idx=secret.indices[key]||0,q=secret.questions[key]?.[idx];patch({answerRevealed:true,shownAnswer:q?.answer||'Keine Lösung hinterlegt.',answerOpen:false,buzzOpen:false});playJingle('reveal')}
function spinWheel(){
 if(wheelSpinning)return;
 wheelSpinning=true;
 const idx=Math.floor(Math.random()*categories.length),chosen=categories[idx];
 const last=(state.wheelAngle||0)%360,step=360/categories.length;
 const target=360-(idx*step+step/2),add=360*5+((target-last+360)%360);
 wheelRotation=(state.wheelAngle||0)+add;
 patch({screen:'teams',wheelFrom:state.wheelAngle||0,wheelAngle:wheelRotation,wheelSpinning:true,wheelCategory:'',prompt:'',options:[],questionKey:'',answerRevealed:false,shownAnswer:'',drawFeedback:'',drawFeedbackName:'',buzzOpen:false,answerOpen:false});
 setTimeout(()=>{
  wheelSpinning=false;
  patch({wheelSpinning:false,wheelCategory:chosen});
  playJingle('winner');
  // Die erste/naechste Frage wird automatisch NUR aus der erdrehten Kategorie geladen.
  const key=drawKey(chosen),questions=secret?.questions?.[key]||[];
  if(questions.length)nextQuestion(1,key);
  else notify('Keine Frage für '+chosen+' hinterlegt. Bitte im Fragenstudio ergänzen.');
 },4200);
}
function drawWrong(){const input=e('draw-name');const name=(input?.value||'').trim();if(!name){notify('Bitte den ausgeschiedenen Namen eintragen.');return}const team=state.nextDrawTeam;let teams=structuredClone(state.teams);if(teams.blue.includes(name)||teams.orange.includes(name)){notify('Diese Person wurde bereits zugeteilt.');return}
 teams[team].push(name);patch({teams,nextDrawTeam:team==='blue'?'orange':'blue',drawFeedback:'wrong',drawFeedbackName:name});notify(name+' → '+teamName(team))}
function moveDraw(team,index){const teams=structuredClone(state.teams);const name=teams[team][index];if(!name)return;teams[team].splice(index,1);teams[team==='blue'?'orange':'blue'].push(name);patch({teams})}
function finishEstimate(){let d=secret.estimateDraft;let n=['correct','blue','orange'].map(k=>Number(d[k]));if(n.some(x=>!Number.isFinite(x))||Object.values(d).some(v=>String(v).trim()==='')){notify('Lösung und beide Tipps müssen Zahlen sein.');return}
 const scale=Math.max(0.000001,Number(state.estScale)||1),deviation={blue:Math.abs(n[1]-n[0]),orange:Math.abs(n[2]-n[0])};
 const penalties={blue:Math.ceil(deviation.blue/scale),orange:Math.ceil(deviation.orange/scale)},sum={blue:state.estimatePenalties.blue+penalties.blue,orange:state.estimatePenalties.orange+penalties.orange};
 patch({estimatePenalties:sum,estimateLast:{correct:n[0],tips:{blue:n[1],orange:n[2]},deviation,penalties}});notify('Differenzen berechnet. Kleinere Strafpunktsumme gewinnt.');}
function setTimer(seconds){patch({timerEnd:Date.now()+seconds*1000});playJingle('start')}
// Custom audio is loaded locally from IndexedDB; synthesizer provides the fallback.
function audioContext(){
  const Audio=window.AudioContext||window.webkitAudioContext;
  if(!Audio)return null;
  const ctx=window._mgAudio||(window._mgAudio=new Audio());
  if(ctx.state==='suspended')ctx.resume().catch(()=>{});
  return ctx;
}
function beep(ctx,frequency,at,duration=0.17,type='sine',volume=0.12,slide=null){
  const osc=ctx.createOscillator(),envelope=ctx.createGain();
  osc.type=type;osc.frequency.setValueAtTime(Math.max(60,frequency),at);
  if(slide)osc.frequency.exponentialRampToValueAtTime(Math.max(60,slide),at+duration);
  envelope.gain.setValueAtTime(0.0001,at);
  envelope.gain.exponentialRampToValueAtTime(volume,at+Math.min(0.025,duration/5));
  envelope.gain.exponentialRampToValueAtTime(0.0001,at+duration);
  osc.connect(envelope).connect(ctx.destination);osc.start(at);osc.stop(at+duration+0.012);
}
function playSound(type,level=0){
  if(playFile('cue:'+type))return;
  try{
    const ctx=audioContext();if(!ctx)return;
    const now=ctx.currentTime+.018;
    const melody=(notes,wave='sine',vol=.1)=>notes.forEach(([f,offset,dur],i)=>beep(ctx,f,now+offset,dur,wave,vol));
    switch(type){
      case 'jingle': // Signature theme: uplifting game-show brass
        melody([[330,0,.12],[440,.13,.12],[554,.26,.12],[659,.39,.2],[880,.61,.36]],'sawtooth',.075);
        melody([[165,0,.17],[220,.26,.17],[330,.52,.4]],'triangle',.06);break;
      case 'start': // Countdown / action start
        melody([[523,0,.09],[659,.12,.09],[784,.24,.09],[1047,.39,.28]],'square',.06);break;
      case 'correct': // Friendly rising arpeggio
        melody([[659,0,.12],[830,.10,.12],[988,.21,.14],[1318,.35,.28]],'sine',.13);break;
      case 'wrong': // Dramatic descending sting
        beep(ctx,360,now,.28,'sawtooth',.09,145);
        beep(ctx,175,now+.20,.30,'triangle',.10,110);break;
      case 'reveal': // Glassy reveal, a little sparkle
        melody([[880,0,.24],[1175,.15,.22],[1568,.31,.45]],'sine',.09);break;
      case 'winner': // Long victory fanfare
        melody([[392,0,.20],[523,.22,.20],[659,.44,.2],[784,.66,.21],[1047,.89,.52],[784,1.04,.37],[1047,1.23,.63]],'triangle',.14);
        melody([[196,0,.16],[262,.44,.22],[392,.88,.50]],'sawtooth',.052);break;
      case 'suspense':
        melody([[247,0,.15],[233,.18,.15],[247,.36,.15],[311,.54,.40]],'triangle',.1);break;
      case 'tick': // 3 / 2 / 1 second signals, each higher than the last
        beep(ctx,[0,880,784,698][level]||880,now,.135,'square',.095);break;
      case 'timeout': // Distinct, longer 'time is up' buzzer
        beep(ctx,294,now,.57,'sawtooth',.115,185);
        beep(ctx,147,now+.08,.50,'triangle',.11,123);break;
      default:melody([[523,0,.17],[784,.16,.23]],'triangle',.09);
    }
  }catch(ex){console.warn('Sound nicht verfügbar:',ex)}
}
function playJingle(type,publicEvent=true){
  if(publicEvent && state && VIEW==='host'){
    state.soundEvent={id:Date.now(),type};savePublic();
  }
  playSound(type);
}
// Countdown signals fire at the moment 3, 2, 1 and 0 is reached.
// Duplicate intervals / re-renders don't cause repeat beeps.
const countdownTracker={end:0,last:null};
function updateCountdown(){
  const end=state?.timerEnd||0,remaining=end?Math.max(0,Math.ceil((end-Date.now())/1000)):0;
  document.querySelectorAll('[data-clock]').forEach(el=>{
    el.textContent=formatTime(end);
    el.classList.toggle('clock-urgent',!!end&&remaining<=3);
  });
  if(!end){countdownTracker.end=0;countdownTracker.last=null;return;}
  if(countdownTracker.end!==end){countdownTracker.end=end;countdownTracker.last=remaining+1;}
  if(countdownTracker.last===remaining)return;
  countdownTracker.last=remaining;
  if((VIEW==='host'||(VIEW==='tv'&&tvSound))&&remaining>=1&&remaining<=3)playSound('tick',remaining);
  if((VIEW==='host'||(VIEW==='tv'&&tvSound))&&remaining===0)playSound('timeout');
}
function showSound(){const prev=window._lastSound||0;const ev=state?.soundEvent;if(VIEW==='tv'&&tvSound&&ev?.id && ev.id!==prev)playJingle(ev.type,false);window._lastSound=ev?.id||0}
function sendGuess(team){const a=e('guess-'+team);if(!a)return;secret.estimateDraft[team]=a.value;savePrivate();notify('Schätzung übernommen')}
function applyWager(){if(state.wagerResult){notify('Wette ist bereits ausgewertet.');return}if(!state.wagerBase){notify('Starte erst Spiel 8.');return}
 const allocations={};for(const team of ['blue','orange']){
   let remote=wagers[team];let draft=remote?[remote.a,remote.b,remote.c,remote.d]:secret.manualWagers[team];let arr=draft.map(Number);
   if(arr.some(x=>!Number.isInteger(x)||x<0)||arr.reduce((a,b)=>a+b,0)!==state.wagerBase[team]){notify(`Einsätze von ${teamName(team)} müssen genau ${state.wagerBase[team]} ergeben.`);return}allocations[team]=arr;
 }
 let key=String(state.activeGame),q=secret.questions['8']?.[secret.indices['8']||0];let correct=choicesLetters.indexOf(q?.answer?.trim()?.toUpperCase());if(correct<0){notify('Hinterlege im Frageneditor die richtige Antwort A, B, C oder D.');return}
 const retained={blue:allocations.blue[correct],orange:allocations.orange[correct]},bonus={blue:0,orange:0};let winner='tie';
 if(retained.blue>retained.orange){winner='blue';bonus.blue=8}else if(retained.orange>retained.blue){winner='orange';bonus.orange=8}else{bonus.blue=4;bonus.orange=4}
 const points={blue:retained.blue+bonus.blue,orange:retained.orange+bonus.orange};let results={...state.results,8:winner};patch({points,results,answerRevealed:true,shownAnswer:q.answer,answerOpen:false,wagerResult:{allocations,correct,retained,bonus,winner},screen:'game'});playJingle('winner');}
function recordFinal(team,category){if(!finals.includes(category))return;if(state.results[9]){notify('Finale bereits gewertet.');return}let completed=[...(state.finalCards[team]||[])].filter(c=>finals.includes(c)),i=completed.indexOf(category);if(i<0)completed.push(category);else completed.splice(i,1);let finalCards={...state.finalCards,[team]:completed};patch({finalCards});if(completed.length===finals.length && i<0){award(9,team)}}
function markBuzzerReset(){transport.clearBuzz().then(()=>patch({buzzOpen:true,buzzWinning:null})).catch(ex=>notify(ex.message))}
function playerInputType(){if(state.activeGame===8)return 'wager';if(state.activeGame===1)return 'bool';if(state.activeGame===5)return 'number';return 'text'}
const button=(label,act,cls='btn',extra='')=>`<button type="button" class="${cls}" data-act="${act}" ${extra}>${label}</button>`;
const badge=t=>`<span class="tag">${esc(t)}</span>`;
const pointsHtml=(compact=false)=>`<div class="score-grid ${compact?'compact':''}">${['blue','orange'].map(t=>`<div class="score-panel ${t}"><div class="team-heading"><span class="team-dot"></span>${esc(teamName(t))}</div><div class="big-score">${money(state.points[t])}</div><div class="muted small">GESAMTPUNKTE</div></div>`).join('')}</div>`;
const progressHtml=()=>`<div class="progress-info"><span>SHOWFORTSCHRITT</span><b>${Object.keys(state.results||{}).length} / 9 Spiele</b></div><div class="progress"><div style="width:${Object.keys(state.results||{}).length/9*100}%"></div></div>`;
function shell(content){return `<div class="app-shell"><header class="topbar"><a href="${link('host')}" class="brand"><img src="logo.webp" alt="MG"/><span>MÁLAGA <strong>GAMES</strong><small>THE FINCA SHOW · 2026</small></span></a><div class="top-right"></div></header>${content}</div><div id="toast" class="toast"></div>`}
function wheel(){return `<div class="wheel-holder"><div class="wheel-pointer">▼</div><div class="wheel ${state.wheelSpinning?'spinning':''}" style="--wheel-start:${state.wheelFrom||0}deg;--wheel-end:${state.wheelAngle||0}deg;transform:rotate(${state.wheelAngle}deg)">${categories.map((x,i)=>`<span class="wheel-item" style="transform:translate(-50%,-50%) rotate(${i*360/categories.length+180/categories.length}deg) translateY(calc(0px - var(--wheel-radius))) rotate(${-1*(i*360/categories.length+180/categories.length)}deg)"><span class="wheel-label">${wheelLabels[i]}</span></span>`).join('')}<div class="wheel-center">MG</div></div></div>`}
function intro(){return `<div class="eyebrow">DIE REGELN</div><img src="logo.webp" alt="Málaga Games" class="intro-crest"/><h1>Neun Spiele. <em>Ein Sieger.</em></h1><p class="lead">Nach jedem Spiel steigt der Wert um einen Gesamtpunkt. Die Einzelwertung innerhalb einer Kategorie ist davon getrennt. Spiel 8 ist eine Sonderwertung mit Punkteinsatz.</p><div class="point-ladder">${titles.slice(1).map((name,i)=>`<div class="ladder-item ${state.results[i+1]?'done':''}"><div class="ladder-number">${i+1}</div><div class="ladder-name">${esc(name)}</div><strong>+${i+1}</strong></div>`).join('')}</div><div class="info-line"><b>Hinweis zu Spiel 8:</b> Die bisher gesammelten Punkte werden auf die vier Antworten gesetzt. Nur die korrekt gesetzten Punkte bleiben erhalten. Zusätzlich gibt es 8 Bonuspunkte für das erfolgreichere Team (bei Gleichstand 4 pro Team).</div>`}
function editor(){
 const items=secret.questions[editorKey]||[];
 const archived=Object.keys(secret.questions).filter(k=>(k==='teams'&&secret.questions[k]?.length)||(k.startsWith('9:')&&!finals.includes(k.slice(2))&&secret.questions[k]?.length));
 const isArchive=archived.includes(editorKey);
 const selectOption=(key,label)=>`<option value="${esc(key)}" ${editorKey===key?'selected':''}>${esc(label)}</option>`;
 return `<div class="eyebrow">VORBEREITUNG</div><h1>Fragenstudio</h1><p class="lead">Fragen und Lösungen bleiben geheim, bis du sie freigibst. Die Teamauslosung verwendet automatisch den Fragenpool der erdrehten Kategorie.</p>
 <div class="field"><label>Spiel / Kategorie auswählen</label><select id="editor-key" data-change="editor-key">
 <optgroup label="Teamauslosung · Glücksrad">${categories.map(c=>selectOption(drawKey(c),c)).join('')}</optgroup>
 <optgroup label="Hauptspiele">${[1,2,3,5,8].map(g=>selectOption(String(g),'Spiel '+g+' · '+titles[g])).join('')}</optgroup>
 <optgroup label="Finale · Sammelkarten">${finals.map(c=>selectOption('9:'+c,c)).join('')}</optgroup>
 ${archived.length?`<optgroup label="Archiv aus älteren Versionen">${archived.map(k=>selectOption(k,k==='teams'?'Alte allgemeine Auslosungsfragen':`Altes Finale · ${k.slice(2)}`)).join('')}</optgroup>`:''}</select></div>
 ${editorKey.startsWith('teams:')?`<div class="info-line"><b>Glücksrad · ${esc(editorKey.slice(6))}:</b> Hier hinterlegte Fragen erscheinen ausschließlich, wenn das Rad diese Kategorie auswählt. Fragen kannst du beliebig ergänzen oder ändern.</div>`:''}
 ${isArchive?`<div class="info-line"><b>Alte Fragen aus V3:</b> Diese Fragen wurden sicher übernommen. Wähle bei jeder Frage unten ihre neue Kategorie aus. Erst nach deiner Auswahl wird sie verschoben. Die bisherigen Texte und Lösungen bleiben erhalten.</div>`:''}
 <div class="stack">${items.map((q,i)=>`<div class="question-edit card" data-key="${esc(editorKey)}"><div class="edit-head"><strong>Frage ${i+1}</strong>${button('Löschen','delete-question','btn small danger',`data-index="${i}"`)}</div>
 <label>Frage / Aufgabenstellung</label><textarea data-qfield="text" data-index="${i}" rows="2">${esc(q.text)}</textarea>
 ${editorKey==='8'?`<label>Vier Antworten (eine pro Zeile)</label><textarea data-qfield="choices" data-index="${i}" rows="4">${esc((q.choices||['','','','']).join('\n'))}</textarea>`:''}
 ${editorKey==='3'?`<label>Spotify-Link zum Song (nur Moderatoransicht)</label><input data-qfield="spotify" data-index="${i}" type="url" placeholder="https://open.spotify.com/track/…" value="${esc(q.spotify||'')}"/>`:''}
 ${editorKey==='3'?`<label>Eigene Song-MP3 (nur lokal, nicht auf dem TV)</label><div class="editor-audio-row"><label class="btn secondary small sound-upload">♫ Song-MP3 auswählen<input type="file" accept=".mp3,audio/mpeg" data-song-file="${i}" hidden></label><span class="muted small">${esc(audioAssets.get(audioKeyForSong(q))?.fileName||'Keine Song-MP3 ausgewählt')}</span>${button('▶ Test','preview-song','btn ghost small',`data-index="${i}" ${audioAssets.has(audioKeyForSong(q))?'':'disabled'}`)}${button('Entfernen','remove-song','btn ghost small',`data-index="${i}" ${audioAssets.has(audioKeyForSong(q))?'':'disabled'}`)}</div>`:''}
 <label>${editorKey==='8'?'Richtige Lösung (A / B / C / D)':'Lösung / Moderatorennotiz'}</label><input data-qfield="answer" data-index="${i}" value="${esc(q.answer)}" />
 ${isArchive?`<label>Frage in neue Kategorie verschieben</label><select data-change="move-archived" data-index="${i}"><option value="">Zielkategorie auswählen …</option>${(editorKey==='teams'?categories.map(c=>[drawKey(c),c]):finals.map(c=>['9:'+c,c])).map(([key,label])=>`<option value="${esc(key)}">${esc(label)}</option>`).join('')}</select>`:''}
 </div>`).join('')}</div>${isArchive?'':button('＋ Neue Frage anlegen','add-question','btn primary')}`;
}
function drawPage(){
 const cat=state.wheelCategory, key=cat?drawKey(cat):'', qs=secret.questions[key]||[],idx=secret.indices[key]??-1;
 const questionNumber=idx>=0?`${idx+1} / ${qs.length}`:`0 / ${qs.length}`;
 return `<div class="eyebrow">TEAMBUILDING</div><h1>Das Kategorien-Glücksrad</h1><p class="lead">Alle stehen in einer Reihe. Wer falsch antwortet, scheidet aus und wird abwechselnd Blau und Orange zugeteilt – Ziel: 6 gegen 5.</p>
 <div class="two-col"><div class="card center">${wheel()}<div class="wheel-result">${state.wheelSpinning?'Das Rad dreht sich …':cat?`Gewählt: <b>${esc(cat)}</b>`:'Drehe das Rad für die nächste Frage'}</div>
 ${button('🎯 Rad drehen','wheel','btn primary',state.wheelSpinning?'disabled':'')}
 <div class="draw-quiz"><div class="section-title"><h3>Passende Fragen</h3>${badge(cat?`${questionNumber} · ${cat}`:'Kategorie offen')}</div>
 <p>${esc(state.prompt||(cat?'Für diese Kategorie noch keine Frage angezeigt.':'Nach dem Drehen erscheint hier automatisch eine Frage aus der gewählten Kategorie.'))}</p>
 ${state.answerRevealed?`<b class="draw-answer">Antwort: ${esc(state.shownAnswer)}</b>`:''}
 ${state.drawFeedback?`<div class="draw-feedback ${state.drawFeedback}">${state.drawFeedback==='right'?'✓ RICHTIG · bleibt im Rennen':`✕ FALSCH · ${esc(state.drawFeedbackName)} ist zugeteilt`}</div>`:''}
 <div class="tool-row">${button('← Vorherige','draw-prev','btn ghost',cat?'':'disabled')}${button('Nächste Frage →','draw-question','btn secondary',cat?'':'disabled')}${button('Lösung zeigen','draw-reveal','btn ghost',cat&&idx>=0?'':'disabled')}</div>
 <div class="tool-row">${button('✏️ Fragen dieser Kategorie bearbeiten','draw-editor','btn ghost')}</div></div>
 <div class="draw-decision">${button('✓ RICHTIG – bleibt im Rennen','draw-right','btn success',cat?'':'disabled')}<div class="input-row"><input id="draw-name" placeholder="Name der ausgeschiedenen Person"/>${button('✕ FALSCH – zuordnen','draw-wrong','btn danger',cat?'':'disabled')}</div><div class="muted small">Nächste falsche Antwort → <b>${esc(teamName(state.nextDrawTeam))}</b></div></div></div>
 <div class="card"><h3>Ausgeloste Teams</h3>${['blue','orange'].map(t=>`<div class="draw-team ${t}"><b>${esc(teamName(t))} (${state.teams[t].length})</b>${state.teams[t].length?state.teams[t].map((name,i)=>`<div class="draw-person"><span>${esc(name)}</span>${button('↔ Team wechseln','move-draw','btn ghost tiny',`data-team="${t}" data-index="${i}"`)}</div>`).join(''):'<p class="muted">Noch niemand zugeteilt</p>'}</div>`).join('')}<div class="info-line">Du kannst deine Fragen pro Glücksrad-Kategorie im Fragenstudio bearbeiten. Eine neue Drehung wählt automatisch eine passende Frage.</div></div></div>`;
}
function quizTools(g){let key=g===9?'9:'+state.finalCategory:String(g),questions=secret.questions[key]||[],idx=secret.indices[key]??-1,q=questions[idx];return `<div class="card"><div class="section-title"><h3>Fragensteuerung</h3>${badge(`${questions.length} Fragen gespeichert`)}</div>${g===9?`<div class="field"><label>Finalkategorie auswählen</label><select data-change="final-category">${finals.map(x=>`<option ${state.finalCategory===x?'selected':''}>${esc(x)}</option>`).join('')}</select></div>`:''}<div class="tool-row">${button('← Zurück','question-prev','btn secondary')}${button('Nächste Frage →','question-next','btn primary')}</div><div class="current-question"><span class="eyebrow">${idx>=0?'FRAGE '+(idx+1):'NOCH KEINE FRAGE'}</span><p>${esc(state.prompt||'Mit „Nächste Frage“ starten.')}</p></div>${q?`<div class="solution"><span class="muted small">Nur für die Moderation:</span><b>${esc(q.answer)}</b></div>`:''}<div class="tool-row">${button('👁 Lösung auf TV zeigen','reveal','btn secondary')}${button('✏️ Fragen bearbeiten','go-editor','btn ghost')}</div><div class="tool-row">${button(state.buzzOpen?'Buzzer schließen':'🔔 Buzzer freigeben','toggle-buzz','btn secondary')}${button('↺ Buzzer zurücksetzen','reset-buzz','btn ghost')}${button(state.answerOpen?'Antworten schließen':'📱 Handys freigeben','toggle-answers','btn secondary')}
</div>${buzz?`<div class="buzz-winner">⚡ ${esc(buzz.name||'Unbekannt')} · ${esc(teamName(buzz.team))} hat zuerst gebuzzert!</div>`:''}${Object.keys(submissions).length?`<div class="submissions"><b>Handyantworten</b>${Object.entries(submissions).filter(([,v])=>v?.questionKey===state.questionKey).map(([uid,v])=>`<div>${esc(players[uid]?.name||'Teilnehmer')}: <b>${esc(v.value)}</b> ${badge(teamName(v.team))}</div>`).join('')}</div>`:''}</div>`}
function musicTools(){
 const idx=secret.indices['3']??0,q=secret.questions['3']?.[idx],key=audioKeyForSong(q),asset=audioAssets.get(key),id=spotifyId(q?.spotify);
 return `<div class="card music-card"><div class="section-title"><h3>🎵 Musik-Massaker · Regie-Player</h3>${badge('Nur Moderator')}</div><p class="muted small">Spiele eigene, rechtmäßig verwendbare MP3-Songs direkt in der Regie ab. Titel und Lösung werden auf dem TV nicht angezeigt, bis du sie freigibst.</p>${asset?`<div class="music-asset"><span>🎧 ${esc(asset.fileName)}</span><div class="tool-row">${button('▶ Song abspielen','play-song','btn primary')}${button('■ Stoppen','stop-song','btn ghost')}</div></div>`:`<p class="music-hint">Noch keine Songdatei für diese Frage gespeichert. Im Fragenstudio kannst du eine MP3 hinzufügen.</p>`}${id?`<p class="muted small">Spotify-Referenz: <a href="https://open.spotify.com/track/${id}" target="_blank" rel="noopener noreferrer">In Spotify separat öffnen ↗</a></p>`:''}${button('✏️ Songs & Fragen bearbeiten','go-editor','btn secondary')}</div>`;
}

function scoreControls(g,target,wrong){return `<div class="card"><div class="section-title"><h3>Spielstand</h3>${badge('Ziel: '+target)}</div>${innerScores()}<div class="actions-grid">${['blue','orange'].map(t=>`<div class="action-team ${t}"><b>${esc(teamName(t))}</b>${button('✓ Richtig (+1)','right','btn success',`data-team="${t}" data-target="${target}" data-wrong="${wrong}"`)}${button(wrong?'✕ Falsch → Gegner +1':'✕ Falsch (0 Punkte)','wrong','btn danger',`data-team="${t}" data-target="${target}" data-wrong="${wrong}"`)}${button('− 1 korrigieren','minus-score','btn ghost',`data-team="${t}"`)}</div>`).join('')}</div></div>`}
function innerScores(){return `<div class="mini-scores">${['blue','orange'].map(t=>`<div class="mini-score ${t}"><span>${esc(teamName(t))}</span><b>${money(state.scores[t])}</b></div>`).join('')}</div>`}
function winnerControls(g){return `<div class="card"><h3>Ergebnis festlegen · ${g} Punkte</h3><p class="muted">Das Siegerteam erhält ${g} Punkte für die Show-Gesamtwertung. Danach erscheint automatisch die Zwischenstandstafel auf dem Fernseher.</p><div class="tool-row">${button('🏆 '+teamName('blue')+' gewinnt','award','btn blue-btn',`data-game="${g}" data-team="blue"`)}${button('🏆 '+teamName('orange')+' gewinnt','award','btn orange-btn',`data-game="${g}" data-team="orange"`)}</div>${state.results[g]?`<div class="info-line">Gewertet: ${esc(state.results[g]==='tie'?'Unentschieden':teamName(state.results[g]))}. ${button('Wertung zurücknehmen','undo-award','btn ghost small',`data-game="${g}"`)}</div>`:''}</div>`}
function timerBox(){return `<div class="card timer-card"><h3>Countdown & Soundboard</h3><div class="clock" data-clock>${formatTime(state.timerEnd)}</div><div class="tool-row">${[10,30,60,120].map(n=>button(n+' s','timer','btn ghost',`data-seconds="${n}"`)).join('')}${button('Stop','timer-stop','btn danger')}</div><div class="tool-row">${button('♪ Intro','jingle','btn secondary',`data-sound="jingle"`)}${button('✓ Erfolg','jingle','btn secondary',`data-sound="correct"`)}${button('✕ Fehler','jingle','btn secondary',`data-sound="wrong"`)}${button('🏆 Sieger','jingle','btn secondary',`data-sound="winner"`)}${button('✦ Enthüllung','jingle','btn secondary',`data-sound="reveal"`)}${button('⚡ Spannung','jingle','btn secondary',`data-sound="suspense"`)}${button('⏱ Zeit abgelaufen','jingle','btn secondary',`data-sound="timeout"`)}</div><p class="muted small">Beim Countdown ertönen automatisch drei Signaltöne (3–2–1) und ein Schluss-Buzzer. Sounds laufen auf deinem Laptop; TV-Ton lässt sich am Fernseher aktivieren.</p></div>`}
function estimatePage(){let d=secret.estimateDraft||{},last=state.estimateLast;return `${quizTools(5)}<div class="card"><h3>Schätzungen & Strafpunkte</h3><p class="muted">Strafpunkte je Team = aufgerundete absolute Abweichung ÷ Strafpunkt-Einheit. Die Einheit kannst du jederzeit ändern; bestehende Runden bleiben unverändert.</p><div class="field"><label>1 Strafpunkt pro X Einheiten Abweichung</label><input type="number" min="0.000001" step="any" data-change="scale" value="${esc(state.estScale)}" /></div><div class="three-fields"><div class="field"><label>Richtiger Wert</label><input type="number" step="any" id="estimate-correct" value="${esc(d.correct)}" /></div><div class="field"><label>${esc(teamName('blue'))}</label><input type="number" step="any" id="estimate-blue" value="${esc(d.blue)}"/></div><div class="field"><label>${esc(teamName('orange'))}</label><input type="number" step="any" id="estimate-orange" value="${esc(d.orange)}"/></div></div>${button('Differenz berechnen + Strafpunkte addieren','calc-estimate','btn primary')}
${last?`<div class="result-grid">${['blue','orange'].map(t=>`<div class="result-cell"><span>${esc(teamName(t))}</span><b>Abweichung: ${money(last.deviation[t])}</b><p>Diese Runde: +${last.penalties[t]} Strafpunkte</p></div>`).join('')}</div>`:''}<div class="mini-scores">${['blue','orange'].map(t=>`<div class="mini-score ${t}"><span>${esc(teamName(t))} · Strafpunkte</span><b>${money(state.estimatePenalties[t])}</b></div>`).join('')}</div></div>${last?button('Letzte Strafpunktrunde zurücknehmen','undo-estimate','btn ghost small'):''}${winnerControls(5)}`}
function timingPage(){return `<div class="card"><h3>Sechs Treffer in aufsteigender Reihenfolge</h3><p class="muted">Pro Team nacheinander: Tennisball ohne Aufprall (0×), mit 1×, 2×, 3×, 4× und schließlich 5× Bodenkontakt in den Becher treffen.</p><div class="timing-grid">${['blue','orange'].map(t=>`<div class="timing-team ${t}"><strong>${esc(teamName(t))}</strong><div class="bounces">${[0,1,2,3,4,5].map(n=>`<span class="bounce ${(state.timing[t]??-1)>=n?'hit':''}">${n}×</span>`).join('')}</div><h3>${state.timing[t]===5?'GESCHAFFT!':`Nächstes Ziel: ${(state.timing[t]??-1)+1}×`}</h3><div class="tool-row">${button('− Korrigieren','bounce-back','btn ghost',`data-team="${t}"`)}${button('✓ Treffer','bounce','btn primary',`data-team="${t}"`)}</div></div>`).join('')}</div></div>${winnerControls(6)}`}
function wagerPage(){return `<div class="card"><h3>Alles auf vier Antworten</h3><p class="muted">Die Punktestände beim Spielstart werden eingefroren. Jedes Team verteilt exakt alle vorhandenen Punkte auf A, B, C und D. Auf dem Fernseher bleiben die Einsätze bis zur Auflösung verborgen.</p><div class="mini-scores">${['blue','orange'].map(t=>`<div class="mini-score ${t}"><span>${esc(teamName(t))} · Einsatz</span><b>${money((state.wagerBase||state.points)[t])}</b></div>`).join('')}</div></div>${quizTools(8)}<div class="card"><h3>Einsatzannahme</h3><p class="muted">Per Handy: genau eine gemeinsame Abgabe je Team. Alternativ trägst du die vier Einsätze hier ein.</p>${['blue','orange'].map(t=>{let bet=wagers[t],values=bet?[bet.a,bet.b,bet.c,bet.d]:secret.manualWagers[t];return `<div class="bet-team"><h4>${esc(teamName(t))} ${bet?badge('Vom Handy eingegangen'):badge('Manuell')}</h4><div class="bet-inputs">${choicesLetters.map((l,i)=>`<label>${l}<input type="number" min="0" step="1" data-wager="${t}" data-index="${i}" value="${esc(values[i])}" ${bet?'disabled':''}></label>`).join('')}</div><p class="muted small">Summe: ${values.reduce((a,b)=>a+Number(b||0),0)} / ${(state.wagerBase||state.points)[t]}</p></div>`}).join('')}${button('🔒 Auflösung & Punktevergabe','apply-wager','btn primary',state.wagerResult?'disabled':'')}<div class="info-line">Die ursprünglichen Gesamtpunkte werden durch die richtig gesetzten Punkte ersetzt. Zusätzlich gibt es den 8-Punkte-Spielbonus (bei Gleichstand je 4). Diese Regel ist bewusst konfigurationsfrei, damit während der Show kein Fehler passiert.</div>${state.wagerResult?`<div class="wager-results">${['blue','orange'].map(t=>`<div><b>${esc(teamName(t))}</b>: ${state.wagerResult.retained[t]} behalten + ${state.wagerResult.bonus[t]} Bonus = ${state.points[t]} Punkte</div>`).join('')}</div>${button('Wettwertung zurücknehmen','undo-wager','btn ghost small')}</div>`:''}</div>`}
function finalePage(){return `<div class="card"><h3>Sammelkarten-Finale</h3><p class="muted">Wähle eine Kategorie frei, zeige eine Frage oder Aufgabe und markiere die erledigte Kategorie für das erfolgreiche Team. Wer zuerst alle sieben sammelt, gewinnt die 9 Punkte.</p><div class="final-grid">${['blue','orange'].map(t=>`<div class="final-team ${t}"><strong>${esc(teamName(t))} · ${finalCount(state.finalCards[t])}/${finals.length}</strong>${finals.map(cat=>`<button class="collect-card ${(state.finalCards[t]||[]).includes(cat)?'collected':''} ${state.finalCategory===cat?'current':''}" data-act="final-card" data-team="${t}" data-category="${esc(cat)}"><span>${(state.finalCards[t]||[]).includes(cat)?'✓':'○'}</span>${esc(cat)}</button>`).join('')}</div>`).join('')}</div></div>${quizTools(9)}${state.results[9]?`<div class="info-line">Finale entschieden: ${esc(teamName(state.results[9]))}. ${button('Wertung zurücknehmen','undo-award','btn ghost small',`data-game="9"`)}</div>`:''}`}
function gamePage(g){if(g===8&&!state.wagerBase){/* initialized during navigation */}return `<div class="eyebrow">SPIEL ${g} / 9 · ${g} PUNKTE</div><h1>${esc(titles[g])}</h1><p class="lead">${esc(desc[g])}</p><div class="game-layout"><section class="stack">${g===1||g===2||g===3?`${quizTools(g)}${g===3?musicTools():''}${scoreControls(g,{1:9,2:5,3:7}[g],g!==2)}${winnerControls(g)}`:''}${g===4||g===7?`<div class="card"><h3>Outdoor-Modus</h3><p>Hierfür benötigst du keine zusätzliche Bildschirmfunktion. Ihr spielt auf dem Gelände; nach dem Duell trägst du lediglich das Ergebnis ein.</p></div>${winnerControls(g)}`:''}${g===5?estimatePage():''}${g===6?timingPage():''}${g===8?wagerPage():''}${g===9?finalePage():''}</section><aside>${timerBox()}<div class="card"><h3>Regie / TV</h3>${button('📺 Dieses Spiel anzeigen','show-game','btn primary full')}${button('📊 Gesamtstand einblenden','show-break','btn secondary full')}${button('🎬 Punkte-Regeln zeigen','show-intro','btn ghost full')}<div class="info-line">TV-Anzeige: ${esc(state.screen)}</div></div></aside></div>`}
function settingsPage(){return `<div class="eyebrow">SETUP</div><h1>Studio-Einstellungen</h1><div class="card"><h3>Teams & Raum</h3><div class="two-col"><div class="field"><label>Name für Team Blau</label><input id="name-blue" value="${esc(teamName('blue'))}"/></div><div class="field"><label>Name für Team Orange</label><input id="name-orange" value="${esc(teamName('orange'))}"/></div></div>${button('Teamnamen speichern','team-names','btn primary')}<p class="muted">Teile die Links direkt. Die gemeinsame Spielkennung ist bereits in ihnen enthalten.</p><div class="link-copy"><input readonly value="${esc(link('player'))}"/>${button('Link kopieren','copy-player','btn secondary')}</div><div class="link-copy"><input readonly value="${esc(link('tv'))}"/>${button('TV-Link kopieren','copy-tv','btn secondary')}</div></div>${soundStudio()}<div class="card"><h3>Spielstand & Sicherheit</h3>${pointsHtml(true)}<div class="tool-row">${['blue','orange'].map(t=>`${button(teamName(t)+' +1','total-plus','btn ghost',`data-team="${t}"`)}${button('−1','total-minus','btn ghost',`data-team="${t}"`)}`).join('')}</div><div class="tool-row">${button('Spielstand als JSON herunterladen','export','btn secondary')}<label class="btn secondary file-label">JSON-Sicherung einlesen<input type="file" accept="application/json,.json" id="import-file" hidden></label>${button('Show komplett zurücksetzen','reset','btn danger')}</div><div class="info-line">Ein Reset löscht den aktuellen Gesamtstand, nicht aber deine gespeicherten Fragen und Lösungen. Für ein neues Turnier können die Fragen erhalten bleiben.</div></div><div class="card"><h3>Verbundene Spieler</h3><p class="muted">Die Teilnehmer melden sich auf ihrem Handy mit Namen und Team an.</p>${Object.entries(players).length?Object.entries(players).map(([uid,p])=>`<div class="draw-person"><span>${esc(p.name)}</span>${badge(teamName(p.team))}</div>`).join(''):'<p>Noch keine Teilnehmer registriert.</p>'}</div>`}
function breakPage(){return `<div class="eyebrow">ZWISCHENSTAND</div><h1>Die Gesamtwertung</h1>${pointsHtml()}${progressHtml()}<div class="card"><h3>Bereits abgeschlossene Spiele</h3>${Object.entries(state.results).length?Object.entries(state.results).sort((a,b)=>+a[0]-+b[0]).map(([g,t])=>`<div class="result-row"><span>Spiel ${g} · ${esc(titles[g])}</span><b>${esc(t==='tie'?'Unentschieden':teamName(t))}</b></div>`).join(''):'<p class="muted">Die Show kann beginnen.</p>'}</div>`}
function host(){const locked=mode==='firebase'&&(!user||user.isAnonymous);if(locked)return shell(`<main class="auth-screen"><div class="card auth-card"><div class="eyebrow">MODERATOR-ZUGANG</div><h1>Willkommen im Studio.</h1><p class="muted">Mit dem E-Mail/Passwort-Konto anmelden, das du in Firebase Authentication angelegt hast. Die Datenbank-Regeln müssen auf dessen UID eingeschränkt sein.</p><form id="login-form"><label>E-Mail</label><input name="email" type="email" required placeholder="moderator@example.com"/><label>Passwort</label><input name="password" type="password" required/><button class="btn primary full" type="submit">Regie öffnen</button></form><p class="muted small">Spieler öffnen nur den Spieler-Link – dafür ist kein Passwort nötig.</p></div></main>`);
 if(!state||!secret)return shell('<main class="auth-screen"><div class="card auth-card"><h1>Showstudio wird eingerichtet …</h1><p>Verbindung zur Datenbank und geschützte Moderatorfragen werden geladen.</p></div></main>');
 const sidebar=`<aside class="sidebar"><div class="nav-group">SHOW</div>${[['start','🎬','Einführung'],['teams','🎯','Teams auslosen'],['break','📊','Gesamtstand']].map(([key,icon,label])=>`<button class="nav-item ${nav===key?'active':''}" data-nav="${key}"><span>${icon}</span>${label}</button>`).join('')}<div class="nav-group">SPIELE</div>${titles.slice(1).map((title,i)=>`<button class="nav-item ${nav==='game'+(i+1)?'active':''}" data-nav="game${i+1}"><span class="nav-number">${i+1}</span><span>${esc(title)}</span>${state.results[i+1]?'<span class="check">✓</span>':''}</button>`).join('')}<div class="nav-group">STUDIO</div>${[['editor','✏️','Fragenstudio'],['settings','⚙️','Einstellungen']].map(([key,icon,label])=>`<button class="nav-item ${nav===key?'active':''}" data-nav="${key}"><span>${icon}</span>${label}</button>`).join('')}</aside>`;
 let content=nav==='start'?intro():nav==='teams'?drawPage():nav==='break'?breakPage():nav==='editor'?editor():nav==='settings'?settingsPage():nav.startsWith('game')?gamePage(Number(nav.slice(4))):intro();return shell(`<div class="workspace">${sidebar}<main class="main"><div class="main-top"><span class="eyebrow">MODERATION / REGIE</span><div class="top-actions"><a class="btn ghost small" href="${link('tv')}" target="_blank">▣ TV öffnen ↗</a><a class="btn ghost small" href="${link('player')}" target="_blank">▤ Handy testen ↗</a></div></div>${err?`<div class="error-banner">${esc(err)}</div>`:''}${content}</main></div>`)}
// TV displays only the current challenge result during a category.
// The accumulated tournament total is deliberately reserved for the breaks.
function tvGameScore(){
  const g=state.activeGame;
  if(g===4||g===7)return '';
  const label=({5:'STRAFPUNKTE',6:'TREFFER',8:'EINSATZ',9:'SAMMELKARTEN'})[g]||'SPIELPUNKTE';
  const value=t=>g===5?state.estimatePenalties[t]
    :g===6?Math.max(0,(state.timing[t]??-1)+1)
    :g===8?(state.wagerResult?state.wagerResult.retained[t]:(state.wagerBase?.[t]??0))
    :g===9?finalCount(state.finalCards[t])
    :(state.scores[t]||0);
  return `<div class="tv-game-scores"><span>${label}</span><div class="tv-game-score-line"><span>${esc(teamName('blue'))}</span><b>${value('blue')}</b><em>:</em><b>${value('orange')}</b><span>${esc(teamName('orange'))}</span></div></div>`;
}
function tv(){if(!state)return shell(`<main class="tv-container"><h1>STUDIO WIRD VERBUNDEN …</h1><p>Öffne zuerst die Moderationsansicht.</p></main>`);
 const headline=state.screen==='intro'?'NEUN SPIELE · EIN SIEGER':state.screen==='teams'?'DIE TEAMS WERDEN GELOST':state.screen==='break'?'DIE GESAMTWERTUNG':`SPIEL ${state.activeGame} VON 9`;
 const second=state.screen==='intro'?introTV():state.screen==='teams'?`<div class="tv-center">${wheel()}<h2>${state.wheelSpinning?'Das Glücksrad dreht sich!':esc(state.wheelCategory||'Wer kennt die Antwort?')}</h2>${state.prompt?`<p class="tv-prompt">${esc(state.prompt)}</p>`:''}${state.answerRevealed?`<div class="tv-reveal">Lösung: ${esc(state.shownAnswer)}</div>`:''}${state.drawFeedback?`<div class="draw-feedback ${state.drawFeedback}">${state.drawFeedback==='right'?'✓ RICHTIG':`✕ FALSCH · ${esc(state.drawFeedbackName)}`}</div>`:''}<div class="tv-teams">${['blue','orange'].map(t=>`<div class="tv-teamlist"><b>${esc(teamName(t))} · ${state.teams[t].length}</b><p>${esc(state.teams[t].join(' · ')||'Noch nicht besetzt')}</p></div>`).join('')}</div></div>`:state.screen==='break'?`<div class="tv-results">${Object.entries(state.results).length?`<div class="last-result">Letztes Spiel: ${esc(titles[Object.keys(state.results).at(-1)])}</div>`:''}<h2>ZWISCHENSTAND</h2></div>`:tvGame();
 return shell(`<main class="tv-container"><div class="tv-overline">MÁLAGA GAMES</div><div class="tv-kicker">${headline}</div>${second}<div class="tv-score-zone">${state.screen==='game'?tvGameScore():pointsHtml()}${progressHtml()}</div>${state.timerEnd>Date.now()?`<div class="tv-timer" data-clock>${formatTime(state.timerEnd)}</div>`:''}<footer class="tv-footer"><span>THE FINCA SHOW · 2026</span><button data-act="tv-sound" class="btn ghost small">${tvSound?'🔊 TON AKTIV':'🔇 TON AKTIVIEREN'}</button></footer></main>`)}
function introTV(){return `<div class="tv-center"><img src="logo.webp" alt="Málaga Games" class="tv-intro-crest"/><h1>9 SPIELE</h1><p class="lead">Jedes Spiel ist einen Punkt mehr wert.</p><div class="tv-ladder">${[1,2,3,4,5,6,7,8,9].map(x=>`<div class="tv-ladder-item"><b>${x}</b><small>SPIEL ${x}</small></div>`).join('')}</div><p class="muted">Spiel 8: Sonderwertung mit Punkteinsatz · Finale: 9 Punkte</p></div>`}
function tvGame(){const g=state.activeGame;let title=esc(titles[g]);let special='';if(g===6)special=`<div class="tv-milestones">${['blue','orange'].map(t=>`<div><h3>${esc(teamName(t))}</h3><div class="bounces">${[0,1,2,3,4,5].map(n=>`<span class="bounce ${(state.timing[t]??-1)>=n?'hit':''}">${n}×</span>`).join('')}</div></div>`).join('')}</div>`;
 if(g===9)special=`<div class="tv-milestones">${['blue','orange'].map(t=>`<div><h3>${esc(teamName(t))}</h3><div class="tv-cards">${finals.map(cat=>`<div class="tv-card ${(state.finalCards[t]||[]).includes(cat)?'hit':''}">${(state.finalCards[t]||[]).includes(cat)?'✓ ':''}${esc(cat)}</div>`).join('')}</div></div>`).join('')}</div>`;
 if(g===5&&state.estimateLast)special=`<div class="tv-estimates">${['blue','orange'].map(t=>`<div>${esc(teamName(t))}<b>Abweichung ${money(state.estimateLast.deviation[t])}</b><small>+${state.estimateLast.penalties[t]} Strafpunkte</small></div>`).join('')}</div>`;
 if(g===8&&state.wagerResult){let r=state.wagerResult;special=`<div class="tv-wager-grid">${['blue','orange'].map(t=>`<div><h3>${esc(teamName(t))}</h3><div class="tv-answers">${choicesLetters.map((l,i)=>`<span class="${i===r.correct?'correct':''}">${l}: ${r.allocations[t][i]}</span>`).join('')}</div><b>${r.retained[t]} behalten + ${r.bonus[t]} Bonus</b></div>`).join('')}</div>`;}
 return `<div class="tv-center"><div class="tv-title">${title}</div><div class="tv-prompt">${esc(state.prompt||desc[g])}</div>${state.options?.length?`<div class="tv-options">${state.options.map((x,i)=>`<div class="tv-option ${state.answerRevealed&&choicesLetters[i]===state.shownAnswer?'right':''}"><b>${choicesLetters[i]}</b>${esc(x)}</div>`).join('')}</div>`:''}${state.answerRevealed?`<div class="tv-reveal">✓ LÖSUNG: ${esc(state.shownAnswer)}</div>`:''}${special}${buzz?`<div class="tv-buzz">⚡ ${esc(buzz.name||teamName(buzz.team))} hat gebuzzert!</div>`:''}${state.answerOpen?`<div class="tv-live-hint">📱 Handy-Antworten sind freigeschaltet</div>`:''}</div>`}
function player(){if(!state)return shell(`<main class="phone-shell"><div class="card"><h1>Verbinde mit der Show …</h1><p class="muted">Die Moderation muss das Studio zuerst starten.</p></div></main>`);
 const joined=mode==='demo'?demoPlayerJoined:!!me;
 if(!joined)return shell(`<main class="phone-shell"><div class="phone-head"><img src="logo.webp"/><div><span class="eyebrow">MÁLAGA GAMES</span><h1>Mitspielen</h1></div></div><div class="card"><h3>Willkommen in der Arena.</h3><p class="muted">Wähle deinen Namen und das Team, dem du nach der Auslosung zugeteilt wurdest.</p><form id="join-form"><div class="field"><label>Dein Vorname</label><input name="name" maxlength="35" value="${esc(playerName)}" required placeholder="Vorname"/></div><div class="field"><label>Dein Team</label><select name="team"><option value="blue" ${playerTeam==='blue'?'selected':''}>${esc(teamName('blue'))}</option><option value="orange" ${playerTeam==='orange'?'selected':''}>${esc(teamName('orange'))}</option></select></div><button type="submit" class="btn primary full">Show beitreten →</button></form></div></main>`);
 const g=state.activeGame;const needBet=g===8;const myBet=playerWager;return shell(`<main class="phone-shell"><div class="phone-head"><img src="logo.webp"/><div><div class="eyebrow">MÁLAGA GAMES · SPIELER</div><h1>Hi, ${esc(playerName||me?.name||'Champion')}!</h1></div></div><div class="phone-team ${playerTeam}"><span>${esc(teamName(playerTeam))}</span><strong>${state.screen==='break'?state.points[playerTeam]+' GESAMTPUNKTE':g===8?(state.wagerBase?.[playerTeam]??0)+' EINSATZ':''}</strong></div><div class="card phone-card"><span class="eyebrow">${g?`SPIEL ${g} / 9`:'SHOWSTART'}</span><h2>${esc(g?titles[g]:'Bereit für die Games?')}</h2><p class="prompt-phone">${esc(state.prompt||'Die Moderation gibt die nächste Aufgabe frei.')}</p>${state.options?.length?`<div class="phone-options">${state.options.map((x,i)=>`<div><b>${choicesLetters[i]}.</b> ${esc(x)}</div>`).join('')}</div>`:''}${state.answerRevealed?`<div class="tv-reveal">Lösung: ${esc(state.shownAnswer)}</div>`:''}</div>${state.buzzOpen?`<button class="giant-buzzer" data-act="player-buzz" ${buzz?'disabled':''}>${buzz?buzz.team===playerTeam?'⚡ BUZZER GESPERRT':'ZU SPÄT!':'🔔 BUZZERN!'}</button>`:`<div class="wait-box">🔒 Buzzer noch nicht freigegeben</div>`}${buzz?`<div class="phone-result">${esc(buzz.name)} hat zuerst gebuzzert (${esc(teamName(buzz.team))}).</div>`:''}${state.answerOpen&&needBet&&!state.wagerResult?`<div class="card"><h3>Setzt eure ${state.wagerBase?.[playerTeam]??0} Punkte</h3><p class="muted">Eine Person darf für euer gesamtes Team antworten. Die Summe muss exakt der Punktzahl entsprechen.</p>${myBet?'<div class="info-line">Euer Einsatz wurde bereits abgeschickt.</div>':`<form id="wager-form"><div class="bet-inputs">${choicesLetters.map(l=>`<label>${l}<input name="${l.toLowerCase()}" type="number" min="0" step="1" value="0" required/></label>`).join('')}</div><button type="submit" class="btn primary full">Einsatz verbindlich abgeben</button></form>`}</div>`:''}${state.answerOpen&&!needBet?`<div class="card"><h3>Antwort abgeben</h3><form id="answer-form">${g===1?`<select name="answer"><option>Wahr</option><option>Falsch</option></select>`:`<input name="answer" maxlength="300" ${g===5?'type="number" step="any"':'type="text"'} required placeholder="Deine Antwort"/>`}<button class="btn primary full" type="submit">Antwort senden</button></form></div>`:''}<p class="phone-footer">Keine App-Installation erforderlich</p></main>`)}
function formatTime(end){if(!end)return '00:00';const rest=Math.max(0,Math.ceil((end-Date.now())/1000));return `${String(Math.floor(rest/60)).padStart(2,'0')}:${String(rest%60).padStart(2,'0')}`}
function render(){const target=e('app');if(!target)return;target.innerHTML=VIEW==='host'?host():VIEW==='tv'?tv():player();renderToast();showSound();}
function changeNav(name){nav=name;if(name.startsWith('game'))gameSelect(Number(name.slice(4)));else if(name==='start')screen('intro');else if(name==='teams')screen('teams');else if(name==='break')screen('break');else render()}

document.addEventListener('click',async ev=>{
 const n=ev.target.closest('[data-nav]');if(n){changeNav(n.dataset.nav);return}
 const b=ev.target.closest('[data-act]');if(!b)return;const a=b.dataset.act,t=b.dataset.team,g=int(b.dataset.game);
 try{
 switch(a){
 case 'wheel':spinWheel();break;
 case 'draw-question':if(state.wheelCategory)nextQuestion(1,drawKey(state.wheelCategory));break;
 case 'draw-prev':if(state.wheelCategory)nextQuestion(-1,drawKey(state.wheelCategory));break;
 case 'draw-editor':editorKey=drawKey(state.wheelCategory||categories[0]);nav='editor';render();break;
 case 'draw-reveal':{if(!state.wheelCategory)break;const key=drawKey(state.wheelCategory),idx=secret.indices[key]??-1;if(idx<0)break;patch({answerRevealed:true,shownAnswer:secret.questions[key]?.[idx]?.answer||'Keine Lösung hinterlegt'});playJingle('reveal');break}
 case 'draw-right':patch({drawFeedback:'right',drawFeedbackName:''});playJingle('correct');notify('Richtig! Die Person bleibt im Rennen.');break;
 case 'draw-wrong':drawWrong();playJingle('wrong');break;
 case 'move-draw':moveDraw(t,int(b.dataset.index));break;
 case 'show-game':screen('game');break;
 case 'show-break':screen('break');break;
 case 'show-intro':screen('intro');break;
 case 'question-next':nextQuestion(1);break;
 case 'question-prev':nextQuestion(-1);break;
 case 'reveal':revealAnswer();break;
 case 'go-editor':editorKey=state.activeGame===9?'9:'+state.finalCategory:String(state.activeGame);nav='editor';render();break;
 case 'toggle-buzz':{const wasOpen=state.buzzOpen;patch({buzzOpen:!wasOpen});if(!wasOpen)transport.clearBuzz();break}
 case 'reset-buzz':await markBuzzerReset();break;
 case 'toggle-answers':{const wasOpen=state.answerOpen;patch({answerOpen:!wasOpen});break}
 case 'right':scoreAnswer(t,true,int(b.dataset.target),b.dataset.wrong==='true');break;
 case 'wrong':scoreAnswer(t,false,int(b.dataset.target),b.dataset.wrong==='true');break;
 case 'minus-score':scoreTeam(t,-1);break;
 case 'award':award(g,t);break;
 case 'undo-award':undoAward(g);break;
 case 'timer':setTimer(int(b.dataset.seconds));break;
 case 'timer-stop':patch({timerEnd:0});break;
 case 'jingle':playJingle(b.dataset.sound);break;
 case 'preview-sound':playSound(b.dataset.sound);break;
 case 'remove-sound':{await removeAudio('cue:'+b.dataset.sound);await reloadAudioAssets();shareAudioChange();notify('Standardton wieder aktiviert.');break}
 case 'preview-song':{const q=secret.questions['3']?.[int(b.dataset.index)],key=audioKeyForSong(q);if(!playFile(key,'song'))notify('Noch keine MP3 gespeichert.');break}
 case 'remove-song':{const questions=structuredClone(secret.questions),q=questions['3']?.[int(b.dataset.index)];if(q){await removeAudio(audioKeyForSong(q));delete q.audioId;priv({questions});await reloadAudioAssets();shareAudioChange();notify('Songdatei entfernt.')}break}
 case 'play-song':{const q=secret.questions['3']?.[secret.indices['3']??0];if(!playFile(audioKeyForSong(q),'song'))notify('Für diese Frage ist keine MP3 hinterlegt.');break}
 case 'stop-song':stopAudio('song');break;

 case 'undo-estimate':{const last=state.estimateLast;if(last)patch({estimatePenalties:{blue:Math.max(0,state.estimatePenalties.blue-last.penalties.blue),orange:Math.max(0,state.estimatePenalties.orange-last.penalties.orange)},estimateLast:null});break}
 case 'undo-wager':{if(!state.wagerResult)break;if(!confirm('Punktewette zurücknehmen und Startpunkte wiederherstellen?'))break;let results={...state.results};delete results[8];patch({points:{...state.wagerBase},wagerResult:null,results,answerRevealed:false,shownAnswer:''});break}
 case 'calc-estimate':{
  let draft={};for(const k of ['correct','blue','orange'])draft[k]=e('estimate-'+k)?.value||'';
  secret.estimateDraft=draft;savePrivate();finishEstimate();break;
 }
 case 'bounce':{const current=state.timing[t]??-1;if(current>=5){notify('Alle sechs Treffer wurden bereits abgehakt.');break}const timing={...state.timing,[t]:current+1};patch({timing});playJingle('correct');break}
 case 'bounce-back':patch({timing:{...state.timing,[t]:Math.max(-1,(state.timing[t]??-1)-1)}});break;
 case 'apply-wager':applyWager();break;
 case 'final-card':recordFinal(t,b.dataset.category);break;
 case 'add-question':{let questions=structuredClone(secret.questions);let q={text:'Neue Frage eingeben …',answer:'Lösung eingeben …'};if(editorKey==='3')q.spotify='';if(editorKey==='8')q.choices=['Antwort A','Antwort B','Antwort C','Antwort D'],q.answer='A';(questions[editorKey]??=[]).push(q);priv({questions});break}
 case 'delete-question':{if(!confirm('Frage löschen?'))break;let questions=structuredClone(secret.questions),q=questions[editorKey]?.[int(b.dataset.index)];if(q?.audioId){await removeAudio(audioKeyForSong(q));await reloadAudioAssets();shareAudioChange()}questions[editorKey].splice(int(b.dataset.index),1);priv({questions});break}
 case 'team-names':patch({teamNames:{blue:e('name-blue').value||'Team Blau',orange:e('name-orange').value||'Team Orange'}});break;
 case 'copy-player':await navigator.clipboard.writeText(link('player'));notify('Spieler-Link kopiert');break;
 case 'copy-tv':await navigator.clipboard.writeText(link('tv'));notify('TV-Link kopiert');break;
 case 'total-plus':patch({points:{...state.points,[t]:state.points[t]+1}});break;
 case 'total-minus':patch({points:{...state.points,[t]:Math.max(0,state.points[t]-1)}});break;
 case 'reset':if(confirm('Gesamte Show zurücksetzen? Fragen bleiben erhalten.')){patch(makeState());transport.clearBuzz();transport.clearWagers();transport.clearSubmissions();nav='start';render()}break;
 case 'export':{const data=JSON.stringify({show:state,questions:secret,exportedAt:new Date().toISOString()},null,2);const blob=new Blob([data],{type:'application/json'});let u=URL.createObjectURL(blob);let a=document.createElement('a');a.href=u;a.download=`malaga-games-${ROOM}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);break}
 case 'player-buzz':{const ok=await transport.buzz(playerTeam,playerName||me?.name||'Spieler');notify(ok?'Du hast gebuzzert!':'Ein anderes Team war schneller.');break}
 case 'tv-sound':tvSound=!tvSound;if(tvSound)playJingle('start',false);render();break;
 }
 }catch(ex){notify('Aktion fehlgeschlagen: '+ex.message)}
});

document.addEventListener('change',ev=>{
 const el=ev.target;
 try{
 if(el.dataset.soundFile && el.files?.[0]){
  (async()=>{await saveAudio('cue:'+el.dataset.soundFile,el.files[0]);await reloadAudioAssets();shareAudioChange();notify('MP3-Jingle gespeichert: '+el.files[0].name)})().catch(ex=>notify('MP3 nicht gespeichert: '+ex.message));return;
 }
 if(el.dataset.songFile!==undefined && el.files?.[0]){
  (async()=>{
   const index=int(el.dataset.songFile),questions=structuredClone(secret.questions),q=questions['3']?.[index];
   if(!q)throw Error('Songfrage nicht gefunden.');
   q.audioId=q.audioId||('audio-'+(globalThis.crypto?.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2)));
   await saveAudio(audioKeyForSong(q),el.files[0]);priv({questions});await reloadAudioAssets();shareAudioChange();notify('Song-MP3 lokal gespeichert.');
  })().catch(ex=>notify('Song nicht gespeichert: '+ex.message));return;
 }
 if(el.id==='import-file'&&el.files?.[0]){const file=el.files[0];file.text().then(async raw=>{const data=JSON.parse(raw);if(!data.show?.points||!data.questions?.questions)throw Error('Keine gültige Sicherungsdatei');if(!confirm('Gesamten Spielstand und Fragen aus Sicherung wiederherstellen?'))return;state=normalizeState(data.show);secret=normalizeSecret(data.questions);await savePrivate();await savePublic();render();notify('Sicherung wiederhergestellt')}).catch(ex=>notify('Import nicht möglich: '+ex.message));return}
 if(el.dataset.change==='editor-key'){editorKey=el.value;render();return}
 if(el.dataset.change==='move-archived'&&el.value){
  const i=int(el.dataset.index),origin=editorKey,dest=el.value;
  const allowed=origin==='teams'?categories.map(drawKey):finals.map(c=>'9:'+c);
  if(!allowed.includes(dest)||!secret.questions[origin]?.[i])throw Error('Ungültige Zielkategorie.');
  const questions=structuredClone(secret.questions),[question]=questions[origin].splice(i,1);
  (questions[dest]??=[]).push(question);
  priv({questions});notify('Frage nach '+dest.replace(/^teams:|^9:/,'')+' verschoben.');return;
 }
 if(el.dataset.change==='final-category'){patch({finalCategory:el.value,prompt:'',questionKey:'',answerRevealed:false,shownAnswer:''});return}
 if(el.dataset.change==='scale'){let val=Number(el.value);if(val>0)patch({estScale:val});else notify('Einheit muss positiv sein.');return}
 if(el.dataset.qfield){const i=int(el.dataset.index),key=editorKey;const questions=structuredClone(secret.questions);if(!questions[key]?.[i])return;questions[key][i][el.dataset.qfield]=el.dataset.qfield==='choices'?el.value.split('\n').map(x=>x.trim()).slice(0,4):el.value;priv({questions});return}
 if(el.dataset.wager){const team=el.dataset.wager,idx=int(el.dataset.index),draft=structuredClone(secret.manualWagers);draft[team][idx]=Math.max(0,int(el.value));priv({manualWagers:draft});return}
 }catch(ex){notify(ex.message)}
});

document.addEventListener('submit',async ev=>{
 if(!['join-form','login-form','answer-form','wager-form'].includes(ev.target.id))return;
 ev.preventDefault();const form=ev.target;
 try{
 if(form.id==='login-form'){
  let fd=new FormData(form);await transport.login(fd.get('email'),fd.get('password'));notify('Angemeldet.');return;
 }
 if(form.id==='join-form'){
  let fd=new FormData(form);playerName=String(fd.get('name')).trim();playerTeam=fd.get('team');
  if(!playerName)throw Error('Bitte Vorname eintragen.');localStorage.setItem(`mg:${ROOM}:name`,playerName);localStorage.setItem(`mg:${ROOM}:team`,playerTeam);
  await transport.join(playerName,playerTeam);demoPlayerJoined=true;me={name:playerName,team:playerTeam};render();notify('Du bist dabei!');return;
 }
 if(form.id==='answer-form'){
  let v=String(new FormData(form).get('answer')||'').trim();if(!v)throw Error('Antwort eingeben.');await transport.submit(v,state.questionKey,playerTeam);notify('Antwort erfolgreich gesendet.');return;
 }
 if(form.id==='wager-form'){
  let f=new FormData(form),v=Object.fromEntries(choicesLetters.map(l=>[l.toLowerCase(),Number(f.get(l.toLowerCase()))]));
  if(Object.values(v).some(n=>!Number.isInteger(n)||n<0))throw Error('Nur ganze positive Zahlen erlaubt.');
  let sum=Object.values(v).reduce((a,b)=>a+b,0),base=state.wagerBase?.[playerTeam];
  if(sum!==base)throw Error(`Ihr müsst exakt ${base} Punkte verteilen (aktuell ${sum}).`);
  await transport.wager(playerTeam,v);playerWager=v;render();notify('Einsatz gesendet – viel Glück!');return;
 }
 }catch(ex){notify('Fehler: '+ex.message)}
});

function incoming(event){
 mode=event.mode||mode;
 if(event.type==='sync'){
  if(event.public)state=normalizeState(event.public);else if(VIEW==='host'){state=makeState();transport.putPublic(state)}
  if(event.private)secret=normalizeSecret(event.private);else if(VIEW==='host'){secret=makeSecret();transport.putPrivate(secret)}
  players=event.players||{};submissions=event.submissions||{};wagers=event.wagers||{};buzz=event.buzz;
  if(VIEW==='player'&&demoPlayerJoined)me=players.local||me;
 } else if(event.type==='auth'){user=event.value;
 } else if(event.type==='public'){state=normalizeState(event.value);if(!state&&VIEW==='host'&&user&&!user.isAnonymous){state=makeState();transport.putPublic(state)}}
 else if(event.type==='hostState'){secret=event.value?normalizeSecret(event.value):null;if(!secret&&VIEW==='host'&&user&&!user.isAnonymous){secret=makeSecret();transport.putPrivate(secret)}}
 else if(event.type==='players'){players=event.value||{}}
 else if(event.type==='submissions'){submissions=event.value||{}}
 else if(event.type==='wagers'){wagers=event.value||{}}
 else if(event.type==='buzz'){buzz=event.value}
 else if(event.type==='me'){me=event.value;if(me){playerName=me.name;playerTeam=me.team}}
 else if(event.type==='myWager'){playerWager=event.value}
 else if(event.type==='error'){err=String(event.value||'Unbekannter Fehler');notify(err)}
 if(VIEW==='host'&&state&&!secret){secret=makeSecret();}
 if(VIEW==='host'&&secret&&transport?.putPrivate){
  const original=event.type==='sync'?event.private:event.type==='hostState'?event.value:null;
  if(original&&original!==secret)transport.putPrivate(secret).catch(ex=>notify('Fragenmigration: '+ex.message));
 }
 render();
}

const launch=async()=>{
 try{await reloadAudioAssets();
  if(typeof BroadcastChannel!=='undefined'){mediaChannel=new BroadcastChannel('mg-local-audio');mediaChannel.onmessage=()=>reloadAudioAssets()}
  transport=await createTransport(ROOM,incoming);mode=transport.mode;
  if(mode==='demo')document.title+=' · Demo';
  render();
 }catch(ex){document.getElementById('app').innerHTML=`<main class="auth-screen"><div class="card auth-card"><h1>Verbindung fehlgeschlagen</h1><p>${esc(ex.message)}</p><p>Kontrolliere die Firebase-Konfiguration, deine Internetverbindung oder starte die App ohne Konfiguration im Demomodus.</p></div></main>`}
};
setInterval(updateCountdown,120);
launch();
