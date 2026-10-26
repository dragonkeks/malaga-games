/** One backend for all three screens. Local demo uses localStorage/BroadcastChannel;
 * Firebase mode authenticates participants anonymously and the moderator by email/password. */
export async function createTransport(room, callback) {
  const config = window.MALAGA_FIREBASE_CONFIG || {};
  const firebaseEnabled = !!(config.apiKey && config.projectId && config.databaseURL && config.appId);
  const localKey = `malagagames:${room}:`;
  if (!firebaseEnabled) {
    const listeners = [];
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('malaga-'+room) : null;
    const read = kind => { try { return JSON.parse(localStorage.getItem(localKey + kind) || 'null'); } catch { return null; } };
    const report = () => callback({type:'sync', public:read('public'), private:read('private'), players:read('players')||{}, submissions:read('submissions')||{}, wagers:read('wagers')||{}, buzz:read('buzz')||null, mode:'demo', user:{uid:'local'}});
    const put = async (kind, value) => { localStorage.setItem(localKey + kind, JSON.stringify(value)); report(); channel?.postMessage('update'); };
    if (channel) channel.onmessage = report;
    window.addEventListener('storage', report);
    setTimeout(report, 0);
    return {
      mode:'demo', login:async()=>true, logout:async()=>true,
      putPublic:x=>put('public',x), putPrivate:x=>put('private',x),
      join:async(name,team)=>{const all=read('players')||{};all.local={name,team};await put('players',all);return 'local';},
      submit:async(value,questionKey,team)=>{let all=read('submissions')||{}; all.local={value:String(value),questionKey,team};await put('submissions',all);},
      wager:async(team,bet)=>{let all=read('wagers')||{};all[team]=bet;await put('wagers',all);},
      buzz:async(team,name)=>{if (read('buzz')) return false;await put('buzz',{uid:'local',team,name,at:Date.now()});return true;},
      clearBuzz:()=>put('buzz',null),clearSubmissions:()=>put('submissions',{}),clearWagers:()=>put('wagers',{}),
      close:()=>{channel?.close();window.removeEventListener('storage',report);listeners.forEach(fn=>fn());}
    };
  }
  const ver='11.10.0';
  const [{initializeApp},authFns,dbFns] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${ver}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${ver}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${ver}/firebase-database.js`)
  ]);
  const app=initializeApp(config), auth=authFns.getAuth(app), db=dbFns.getDatabase(app);
  let user=null, stops=[];
  const base=`rooms/${room}`;
  const r=(child)=>dbFns.ref(db,`${base}/${child}`);
  const emit = (kind,value)=>callback({type:kind,value,mode:'firebase',user});
  const subscribe=()=>{
    stops.forEach(fn=>fn()); stops=[];
    if(!user)return;
    stops.push(dbFns.onValue(r('publicState'),s=>emit('public',s.val()),e=>emit('error',e.message)));
    stops.push(dbFns.onValue(r('buzz'),s=>emit('buzz',s.val()),e=>emit('error',e.message)));
    const isMod=!user.isAnonymous && user.email;
    if(isMod){
      for(const kind of ['hostState','players','submissions','wagers']) {
        stops.push(dbFns.onValue(r(kind),s=>emit(kind,s.val()),e=>emit('error',e.message)));
      }
    } else {
      stops.push(dbFns.onValue(r(`players/${user.uid}`),s=>{emit('me',s.val());if(s.val()?.team){stops.push(dbFns.onValue(r(`wagers/${s.val().team}`),w=>emit('myWager',w.val())));}}));
      stops.push(dbFns.onValue(r(`submissions/${user.uid}`),s=>emit('mySubmission',s.val())));
    }
  };
  authFns.onAuthStateChanged(auth, async u => {
    user=u;
    if(!u){try{await authFns.signInAnonymously(auth)}catch(e){emit('error',`Anonyme Anmeldung: ${e.message}`)}return;}
    emit('auth',{uid:u.uid,email:u.email,isAnonymous:u.isAnonymous});subscribe();
  });
  return {
    mode:'firebase',
    login:async(email,password)=>{await authFns.signInWithEmailAndPassword(auth,email,password);return true;},
    logout:async()=>{await authFns.signOut(auth);return true;},
    putPublic:x=>dbFns.set(r('publicState'),x),putPrivate:x=>dbFns.set(r('hostState'),x),
    join:async(name,team)=>{
      if(!user)throw Error('Anmeldung läuft. Noch einmal versuchen.');
      if(!user.isAnonymous)throw Error('Für die Spieleransicht bitte einen privaten Browser-Tab öffnen.');
      await dbFns.set(r(`players/${user.uid}`),{name,team});return user.uid;
    },
    submit:async(value,questionKey,team)=>{if(!user)throw Error('Nicht angemeldet');await dbFns.set(r(`submissions/${user.uid}`),{value:String(value),questionKey,team});},
    wager:async(team,bet)=>dbFns.set(r(`wagers/${team}`),bet),
    buzz:async(team,name)=>{
      if(!user)throw Error('Nicht angemeldet');
      const result=await dbFns.runTransaction(r('buzz'),current=>current===null?{uid:user.uid,team,name,at:Date.now()}:undefined,{applyLocally:false});
      return result.committed;
    },
    clearBuzz:()=>dbFns.remove(r('buzz')),clearSubmissions:()=>dbFns.remove(r('submissions')),clearWagers:()=>dbFns.remove(r('wagers')),
    close:()=>stops.forEach(fn=>fn())
  };
}
