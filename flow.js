/* edokriegsmann.de – Flow-Animation: Eingang → Verarbeitung → Ausgang
   Ohne Bibliotheken. Pausiert außerhalb des Sichtbereichs, respektiert "reduced motion". */
(() => {
  const stage = document.querySelector('.flow-stage');
  if (!stage) return;

  // Kopfzeile dunkel, solange die dunkle Bühne darunter liegt
  const header = document.querySelector('header.top'), heroDark = document.querySelector('.hero-dark');
  if (header && heroDark) {
    const hh = () => header.offsetHeight;
    const upd = () => { const r = heroDark.getBoundingClientRect(); header.classList.toggle('on-dark', r.bottom > hh() && r.top <= hh()); };
    addEventListener('scroll', upd, { passive: true }); addEventListener('resize', upd); upd();
  }

  // Reihenfolge bewusst gemischt: Keine Verbindung läuft waagerecht „gerade durch“
  const NODES = {
    in: [['mmwave', 'mm-Wave-Sensor', 'mmWave'], ['bestand', 'Bestand'], ['anruf', 'Anruf'], ['strom', 'Energiepreis'], ['hell', 'Helligkeitssensor', 'Helligkeit'], ['retoure', 'Retoure'], ['email', 'E-Mail']],
    proc: [['mcp', 'MCP'], ['api', 'API'], ['vserver', 'Server'], ['ki', 'KI'], ['webhook', 'Webhook'], ['cloud', 'Cloud']],
    out: [['etikett', 'Etikett'], ['licht', 'Licht'], ['druck', 'Druck'], ['wasch', 'Speicher'], ['beschattung', 'Beschattung'], ['versand', 'Versand'], ['crm', 'CRM-Ticket']],
  };

  // Jede Verbindung so, wie sie technisch tatsächlich läuft.
  // Ausgang optional mit drittem Wert = über welche Verarbeitung er erreicht wird.
  const SCENES = [
    { i: 'anruf',   m: 'Gespräch beendet',   p: ['webhook'],        o: [['druck', 'Gesprächsnotiz']] },                 // Telefonanlage meldet Gesprächsende per Webhook → Drucker
    { i: 'anruf',   m: 'Mailbox · 0:42',     p: ['mcp'],            o: [['crm', 'Ticket angelegt']] },                  // KI-Agent legt per MCP Ticket an
    { i: 'email',   m: 'Bestellung #10482',  p: ['api', 'vserver'], o: [['versand', 'angemeldet', 'api'], ['etikett', 'im Lager gedruckt', 'vserver']] },
    { i: 'email',   m: 'Reklamation',        p: ['ki'],             o: [['crm', 'priorisiert']] },                      // KI klassifiziert
    { i: 'email',   m: 'Newsletter ×14',     p: ['ki'],             o: [['druck', 'Morgenbriefing']] },                  // KI kürzt
    { i: 'email',   m: 'Ersatzteil-Anfrage', p: ['mcp'],            o: [['versand', 'Ersatzteil unterwegs']] },         // KI-Agent nutzt Shop-Tool per MCP
    { i: 'retoure', m: 'Paket gescannt',     p: ['vserver'],        o: [['etikett', 'Lagerplatz B-14']] },              // V-Server druckt Lager-Etikett
    { i: 'retoure', m: 'Schaden gemeldet',   p: ['api'],            o: [['crm', 'Reklamation angelegt']] },             // Retouren-App → CRM-API
    { i: 'bestand', m: '−18 Stk.',           p: ['ki'],             o: [['druck', 'Auftrag: 24 Stk.']] },     // Stückzahl ermitteln, Auftrag drucken
    { i: 'strom',   m: 'Preisspitze',        p: ['cloud'],          o: [['wasch', 'speist ein']] },
    { i: 'strom',   m: '6,1 ct/kWh',         p: ['cloud'],          o: [['wasch', 'lädt']] },                        // Geräte-Cloud
    { i: 'hell',    m: '1.000 lx',           p: ['cloud'],          o: [['beschattung', 'wird geschlossen']] },
    { i: 'hell',    m: 'Dämmerung',          p: ['cloud'],          o: [['licht', 'Außenlicht an']] },
    { i: 'mmwave',  m: 'Person erkannt',     p: ['cloud'],          o: [['licht', 'schaltet ein']] },
  ];

  // ---------- DOM ----------
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const sv = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

  const svg = sv('svg', { class: 'flow-svg', 'aria-hidden': 'true' });
  svg.innerHTML = '<defs><filter id="fxGlow" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="3.2"/></filter>' +
                  '<radialGradient id="fxHead"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="#ffd2b3"/><stop offset="1" stop-color="#ff7a2e" stop-opacity="0"/></radialGradient></defs>';
  const gGhost = sv('g', { class: 'fx-ghost' });
  const gLive = sv('g');
  svg.append(gGhost, gLive);

  const cols = el('div', 'flow-cols');
  const nodeEl = {};
  for (const kind of ['in', 'proc', 'out']) {
    const col = el('div', 'flow-col ' + kind);
    for (const [id, label, short] of NODES[kind]) {
      const n = el('div', 'fx-node ' + kind);
      const l = el('span', 'lbl');
      l.append(el('span', 'l-long', label), el('span', 'l-short', short || label));
      n.append(el('i', 'dot'), l);
      if (kind !== 'proc') { const m = el('span', 'meta'); m.append(el('span', '', '')); n.append(m); }
      col.append(n);
      nodeEl[id] = n;
    }
    cols.append(col);
  }
  stage.append(svg, cols);
  const counterEl = stage.querySelector('[data-flow-count]');
  let counter = 0;

  // ---------- Geometrie ----------
  let A = {}, W = 0, H = 0;
  function layout() {
    const s = stage.getBoundingClientRect();
    W = s.width; H = s.height;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    A = {};
    for (const kind of ['in', 'proc', 'out']) for (const [id] of NODES[kind]) {
      const r = nodeEl[id].getBoundingClientRect();
      const y = r.top - s.top + r.height / 2;
      A[id] = { l: { x: r.left - s.left, y }, r: { x: r.right - s.left, y } };
    }
    // Eingänge wachsen nach links, Ausgänge nach rechts → Ankerpunkte bleiben stabil
    gGhost.replaceChildren();
    const seen = new Set();
    for (const sc of SCENES) for (const [a, b] of edgesOf(sc)) {
      const k = a + b; if (seen.has(k)) continue; seen.add(k);
      gGhost.append(sv('path', { d: curve(A[a].r, A[b].l) }));
    }
  }
  const curve = (a, b) => { const dx = (b.x - a.x) * 0.5; return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`; };
  const edgesOf = sc => [...sc.p.map(p => [sc.i, p]), ...sc.o.flatMap(([o, , via]) => (via ? [via] : sc.p).map(p => [p, o]))];

  // ---------- Ablauf ----------
  const T = { in: 0, s0: 380, d: 820, gap: 620, hold: 2000, fade: 900 };
  T.s1 = T.s0 + T.d + T.gap; T.done = T.s1 + T.d; T.out = T.done + T.hold; T.end = T.out + T.fade;
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  const busy = new Map();
  const use = id => busy.set(id, (busy.get(id) || 0) + 1);
  const free = id => { const n = (busy.get(id) || 1) - 1; n ? busy.set(id, n) : busy.delete(id); };
  const nodesOf = sc => [sc.i, ...sc.p, ...sc.o.map(o => o[0])];

  let flows = [], last = -1, nextAt = 0, liveHold = false;

  function spawn(now, sc) {
    if (!sc) {
      const options = SCENES.map((s, i) => i).filter(i => i !== last && nodesOf(SCENES[i]).every(id => !busy.has(id)));
      if (!options.length) return false;
      last = options[Math.floor(Math.random() * options.length)];
      sc = SCENES[last];
    }
    nodesOf(sc).forEach(use);
    const g = sv('g', { class: 'fx-flow' });
    gLive.append(g);
    const edges = edgesOf(sc).map(([a, b], idx) => {
      const stageNo = idx < sc.p.length ? 0 : 1;
      const d = curve(A[a].r, A[b].l);
      const gid = 'fxg' + Math.random().toString(36).slice(2, 8);
      const grad = sv('linearGradient', { id: gid, gradientUnits: 'userSpaceOnUse', x1: A[a].r.x, y1: 0, x2: A[b].l.x, y2: 0 });
      grad.innerHTML = '<stop offset="0" stop-color="#ff7a2e" stop-opacity=".15"/><stop offset=".6" stop-color="#ff8a45" stop-opacity=".85"/><stop offset="1" stop-color="#ffc59e"/>';
      const glow = sv('path', { d, class: 'fx-glow', stroke: `url(#${gid})`, filter: 'url(#fxGlow)' });
      const line = sv('path', { d, class: 'fx-line', stroke: `url(#${gid})` });
      const trail = sv('path', { d, class: 'fx-trail' });
      const head = sv('circle', { r: 7, fill: 'url(#fxHead)', class: 'fx-head' });
      g.append(grad, glow, line, trail, head);
      const len = line.getTotalLength();
      for (const p of [glow, line]) { p.style.strokeDasharray = len; p.style.strokeDashoffset = len; }
      trail.style.strokeDasharray = `46 ${len + 46}`; trail.style.strokeDashoffset = 46;
      head.style.opacity = 0;
      return { stageNo, line, glow, trail, head, len, b };
    });
    const tt = sc.hold ? { ...T, out: T.out + sc.hold, end: T.end + sc.hold } : T;
    flows.push({ sc, g, edges, t0: now, flags: {}, tt });
    return true;
  }

  function setNode(id, on, meta) {
    const n = nodeEl[id];
    if (meta != null) { const m = n.querySelector('.meta > span'); if (m) m.textContent = meta; }
    n.classList.toggle('on', on);
  }

  function step(f, now) {
    const t = now - f.t0, sc = f.sc, F = f.flags, TT = f.tt || T;
    if (!F.in) { F.in = 1; setNode(sc.i, true, sc.m); }
    for (const e of f.edges) {
      const start = e.stageNo ? T.s1 : T.s0;
      const raw = Math.min(1, Math.max(0, (t - start) / T.d));
      const p = ease(raw);
      const off = e.len * (1 - p);
      e.line.style.strokeDashoffset = off; e.glow.style.strokeDashoffset = off;
      e.trail.style.strokeDashoffset = 46 - p * e.len;
      if (raw > 0 && raw < 1) {
        const pt = e.line.getPointAtLength(p * e.len);
        e.head.setAttribute('cx', pt.x); e.head.setAttribute('cy', pt.y);
        e.head.style.opacity = 1;
      } else e.head.style.opacity = 0;
      if (raw >= 1 && !e.trailDone) { e.trailDone = 1; e.trail.style.opacity = 0; }
    }
    if (!F.think && t >= T.s0 + T.d) { F.think = 1; sc.p.forEach(id => { nodeEl[id].classList.add('think', 'on'); }); }
    if (!F.proc && t >= T.s1 && !sc.keepThink) { F.proc = 1; sc.p.forEach(id => nodeEl[id].classList.remove('think')); }
    if (!F.out && t >= T.done) {
      F.out = 1; sc.o.forEach(([id, m]) => setNode(id, true, '✓ ' + m));
      if (sc.o.length) { counter++; if (counterEl) counterEl.textContent = counter; }
    }
    if (!F.off && t >= TT.out) {
      F.off = 1; f.g.classList.add('fade');
      setTimeout(() => nodesOf(sc).forEach(id => { free(id); if (!busy.has(id)) setNode(id, false); nodeEl[id].classList.remove('think'); }), 250);
    }
    return t < TT.end;
  }

  // ---------- Schleife ----------
  let visible = true, raf = 0;
  function tick(now) {
    raf = requestAnimationFrame(tick);
    if (!visible) return;
    if (now >= nextAt && flows.length < 3 && !liveHold) {
      if (spawn(now)) nextAt = now + 1500 + Math.random() * 900;
      else nextAt = now + 300;
    }
    flows = flows.filter(f => { const alive = step(f, now); if (!alive) f.g.remove(); return alive; });
  }

  function reset() {
    flows.forEach(f => f.g.remove()); flows = []; busy.clear();
    Object.values(nodeEl).forEach(n => n.classList.remove('on', 'think'));
    layout();
  }

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  layout();
  if (reduced) {
    // Ein statischer, vollständig gezeichneter Ablauf
    const now = performance.now();
    spawn(now, SCENES[0]); step(flows[0], now + T.done + 10);
    flows[0].edges.forEach(e => { e.line.style.strokeDashoffset = 0; e.glow.style.strokeDashoffset = 0; e.head.style.opacity = 0; });
    return;
  }

  // ---------- Live: echter Anruf bei der KI-Telefonassistenz ----------
  // Anrufbeginn/-ende kommen über einen n8n-Status-Endpunkt – keine Daten über den Anrufer.
  const liveEl = stage.querySelector('.flow-head .live');
  const liveText = liveEl ? liveEl.lastChild.textContent : '';

  function printLabel(ev) {
    const d = new Date(ev.ts);
    const t = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
    let sec = Number(ev.dauer) || 0;
    if (sec > 4 * 3600) sec = Math.round(sec / 1000);              // sona liefert die Dauer in Millisekunden
    if (ev.start && ev.ts > ev.start) sec = Math.round((ev.ts - ev.start) / 1000);
    const dur = sec ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')} min` : '';
    const lab = el('div', 'fx-label');
    const paper = el('div', 'fx-paper');
    paper.append(el('b', '', 'ANRUF · KI-TELEFON'), el('span', '', t + ' Uhr' + (dur ? ' · ' + dur : '')),
                 el('span', '', 'Zusammenfassung gedruckt'), el('i', 'fx-barcode'));
    lab.append(paper);
    const a = A.druck.l;
    lab.style.left = Math.max(8, Math.min(a.x, W - 208)) + 'px';
    lab.style.top = (a.y + 20) + 'px';
    stage.append(lab);
    requestAnimationFrame(() => requestAnimationFrame(() => lab.classList.add('print')));
    setTimeout(() => lab.classList.add('gone'), 9000);
    setTimeout(() => lab.remove(), 10000);
  }

  function setLiveHead(text) {
    if (!liveEl) return;
    liveEl.lastChild.textContent = text || liveText;
    liveEl.classList.toggle('real', !!text);
  }

  // Gespräch läuft: Anruf → KI bleibt aktiv, Dauer zählt mit
  let call = null;
  // Bühne sofort freiräumen und den echten Anruf in den Fokus stellen
  function clearStage() {
    const now = performance.now();
    for (const f of flows) {
      if (f.flags.off) continue;
      f.g.style.transition = 'opacity .35s ease';
      f.tt = { ...(f.tt || T), out: now - f.t0, end: now - f.t0 + 400 };
    }
  }
  function focusOn(on) { stage.classList.toggle('focus', on); }
  function startCall(start) {
    liveHold = true; setLiveHead('Live · Gespräch läuft');
    clearStage(); focusOn(true);
    const sc = { i: 'anruf', m: 'läuft · 0:00', p: ['ki'], o: [], hold: 36e5, keepThink: true };
    const go = () => {
      if (!call) return;
      if (flows.some(f => !f.flags.off)) return setTimeout(go, 50);
      spawn(performance.now(), sc);
      call.flow = flows[flows.length - 1];
      nodeEl.anruf.classList.add('ring');
    };
    call = { start, timer: setInterval(() => {
      const sec = Math.max(0, Math.round((Date.now() - start) / 1000));
      if (call && call.flow) setNode('anruf', true, `läuft · ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`);
    }, 1000) };
    go();
  }
  function endCall(ev) {
    if (call) {
      clearInterval(call.timer);
      nodeEl.anruf.classList.remove('ring');
      if (call.flow) call.flow.tt = { ...call.flow.tt, out: performance.now() - call.flow.t0, end: performance.now() - call.flow.t0 + T.fade };
      call = null;
    }
    playLive(ev, 'aufgelegt');
  }

  function playLive(ev, label, head) {
    const sc = { i: 'anruf', m: label, p: ['webhook'], o: [['druck', 'Etikett gedruckt']], hold: 6500 };
    liveHold = true; setLiveHead(head || 'Live · echter Anruf');
    clearStage(); focusOn(true);
    const go = () => {
      if (!visible || flows.some(f => !f.flags.off)) return setTimeout(go, 50);
      spawn(performance.now(), sc);
      setTimeout(() => printLabel(ev), T.done);
      setTimeout(() => { liveHold = false; setLiveHead(); focusOn(false); }, T.end + 7000);
    };
    go();
  }

  // Push über ntfy: n8n sendet pro Anruf zwei Nachrichten (Beginn, Ende), die Seite hört mit.
  // Keine Abfrage pro Besucher, keine Daten über den Anrufer – nur Zustand, Zeitpunkt, Dauer.
  const TOPIC = stage.dataset.liveTopic || '';
  const NTFY = 'https://ntfy.sh/' + TOPIC;
  let seen = {};
  try { seen = JSON.parse(sessionStorage.getItem('fxLive') || '{}'); } catch (e) {}
  const remember = () => { try { sessionStorage.setItem('fxLive', JSON.stringify(seen)); } catch (e) {} };

  function parse(msg) {
    try {
      const ev = JSON.parse(msg.message || '');
      if (ev.state === 'call' && Number.isFinite(ev.start)) return ev;
      if (ev.state === 'ended' && Number.isFinite(ev.end)) return ev;
    } catch (e) {}
    return null;
  }
  function handle(ev, initial) {
    const now = Date.now();
    if (ev.state === 'call') {
      if (seen.start === ev.start || now - ev.start > 20 * 60e3) return;
      seen.start = ev.start; remember();
      if (!call) startCall(ev.start);
    } else {
      if (seen.end === ev.end) return;
      seen.end = ev.end; seen.start = ev.start; remember();
      const age = now - ev.end;
      const data = { ts: ev.end, start: ev.start || 0, dauer: ev.dauer };
      if (call) endCall(data);
      else if (!initial && age < 2 * 60e3) playLive(data, 'gerade eben');   // beim Öffnen der Seite keine beendeten Anrufe nachholen
    }
  }

  let es = null;
  function connect() {
    if (es || !TOPIC || !window.EventSource) return;
    es = new EventSource(NTFY + '/sse');
    es.onmessage = e => { try { const m = JSON.parse(e.data); if (m.event === 'message') { const ev = parse(m); if (ev) handle(ev); } } catch (err) {} };
  }
  function disconnect() { if (es) { es.close(); es = null; } }

  async function catchUp() {
    // Beim Öffnen der Seite: letzten Stand der vergangenen 20 Minuten holen (laufendes oder gerade beendetes Gespräch)
    try {
      const r = await fetch(NTFY + '/json?poll=1&since=20m', { cache: 'no-store' });
      if (!r.ok) return;
      const evs = (await r.text()).split('\n').filter(Boolean).map(l => { try { return parse(JSON.parse(l)); } catch (e) { return null; } }).filter(Boolean);
      const lastEv = evs[evs.length - 1];
      if (lastEv) handle(lastEv, true);
    } catch (e) {}
  }

  // Wiederholung des letzten echten Anrufs (höchstens 4 Stunden alt), klar als „Letzter Anruf“ gekennzeichnet.
  // Erstmals nach 45 s, danach zufällig alle 10–30 Minuten, nur bei sichtbarer Bühne und ohne laufendes Gespräch.
  async function lastEnded() {
    try {
      const r = await fetch(NTFY + '/json?poll=1&since=4h', { cache: 'no-store' });
      if (!r.ok) return null;
      const evs = (await r.text()).split('\n').filter(Boolean).map(l => { try { return parse(JSON.parse(l)); } catch (e) { return null; } })
        .filter(ev => ev && ev.state === 'ended' && Date.now() - ev.end < 4 * 3600e3);
      return evs[evs.length - 1] || null;
    } catch (e) { return null; }
  }
  function whenLabel(ts) {
    const d = new Date(ts), now = new Date();
    const t = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
    const day = x => x.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' });
    return (day(d) === day(now) ? 'heute ' : 'gestern ') + t;
  }
  async function replay() {
    if (document.hidden || !visible || call || liveHold) return setTimeout(replay, 15000);
    const ev = await lastEnded();
    if (ev) playLive({ ts: ev.end, start: ev.start || 0, dauer: ev.dauer }, 'zuletzt ' + whenLabel(ev.end), 'Letzter echter Anruf');
    setTimeout(replay, (10 + Math.random() * 20) * 60e3);
  }

  if (/[?&]livetest\b/.test(location.search)) {
    setTimeout(() => startCall(Date.now()), 2000);
    setTimeout(() => endCall({ ts: Date.now(), start: Date.now() - 41000, dauer: 41000 }), 11000);
  } else if (TOPIC) {
    setTimeout(() => { catchUp(); connect(); }, 1200);
    setTimeout(replay, 45000);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) disconnect(); else { catchUp(); connect(); }
    });
  }

  let rz;
  new ResizeObserver(() => { clearTimeout(rz); rz = setTimeout(reset, 120); }).observe(stage);
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; }, { threshold: 0.1 }).observe(stage);
  document.fonts?.ready.then(reset);
  nextAt = performance.now() + 400;
  raf = requestAnimationFrame(tick);
})();
