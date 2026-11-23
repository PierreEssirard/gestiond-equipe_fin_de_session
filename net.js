/* Couche réseau : Firebase Realtime Database si configuré, sinon mode local
   (même navigateur, plusieurs onglets) pour répéter avec des joueurs fictifs. */
import { FIREBASE } from './config.js?v=13';

export async function connect(room) {
  if (FIREBASE) {
    try { return await firebase(room); } catch (e) { console.warn('Firebase indisponible, mode local', e); }
  }
  return local(room);
}

async function firebase(room) {
  const V = '10.12.2';
  const app = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const d = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-database.js`);
  const db = d.getDatabase(app.initializeApp(FIREBASE));
  const R = p => d.ref(db, `rooms/${room}/${p}`);
  const on = (p, cb) => d.onValue(R(p), x => cb(x.val()));
  return {
    mode: 'firebase',
    setState: s => d.set(R('state'), s),
    onState: cb => on('state', cb),
    join: (pid, data) => d.update(R('players/' + pid), data),
    setPlayer: (pid, patch) => d.update(R('players/' + pid), patch),
    setPlayers: map => { const u = {}; for (const [pid, p] of Object.entries(map)) for (const [k, v] of Object.entries(p)) u[`players/${pid}/${k}`] = v; return d.update(R(''), u); },
    removePlayer: pid => d.remove(R('players/' + pid)),
    onPlayers: cb => on('players', v => cb(v || {})),
    onPlayer: (pid, cb) => on('players/' + pid, cb),
    answer: (key, pid, v) => d.set(R(`answers/${key}/${pid}`), { v, t: d.serverTimestamp() }),
    onAnswers: (key, cb) => on('answers/' + key, v => cb(v || {})),
    clearRoom: () => d.remove(d.ref(db, 'rooms/' + room))
  };
}

function local(room) {
  /* Une clé localStorage par chemin : les onglets n'écrasent jamais les écritures des autres. */
  const K = 'choc:' + room + '|';
  let bc = null; try { bc = new BroadcastChannel('choc:' + room); } catch (e) { }
  const mem0 = new Map();
  const ls = {
    get: k => { try { return localStorage.getItem(k); } catch (e) { return mem0.get(k) ?? null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { mem0.set(k, v); } },
    del: k => { try { localStorage.removeItem(k); } catch (e) { mem0.delete(k); } },
    keys: () => { try { return Object.keys(localStorage); } catch (e) { return [...mem0.keys()]; } }
  };
  function tree() {
    const root = {};
    for (const k of ls.keys()) {
      if (!k.startsWith(K)) continue;
      let v; try { v = JSON.parse(ls.get(k)); } catch (e) { continue; }
      const ks = k.slice(K.length).split('/'); let o = root;
      ks.slice(0, -1).forEach(x => { o[x] = (o[x] && typeof o[x] === 'object') ? o[x] : {}; o = o[x]; });
      o[ks[ks.length - 1]] = v;
    }
    return root;
  }
  const subs = new Set();
  const get = (m, p) => p.split('/').reduce((o, k) => (o && typeof o === 'object') ? o[k] : undefined, m);
  let pending = false;
  const notify = () => { if (pending) return; pending = true; setTimeout(() => { pending = false; const m = tree(); subs.forEach(s => { const v = get(m, s.p); s.cb(v === undefined ? null : JSON.parse(JSON.stringify(v))); }); }, 0); };
  if (bc) bc.onmessage = notify;
  addEventListener('storage', e => { if (e.key && e.key.startsWith(K)) notify(); });
  const ping = () => { bc && bc.postMessage(1); notify(); return Promise.resolve(); };
  const write = (p, v, merge) => {
    if (v === null) { for (const k of ls.keys()) if (k === K + p || k.startsWith(K + p + '/')) ls.del(k); return; }
    let cur = null; if (merge) { try { cur = JSON.parse(ls.get(K + p)); } catch (e) { } }
    ls.set(K + p, JSON.stringify(merge ? Object.assign(cur && typeof cur === 'object' ? cur : {}, v) : v));
  };
  const on = (p, cb) => { const s = { p, cb }; subs.add(s); const v = get(tree(), p); cb(v === undefined ? null : v); return () => subs.delete(s); };
  return {
    mode: 'local',
    setState: s => { write('state', s); return ping(); },
    onState: cb => on('state', cb),
    join: (pid, d) => { write('players/' + pid, d, true); return ping(); },
    setPlayer: (pid, d) => { write('players/' + pid, d, true); return ping(); },
    setPlayers: map => { for (const [pid, p] of Object.entries(map)) write('players/' + pid, p, true); return ping(); },
    removePlayer: pid => { write('players/' + pid, null); return ping(); },
    onPlayers: cb => on('players', v => cb(v || {})),
    onPlayer: (pid, cb) => on('players/' + pid, cb),
    answer: (k, pid, v) => { write(`answers/${k}/${pid}`, { v, t: Date.now() }); return ping(); },
    onAnswers: (k, cb) => on('answers/' + k, v => cb(v || {})),
    clearRoom: () => { for (const k of ls.keys()) if (k.startsWith(K)) ls.del(k); return ping(); }
  };
}
