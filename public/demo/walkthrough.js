/**
 * Ticket Forge Unity — Narrated Walkthrough 🎬
 *
 * A "play it like a cassette" demo for showing a coworker how the whole
 * system works. Renders its own fake UI in a fullscreen overlay, narrates
 * each step, types into fake forms, animates real button-clicks, and walks
 * the viewer through Janet Hamburg's full journey: phone call → service
 * ticket → dispatch → invoice.
 *
 * Zero dependencies. Zero network calls. Zero side effects on the real DB.
 * Drop this script on any page and run HamburgWalkthrough.play().
 *
 * Load it:
 *   await import('/demo/walkthrough.js')   // from /demo/ or /dashboard/
 *   // or paste the whole file into F12 console
 *
 * Play it:
 *   HamburgWalkthrough.play()             // full walkthrough
 *   HamburgWalkthrough.play({ speed: 2 }) // double speed
 *   HamburgWalkthrough.stop()             // abort mid-play
 *
 * Shortcuts during playback:
 *   Esc       — stop
 *   Space     — pause/resume
 *   →         — skip to next scene
 *   ←         — previous scene
 */

(function () {
  'use strict';

  // ---------- Configuration ----------

  const SCENES_COUNT = 10;
  const JANET = {
    name: 'JANET HAMBURG',
    phone: '716-555-0101',
    address1: '1 DOOR STREET',
    address2: 'HAMBURG, NY 14075',
    accountId: '12345',
    siteType: 'Residential'
  };
  const ITEMS = [
    { qty: 1, id: 'D200', desc: '16x7 insulated residential door', price: '900.00' },
    { qty: 1, id: 'M500', desc: 'LiftMaster Wi-Fi opener',          price: '350.00' }
  ];

  // ---------- State ----------

  let SPEED = 1;
  let PAUSED = false;
  let ABORT = false;
  let SKIP = 0;               // 1 = skip to next, -1 = restart current
  let CURRENT_SCENE = 0;
  let STAGE = null;           // the fullscreen container

  // ---------- Sleep (pause/abort/skip aware) ----------

  function sleep(ms) {
    return new Promise((resolve, reject) => {
      const ticked = 30;
      let remaining = ms / SPEED;
      (function loop() {
        if (ABORT) return reject(new Error('ABORT'));
        if (SKIP) return resolve();
        if (PAUSED) { setTimeout(loop, 120); return; }
        if (remaining <= 0) return resolve();
        remaining -= ticked;
        setTimeout(loop, ticked);
      })();
    });
  }

  // ---------- Stage (fullscreen overlay with fake UI) ----------

  function mountStage() {
    if (STAGE) return;
    STAGE = document.createElement('div');
    STAGE.id = 'hw-stage';
    STAGE.innerHTML = `
      <style>
        #hw-stage {
          position: fixed; inset: 0; z-index: 2147483647;
          background: radial-gradient(circle at center, #2c2f33, #0d0e10);
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          color: #e8eaed; overflow: hidden;
          animation: hw-fade .5s ease-out;
        }
        @keyframes hw-fade { from { opacity: 0 } to { opacity: 1 } }
        #hw-stage * { box-sizing: border-box; }

        /* Top bar */
        #hw-topbar {
          height: 50px; display: flex; align-items: center; justify-content: space-between;
          padding: 0 20px; background: rgba(0,0,0,.4); border-bottom: 1px solid #3c4043;
        }
        #hw-topbar .hw-logo { font-weight: 900; letter-spacing: 1px; font-size: 14px; }
        #hw-topbar .hw-controls { display: flex; gap: 10px; align-items: center; font-size: 12px; }
        #hw-topbar button {
          background: #3c4043; border: 1px solid #5f6368; color: #e8eaed;
          padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 11px;
          font-family: inherit; font-weight: 600;
        }
        #hw-topbar button:hover { background: #5f6368; }
        #hw-topbar button.hw-danger { background: #d93025; border-color: #a83228; }

        /* Main area */
        #hw-main {
          height: calc(100vh - 50px); display: grid;
          grid-template-columns: 1fr 420px; gap: 20px; padding: 20px;
        }

        /* Fake app panel */
        #hw-app {
          background: white; color: #202124; border-radius: 12px;
          overflow: auto; padding: 30px 40px; position: relative;
          box-shadow: 0 10px 40px rgba(0,0,0,.5);
        }

        /* Narrator panel */
        #hw-narrator {
          background: linear-gradient(180deg, #1a73e8, #1557b0); color: white;
          border-radius: 12px; padding: 24px; display: flex; flex-direction: column;
          box-shadow: 0 10px 40px rgba(26,115,232,.3);
        }
        #hw-narrator .hw-scene-num {
          font-size: 11px; letter-spacing: .15em; text-transform: uppercase;
          opacity: .8; margin-bottom: 8px;
        }
        #hw-narrator .hw-title {
          font-size: 22px; font-weight: 800; line-height: 1.2; margin-bottom: 14px;
        }
        #hw-narrator .hw-caption {
          font-size: 15px; line-height: 1.5; color: rgba(255,255,255,.9);
          flex: 1;
        }
        #hw-narrator .hw-progress {
          margin-top: 16px; height: 4px; background: rgba(255,255,255,.2);
          border-radius: 2px; overflow: hidden;
        }
        #hw-narrator .hw-progress-fill {
          height: 100%; background: #f9ab00; width: 0%;
          transition: width .3s ease;
        }
        #hw-narrator .hw-shortcuts {
          margin-top: 14px; font-size: 11px; opacity: .7; line-height: 1.6;
        }
        #hw-narrator kbd {
          background: rgba(0,0,0,.3); padding: 1px 6px; border-radius: 3px;
          font-family: monospace;
        }

        /* Fake form bits */
        .hw-card {
          background: #f8f9fa; border: 1px solid #dadce0; border-radius: 8px;
          padding: 20px; margin-bottom: 16px;
        }
        .hw-row { display: grid; grid-template-columns: 140px 1fr; gap: 12px; margin-bottom: 10px; align-items: center; }
        .hw-label { font-size: 12px; font-weight: 600; color: #5f6368; text-transform: uppercase; letter-spacing: .05em; }
        .hw-input {
          background: white; border: 1px solid #dadce0; border-radius: 4px;
          padding: 8px 12px; min-height: 36px; font-family: 'IBM Plex Mono', monospace;
          font-size: 13px; color: #202124; transition: all .15s;
        }
        .hw-input.hw-changed { background: #e3f2fd; border-color: #1a73e8; }
        .hw-input.hw-focused { outline: 2px solid #f9ab00; outline-offset: -2px; }

        .hw-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 16px; background: #1a73e8; color: white;
          border: none; border-radius: 6px; font-weight: 600; font-size: 13px;
          cursor: pointer; transition: all .2s; font-family: inherit;
        }
        .hw-btn:hover, .hw-btn.hw-flash { background: #1557b0; transform: scale(1.03); }
        .hw-btn.hw-green { background: #1e8e3e; } .hw-btn.hw-green:hover { background: #137a30; }
        .hw-btn.hw-yellow { background: #f9ab00; color: black; }
        .hw-btn.hw-red { background: #d93025; } .hw-btn.hw-red:hover { background: #a82319; }
        .hw-btn.hw-gray { background: #5f6368; }

        .hw-form-header {
          display: flex; justify-content: space-between; align-items: center;
          border-bottom: 2px solid #202124; padding-bottom: 12px; margin-bottom: 20px;
        }
        .hw-form-title { font-weight: 900; font-size: 18px; letter-spacing: -0.5px; }
        .hw-pill {
          display: inline-block; padding: 3px 10px; border-radius: 12px;
          font-size: 11px; font-weight: 600; letter-spacing: .05em;
        }
        .hw-pill.open { background: #fef7e0; color: #b06000; }
        .hw-pill.scheduled { background: #e3f2fd; color: #1a73e8; }
        .hw-pill.complete { background: #e6f4ea; color: #1e8e3e; }
        .hw-pill.draft { background: #f1f3f4; color: #5f6368; }
        .hw-pill.closed { background: #fce8e6; color: #a82319; }

        /* Dashboard stack */
        .hw-dashboard {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 16px;
        }
        .hw-stack {
          background: white; border: 1px solid #dadce0; border-radius: 10px;
          padding: 16px; min-height: 180px;
          transition: all .3s; cursor: default;
        }
        .hw-stack.hw-flash { border-color: #f9ab00; box-shadow: 0 0 0 3px rgba(249,171,0,.3); }
        .hw-stack-title {
          font-size: 11px; font-weight: 700; color: #1a73e8;
          text-transform: uppercase; letter-spacing: .1em;
          border-bottom: 2px solid #1a73e8; padding-bottom: 6px; margin-bottom: 10px;
        }
        .hw-doc {
          padding: 8px; border-radius: 4px; cursor: pointer;
          border-bottom: 1px solid #f1f1f1; font-size: 12px;
          display: flex; justify-content: space-between;
          animation: hw-pop .4s ease-out;
        }
        @keyframes hw-pop {
          from { transform: scale(.8); opacity: 0; }
          to   { transform: scale(1); opacity: 1; }
        }
        .hw-doc:hover { background: #f1f8ff; }
        .hw-doc .hw-doc-id { font-family: 'IBM Plex Mono', monospace; color: #202124; font-weight: 600; }
        .hw-doc .hw-doc-date { color: #70757a; font-size: 11px; }

        /* Dispatch board */
        .hw-board { display: grid; grid-template-columns: 220px 1fr; gap: 14px; height: 520px; }
        .hw-parking { background: #f8f9fa; border-radius: 8px; padding: 12px; overflow: auto; }
        .hw-parking-title { font-size: 11px; color: #5f6368; font-weight: 700; margin-bottom: 10px; text-transform: uppercase; }
        .hw-job-card {
          background: white; padding: 10px; margin-bottom: 8px; border-radius: 4px;
          box-shadow: 0 1px 3px rgba(0,0,0,.15); border-left: 4px solid #1e8e3e;
          cursor: grab; transition: all .3s;
        }
        .hw-job-card.hw-dragging { transform: scale(1.05) rotate(-2deg); box-shadow: 0 6px 20px rgba(0,0,0,.3); z-index:10; position: relative; }
        .hw-grid { display: grid; grid-template-columns: 120px repeat(5, 1fr); gap: 2px; background: #dadce0; border: 1px solid #dadce0; border-radius: 4px; }
        .hw-grid > div { background: white; padding: 8px; min-height: 80px; font-size: 12px; }
        .hw-grid .hw-header { background: #f1f3f4; font-weight: 700; text-align: center; font-size: 11px; text-transform: uppercase; }
        .hw-grid .hw-tech { background: #fafafa; font-weight: 700; display:flex; align-items:center; justify-content:center; }
        .hw-grid .hw-cell.hw-drop { background: #e3f2fd; outline: 2px dashed #1a73e8; }

        /* Mobile mockup */
        .hw-phone {
          width: 280px; margin: 0 auto; background: #202124; border-radius: 36px;
          padding: 20px 14px; box-shadow: 0 10px 30px rgba(0,0,0,.4); color: white;
        }
        .hw-phone .hw-phone-header {
          display: flex; justify-content: space-between; font-size: 10px;
          color: #9aa0a6; margin-bottom: 14px;
        }
        .hw-phone-card {
          background: #303134; border-radius: 12px; padding: 14px;
          border-left: 4px solid #1a73e8; margin-bottom: 10px;
        }
        .hw-phone-card .hw-time { color: #f9ab00; font-family: monospace; font-size: 10px; }
        .hw-phone-card .hw-addr { font-weight: 700; font-size: 14px; margin: 4px 0; }
        .hw-phone-card .hw-cust { color: #bdc1c6; font-size: 11px; }
        .hw-complete-btn {
          width: 100%; background: #f9ab00; color: black; border: none;
          border-radius: 24px; padding: 14px; font-weight: 900;
          text-transform: uppercase; font-size: 14px; margin-top: 10px;
        }

        /* Click ripple */
        .hw-ripple {
          position: absolute; border-radius: 50%; background: rgba(249,171,0,.8);
          transform: translate(-50%, -50%) scale(0); animation: hw-ripple-anim .6s ease-out;
          pointer-events: none; width: 40px; height: 40px;
        }
        @keyframes hw-ripple-anim {
          from { transform: translate(-50%, -50%) scale(0); opacity: 1; }
          to   { transform: translate(-50%, -50%) scale(3); opacity: 0; }
        }

        @media (max-width: 900px) {
          #hw-main { grid-template-columns: 1fr; }
          #hw-narrator { order: -1; max-height: 200px; }
        }
      </style>

      <div id="hw-topbar">
        <div class="hw-logo">🎞️ HAMBURG DOOR — INTERACTIVE WALKTHROUGH</div>
        <div class="hw-controls">
          <span id="hw-speed-label">1× speed</span>
          <button id="hw-btn-slow">0.5×</button>
          <button id="hw-btn-normal">1×</button>
          <button id="hw-btn-fast">2×</button>
          <button id="hw-btn-prev" title="Previous scene">◀</button>
          <button id="hw-btn-pause">⏸ PAUSE</button>
          <button id="hw-btn-next" title="Next scene">▶</button>
          <button id="hw-btn-stop" class="hw-danger">✕ CLOSE</button>
        </div>
      </div>

      <div id="hw-main">
        <div id="hw-app"></div>
        <div id="hw-narrator">
          <div class="hw-scene-num" id="hw-scene-num">Scene 0 of ${SCENES_COUNT}</div>
          <div class="hw-title" id="hw-title">Getting ready…</div>
          <div class="hw-caption" id="hw-caption">Press play to start the walkthrough.</div>
          <div class="hw-progress"><div class="hw-progress-fill" id="hw-progress"></div></div>
          <div class="hw-shortcuts">
            <kbd>Space</kbd> pause · <kbd>→</kbd> next · <kbd>←</kbd> prev · <kbd>Esc</kbd> close
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(STAGE);

    // Wire up controls
    document.getElementById('hw-btn-stop').onclick = () => Demo.stop();
    document.getElementById('hw-btn-pause').onclick = () => Demo.togglePause();
    document.getElementById('hw-btn-slow').onclick = () => Demo.setSpeed(0.5);
    document.getElementById('hw-btn-normal').onclick = () => Demo.setSpeed(1);
    document.getElementById('hw-btn-fast').onclick = () => Demo.setSpeed(2);
    document.getElementById('hw-btn-next').onclick = () => { SKIP = 1; };
    document.getElementById('hw-btn-prev').onclick = () => { SKIP = -1; };

    // Keyboard shortcuts
    document.addEventListener('keydown', keyHandler);
  }

  function keyHandler(e) {
    if (!STAGE) return;
    if (e.key === 'Escape') Demo.stop();
    else if (e.key === ' ') { e.preventDefault(); Demo.togglePause(); }
    else if (e.key === 'ArrowRight') { SKIP = 1; }
    else if (e.key === 'ArrowLeft')  { SKIP = -1; }
  }

  function unmountStage() {
    document.removeEventListener('keydown', keyHandler);
    if (STAGE) { STAGE.remove(); STAGE = null; }
  }

  function setNarrator(sceneNum, title, caption) {
    CURRENT_SCENE = sceneNum;
    document.getElementById('hw-scene-num').textContent = `Scene ${sceneNum} of ${SCENES_COUNT}`;
    document.getElementById('hw-title').innerHTML = title;
    document.getElementById('hw-caption').innerHTML = caption;
    document.getElementById('hw-progress').style.width = `${(sceneNum / SCENES_COUNT) * 100}%`;
  }

  function setApp(html) {
    const app = document.getElementById('hw-app');
    app.innerHTML = html;
  }

  function $app(selector) {
    return document.querySelector('#hw-app ' + selector);
  }

  // ---------- Fake UI helpers ----------

  async function typeInto(selector, text, minMs = 30, maxMs = 80) {
    const el = $app(selector);
    if (!el) return;
    el.classList.add('hw-focused');
    el.textContent = '';
    for (const ch of text) {
      if (ABORT) throw new Error('ABORT');
      if (SKIP) { el.textContent = text; break; }
      el.textContent += ch;
      await sleep(minMs + Math.random() * (maxMs - minMs));
    }
    el.classList.remove('hw-focused');
    el.classList.add('hw-changed');
    await sleep(200);
  }

  async function flashButton(selector) {
    const el = typeof selector === 'string' ? $app(selector) : selector;
    if (!el) return;
    el.classList.add('hw-flash');
    // Ripple effect
    const rect = el.getBoundingClientRect();
    const ripple = document.createElement('div');
    ripple.className = 'hw-ripple';
    ripple.style.left = (rect.left + rect.width / 2) + 'px';
    ripple.style.top  = (rect.top + rect.height / 2) + 'px';
    document.body.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
    await sleep(300);
    el.classList.remove('hw-flash');
  }

  function today() {
    const d = new Date();
    return `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}`;
  }

  // ---------- Scenes ----------


  // ---------- Scenes ----------

  const Scenes = {

    async intro() {
      setApp(`
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; text-align:center; padding:60px 20px;">
          <div style="font-size:64px; margin-bottom:20px;">🏠</div>
          <div style="font-size:28px; font-weight:900; letter-spacing:-1px; color:#202124; margin-bottom:12px;">Hamburg Overhead Door</div>
          <div style="font-size:16px; color:#5f6368; max-width:500px; line-height:1.5;">
            Ticket Forge Unity — one staff portal for phone calls, quotes, jobs, dispatch, field tech, and invoicing. All connected. All real-time.
          </div>
          <div style="margin-top:32px; padding: 18px 24px; background: #fff3cd; border-left: 5px solid #f9ab00; border-radius: 8px; max-width: 520px; text-align: left; color: #5f4a00;">
            <div style="font-weight: 900; font-size: 13px; text-transform: uppercase; letter-spacing: .1em; margin-bottom: 4px;">⚡ Today's theme</div>
            <div style="font-size: 14px;"><b>Type once. Flow forward.</b> Zero double-entry. Every field a customer provides is captured exactly once — and then every downstream document inherits it automatically.</div>
          </div>
        </div>
      `);
      setNarrator(1,
        '🎬 Welcome — 90 seconds, end to end',
        `Meet <b>Ticket Forge Unity</b>. Before: paper forms, whiteboard
         scheduling, phone tag between office and tech. After: every piece
         of a job lives in one connected system.<br><br>
         Watch Janet Hamburg's story — and see the "<b>one-and-done</b>"
         workflow in action.`
      );
      await sleep(6500);
    },

    // ===== SCENE 2: PHONE MESSAGE with LIVE AUTOCOMPLETE =====
    async phoneMessage() {
      setApp(`
        <div class="hw-form-header">
          <div class="hw-form-title">📥 PHONE MESSAGE #800001</div>
          <div><span class="hw-pill open">OPEN</span></div>
        </div>

        <div class="hw-card">
          <div class="hw-row"><div class="hw-label">Date</div><div class="hw-input" id="hw-date">${today()}</div></div>
          <div class="hw-row"><div class="hw-label">Phone</div><div style="position:relative;"><div class="hw-input" id="hw-phone"></div><div id="hw-auto" style="display:none; position:absolute; top:100%; left:0; right:0; background:white; border:1px solid #1a73e8; border-radius:6px; box-shadow:0 4px 14px rgba(26,115,232,.25); z-index:10; margin-top:2px; overflow:hidden;"></div></div></div>
          <div class="hw-row"><div class="hw-label">Name</div><div class="hw-input" id="hw-name"></div></div>
          <div class="hw-row"><div class="hw-label">Bill Addr</div><div class="hw-input" id="hw-addr1"></div></div>
          <div class="hw-row"><div class="hw-label"></div><div class="hw-input" id="hw-addr2"></div></div>
          <div class="hw-row"><div class="hw-label">Account #</div><div class="hw-input" id="hw-acct"></div></div>
        </div>

        <div class="hw-card">
          <div class="hw-label" style="margin-bottom:8px;">Intake Notes</div>
          <div class="hw-input" id="hw-notes" style="min-height:80px; white-space:pre-wrap;"></div>
        </div>
      `);

      setNarrator(2,
        '📞 Janet calls in',
        `Phone rings. Office clicks <b>CREATE NEW → Phone Message</b>.
         Every caller becomes a structured record — no sticky notes.`
      );
      await sleep(2000);

      // Type a partial phone → trigger autocomplete dropdown
      setNarrator(2,
        '🔍 Autocomplete kicks in',
        `Office starts typing the phone. After 3 characters, the rolodex
         instantly matches existing customers. <b>Janet has called before.</b>`
      );
      await typeInto('#hw-phone', '716-55', 90, 160);

      // Show autocomplete dropdown
      const auto = $app('#hw-auto');
      auto.style.display = 'block';
      auto.innerHTML = `
        <div style="padding: 10px 14px; border-bottom: 1px solid #eee; cursor: pointer; background: #f1f8ff;">
          <div style="font-size: 10px; font-weight: 700; color: #5f6368; text-transform: uppercase; letter-spacing: .05em;">📞 Phone</div>
          <div><b>JANET HAMBURG</b></div>
          <div style="font-size: 11px; color: #666;">716-555-0101</div>
        </div>
        <div style="padding: 10px 14px; cursor: pointer; opacity: 0.6;">
          <div style="font-size: 10px; font-weight: 700; color: #5f6368; text-transform: uppercase; letter-spacing: .05em;">📞 Phone</div>
          <div><b>DAN HAMBURG</b></div>
          <div style="font-size: 11px; color: #666;">716-555-9922</div>
        </div>
      `;
      await sleep(2200);

      setNarrator(2,
        '👆 Click match → auto-fill',
        `One click and <b>every customer field fills at once</b>: phone,
         name, billing address, account #. Zero re-typing.`
      );
      await sleep(1800);

      // Fill all fields with shimmer
      auto.style.display = 'none';
      $app('#hw-phone').textContent = JANET.phone;    $app('#hw-phone').classList.add('hw-changed');
      await sleep(200);
      $app('#hw-name').textContent  = JANET.name;     $app('#hw-name').classList.add('hw-changed');
      await sleep(200);
      $app('#hw-addr1').textContent = JANET.address1; $app('#hw-addr1').classList.add('hw-changed');
      await sleep(150);
      $app('#hw-addr2').textContent = JANET.address2; $app('#hw-addr2').classList.add('hw-changed');
      await sleep(150);
      $app('#hw-acct').textContent  = JANET.accountId; $app('#hw-acct').classList.add('hw-changed');
      await sleep(400);

      await typeInto('#hw-notes', 'Garage door stuck halfway open.\nCable appears broken.\nWants service ASAP.', 25, 55);
      await sleep(1200);
    },

    // ===== SCENE 3: FORWARD → SERVICE, SAVE → DASHBOARD =====
    async forwardToService() {
      setNarrator(3,
        '🚀 Click → SERVICE — watch it forward',
        `Instead of clicking SAVE (which would drop us back to the dashboard),
         the office clicks <b>→ SERVICE</b>. The phone message is marked
         <b>Converted</b>, a new service ticket is spawned, and every field
         carries forward automatically.`
      );
      await sleep(3000);

      // Transition effect: fade current app out
      const app = document.getElementById('hw-app');
      app.style.transition = 'opacity 0.4s';
      app.style.opacity = '0.2';
      await sleep(500);

      // Render service ticket with breadcrumb
      setApp(`
        <div style="margin-bottom: 14px; text-align: center;">
          <span style="display: inline-block; background: #fff3cd; color: #7a5a00; padding: 6px 14px; border-radius: 20px; font-family: Inter, sans-serif; font-size: 11px; font-weight: 600; border: 1px solid #f9ab00; cursor: pointer; animation: hw-pop .5s ease-out;">
            ← Forwarded from 📥 Phone Message #800001
          </span>
        </div>

        <div class="hw-form-header">
          <div class="hw-form-title">🛠️ SERVICE TICKET #700001</div>
          <div><span class="hw-pill scheduled">OPEN</span></div>
        </div>

        <div class="hw-card" style="background:#e8f0fe; border-color:#1a73e8;">
          <div style="font-size:12px; color:#1a73e8; font-weight:700; text-transform:uppercase;">✨ Every field inherited from the phone message</div>
        </div>

        <div class="hw-card">
          <div class="hw-row"><div class="hw-label">Customer</div><div class="hw-input hw-changed">${JANET.name}</div></div>
          <div class="hw-row"><div class="hw-label">Phone</div><div class="hw-input hw-changed">${JANET.phone}</div></div>
          <div class="hw-row"><div class="hw-label">Site</div><div class="hw-input hw-changed">${JANET.address1}, ${JANET.address2}</div></div>
          <div class="hw-row"><div class="hw-label">Account #</div><div class="hw-input hw-changed">${JANET.accountId}</div></div>
          <div class="hw-row"><div class="hw-label">Rep</div><div class="hw-input" id="hw-rep"></div></div>
        </div>

        <div class="hw-card">
          <div class="hw-label" style="margin-bottom:8px;">Scope of Work</div>
          <div class="hw-input hw-changed" style="min-height:60px; white-space:pre-wrap;">Garage door stuck halfway open.
Cable appears broken.
Wants service ASAP.</div>
        </div>

        <div style="display:flex; gap:10px; margin-top:20px;">
          <button class="hw-btn hw-yellow">💾 SAVE</button>
          <button class="hw-btn hw-green" id="hw-dispatch-btn">🚚 SEND TO DISPATCH</button>
        </div>
      `);
      app.style.opacity = '1';
      await sleep(1800);

      setNarrator(3,
        '🎯 Zero re-entry',
        `Look at the top: <b>"← Forwarded from Phone Message #800001"</b>.
         Click that any time to jump back to the source. Full audit trail,
         zero typing.<br><br>
         Office adds the tech name and clicks SEND TO DISPATCH.`
      );
      await sleep(3200);

      await typeInto('#hw-rep', 'Mario', 80, 130);
      await sleep(500);
      await flashButton('#hw-dispatch-btn');
      await sleep(1000);
    },

    // ===== SCENE 4: DISPATCH (unchanged animation) =====
    async dispatch() {
      setApp(`
        <div class="hw-form-header">
          <div class="hw-form-title">🗓️ DISPATCH BOARD — SERVICE (DAILY)</div>
          <div style="display:flex; gap:6px;">
            <button class="hw-btn" style="background:#1a73e8;">SERVICE</button>
            <button class="hw-btn hw-gray">INSTALL</button>
            <button class="hw-btn hw-gray">SALES</button>
          </div>
        </div>

        <div class="hw-board">
          <div class="hw-parking">
            <div class="hw-parking-title">Unscheduled (1)</div>
            <div class="hw-job-card" id="hw-card">
              <div style="font-family:monospace; font-size:11px; color:#666;">#700001</div>
              <div style="font-weight:700; font-size:13px; margin: 4px 0;">${JANET.name}</div>
              <div style="font-size:11px; color:#666;">Cable repair</div>
            </div>
          </div>

          <div class="hw-grid" id="hw-grid">
            <div class="hw-header">TECH / TIME</div>
            <div class="hw-header">8:00</div>
            <div class="hw-header">9:00</div>
            <div class="hw-header">10:00</div>
            <div class="hw-header">11:00</div>
            <div class="hw-header">12:00</div>

            <div class="hw-tech">Mario</div>
            <div class="hw-cell"></div>
            <div class="hw-cell" id="hw-target"></div>
            <div class="hw-cell"></div>
            <div class="hw-cell"></div>
            <div class="hw-cell"></div>

            <div class="hw-tech">Don Fike</div>
            <div class="hw-cell"></div><div class="hw-cell"></div><div class="hw-cell"></div><div class="hw-cell"></div><div class="hw-cell"></div>

            <div class="hw-tech">Dustin B</div>
            <div class="hw-cell"></div><div class="hw-cell"></div><div class="hw-cell"></div><div class="hw-cell"></div><div class="hw-cell"></div>
          </div>
        </div>
      `);

      setNarrator(4,
        '🗓️ Drag to dispatch',
        `Dispatcher sees Janet's ticket in <b>UNSCHEDULED</b>. One drag →
         Mario's 9:00. Firestore updates instantly. Mario's phone gets
         the new job within 2 seconds.`
      );
      await sleep(3000);

      const card = $app('#hw-card');
      const target = $app('#hw-target');
      const cardRect = card.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();

      card.classList.add('hw-dragging');
      card.style.transition = 'transform 1.5s ease-in-out';
      const dx = targetRect.left - cardRect.left + 20;
      const dy = targetRect.top - cardRect.top + 10;
      card.style.transform = `translate(${dx}px, ${dy}px) scale(1.05) rotate(-2deg)`;

      await sleep(1800);

      card.style.transition = '';
      card.style.transform = '';
      card.classList.remove('hw-dragging');
      card.style.borderLeftColor = '#1a73e8';
      target.appendChild(card);
      $app('.hw-parking-title').textContent = 'Unscheduled (0)';
      await sleep(1500);
    },

    // ===== SCENE 5: MOBILE TECH COMPLETES JOB =====
    async mobile() {
      setApp(`
        <div style="display:flex; gap:30px; align-items:flex-start;">
          <div class="hw-phone">
            <div class="hw-phone-header">
              <span>🔋 87%</span><span>📶 LTE</span>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:14px;">
              <div style="font-weight:900; font-size:16px; text-transform:uppercase;">MARIO</div>
              <div style="background:transparent; border:1px solid #9aa0a6; color:#9aa0a6; padding:3px 8px; border-radius:4px; font-size:10px;">LOGOUT</div>
            </div>
            <div id="hw-phone-list">
              <div style="text-align:center; color:#9aa0a6; padding:40px 0;">Loading jobs…</div>
            </div>
          </div>

          <div style="flex:1; padding: 20px 0;">
            <div style="font-size:12px; color:#5f6368; text-transform:uppercase; letter-spacing:.1em; margin-bottom:14px;">📱 Mario's Phone</div>
            <div style="font-size:14px; color:#202124; line-height:1.6;">
              <p>Mario's in the van. Pulls up the Hamburg Door app on his phone. <b>It's a PWA</b> — installs like a native app, works offline.</p>
              <p>Within 1-2 seconds, his scheduled job appears.</p>
            </div>
          </div>
        </div>
      `);

      setNarrator(5,
        '📱 Mario in the field',
        `No phone call to the office. No "where am I going?" Just the
         job, synced in real-time.`
      );
      await sleep(2000);

      $app('#hw-phone-list').innerHTML = `
        <div class="hw-phone-card" style="animation: hw-pop .5s ease-out;">
          <div class="hw-time">⏰ 9:00</div>
          <div class="hw-addr">${JANET.address1}</div>
          <div class="hw-cust">${JANET.name}</div>
        </div>
      `;
      await sleep(1500);

      // Open job detail + complete
      $app('#hw-phone-list').innerHTML = `
        <div style="background:#303134; border-radius:12px; padding:16px;">
          <div style="font-size:12px; color:#f9ab00; margin-bottom:6px; text-transform:uppercase; font-weight:700;">Job Details</div>
          <div style="font-weight:700; font-size:15px;">${JANET.address1}</div>
          <div style="color:#bdc1c6; font-size:12px; margin: 4px 0;">${JANET.name}</div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-top:12px;">
            <div style="background:#1a73e8; border-radius:6px; padding:10px; text-align:center; font-size:12px; font-weight:700;">🗺️ MAP</div>
            <div style="background:#1e8e3e; border-radius:6px; padding:10px; text-align:center; font-size:12px; font-weight:700;">📞 CALL</div>
          </div>
          <div style="margin-top:14px; font-size:11px; color:#f9ab00; text-transform:uppercase;">Scope</div>
          <div style="background:#202124; padding:10px; border-radius:6px; margin-top:4px; font-size:12px; color:#e8eaed;">
            Replace broken cable. Test 5 cycles.
          </div>
          <div style="margin-top:14px; font-size:11px; color:#f9ab00; text-transform:uppercase;">Tech Notes</div>
          <div class="hw-input" id="hw-mobile-notes" style="background:#202124; color:white; border-color:#5f6368; min-height:60px; margin-top:4px;"></div>
          <button class="hw-complete-btn">✅ COMPLETE JOB</button>
        </div>
      `;

      setNarrator(5,
        '✅ Tap complete, everyone syncs',
        `Mario types notes, taps <b>COMPLETE</b>. Status flips to Complete
         everywhere instantly. Office knows. No phone tag.`
      );
      await sleep(2500);

      await typeInto('#hw-mobile-notes', 'Replaced cable. Tested 5 cycles. Door smooth.', 30, 70);
      await sleep(800);
      await flashButton($app('.hw-complete-btn'));
      await sleep(800);

      $app('#hw-phone-list').innerHTML = `
        <div style="text-align:center; padding:60px 0;">
          <div style="font-size:60px; margin-bottom:14px;">✅</div>
          <div style="color:#1e8e3e; font-weight:900; font-size:18px;">JOB COMPLETE</div>
          <div style="color:#9aa0a6; font-size:12px; margin-top:8px;">Synced to office</div>
        </div>
      `;
      await sleep(2000);
    },

    // ===== SCENE 6: FRANCHISE / MULTI-SITE CUSTOMER SCENARIO =====
    async franchiseLookup() {
      setApp(`
        <div class="hw-form-header">
          <div class="hw-form-title">📥 PHONE MESSAGE #800002</div>
          <div><span class="hw-pill open">OPEN</span></div>
        </div>

        <div class="hw-card">
          <div class="hw-row"><div class="hw-label">Phone</div><div class="hw-input" id="hw-phone2">716-555-0500</div></div>
          <div class="hw-row"><div class="hw-label">Name</div><div class="hw-input hw-changed">HAMBURG FRANCHISE HOLDINGS</div></div>
          <div class="hw-row"><div class="hw-label">Bill Addr</div><div class="hw-input hw-changed">5000 CORPORATE WAY</div></div>
          <div class="hw-row"><div class="hw-label"></div><div class="hw-input hw-changed">BUFFALO, NY 14203</div></div>
          <div class="hw-row"><div class="hw-label">Job Site</div><div style="position:relative;"><div class="hw-input" id="hw-site1"></div><div id="hw-auto2" style="display:none; position:absolute; top:100%; left:0; right:0; background:white; border:1px solid #1a73e8; border-radius:6px; box-shadow:0 4px 14px rgba(26,115,232,.25); z-index:10; margin-top:2px;"></div></div></div>
          <div class="hw-row"><div class="hw-label"></div><div class="hw-input" id="hw-site2"></div></div>
        </div>
      `);

      setNarrator(6,
        '🏢 Now — a franchise customer',
        `New call. <b>Hamburg Franchise Holdings</b> has multiple locations.
         HQ pays the bills from Buffalo, but each franchise is a different
         job site.<br><br>
         Office types the job-site address...`
      );
      await sleep(3500);

      await typeInto('#hw-site1', '123 MAIN', 60, 100);

      // Show multi-result dropdown: phone match AND existing job sites
      const auto = $app('#hw-auto2');
      auto.style.display = 'block';
      auto.innerHTML = `
        <div style="padding: 10px 14px; border-bottom: 1px solid #eee; cursor: pointer; background: #f1f8ff;">
          <div style="font-size: 10px; font-weight: 700; color: #5f6368; text-transform: uppercase; letter-spacing: .05em;">📍 Job Site</div>
          <div><b>HAMBURG FRANCHISE HOLDINGS</b> <span style="font-size:10px; color:#888;">(+2 other sites)</span></div>
          <div style="font-size: 11px; color: #666;">123 MAIN ST, HAMBURG NY 14075</div>
        </div>
        <div style="padding: 10px 14px; cursor: pointer;">
          <div style="font-size: 10px; font-weight: 700; color: #5f6368; text-transform: uppercase; letter-spacing: .05em;">📍 Job Site</div>
          <div><b>MAIN STREET ARCADE</b></div>
          <div style="font-size: 11px; color: #666;">123 MAIN ST SUITE B, HAMBURG NY 14075</div>
        </div>
      `;
      await sleep(2500);

      setNarrator(6,
        '🎯 Matched against ALL customers\' sites',
        `Look — the rolodex matched <b>123 Main</b> across every
         customer's billing AND job-site addresses. Two hits: the
         franchise HQ and an arcade at the same building.<br><br>
         Office clicks the Franchise match...`
      );
      await sleep(3500);

      auto.style.display = 'none';
    },

    // ===== SCENE 7: DISAMBIGUATION MODAL =====
    async disambiguationModal() {
      // Darken background, show modal overlay
      setApp(`
        <div style="position: relative; height: 100%;">
          <div style="filter: blur(3px); opacity: 0.3; pointer-events: none;">
            <div class="hw-form-header">
              <div class="hw-form-title">📥 PHONE MESSAGE #800002</div>
              <div><span class="hw-pill open">OPEN</span></div>
            </div>
            <div class="hw-card">
              <div class="hw-row"><div class="hw-label">Name</div><div class="hw-input">HAMBURG FRANCHISE HOLDINGS</div></div>
              <div class="hw-row"><div class="hw-label">Job Site</div><div class="hw-input">123 MAIN</div></div>
            </div>
          </div>

          <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; color: #202124; border-radius: 12px; padding: 28px; width: 100%; max-width: 480px; box-shadow: 0 20px 60px rgba(0,0,0,0.4); animation: hw-pop 0.3s ease-out;">
            <h3 style="margin: 0 0 14px 0; font-weight: 900; font-size: 20px; letter-spacing: -0.3px; border-bottom: 2px solid #000; padding-bottom: 10px; font-family: 'Inter', sans-serif;">🤔 Is this a job site for HAMBURG FRANCHISE HOLDINGS?</h3>

            <div style="margin: 12px 0;">
              <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #5f6368; letter-spacing: .08em;">You typed</div>
              <div style="font-family: 'IBM Plex Mono', monospace;">123 MAIN</div>
            </div>
            <div style="margin: 12px 0;">
              <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #5f6368; letter-spacing: .08em;">Matched customer</div>
              <div style="font-family: 'IBM Plex Mono', monospace;"><b>HAMBURG FRANCHISE HOLDINGS</b></div>
            </div>
            <div style="margin: 12px 0;">
              <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #5f6368; letter-spacing: .08em;">Billed to</div>
              <div style="font-family: 'IBM Plex Mono', monospace;">5000 CORPORATE WAY, BUFFALO NY 14203</div>
            </div>

            <div style="background: #fff3cd; border-left: 4px solid #f9ab00; padding: 10px 14px; border-radius: 4px; font-size: 13px; margin: 14px 0; color: #7a5a00;">
              <b>3</b> existing job sites on file. Adding this will create one more.
            </div>

            <div style="display: flex; gap: 10px; margin-top: 22px; flex-wrap: wrap;">
              <button id="hw-modal-add" class="hw-btn hw-green" style="flex: 1; min-width: 140px;">✅ ADD AS JOB SITE</button>
              <button class="hw-btn hw-blue" style="flex: 1; min-width: 140px;">📋 FILL, DON'T ADD</button>
              <button class="hw-btn hw-gray" style="flex: 1; min-width: 100px;">CANCEL</button>
            </div>
          </div>
        </div>
      `);

      setNarrator(7,
        '🤔 Smart disambiguation',
        `A modal pops. <b>"Is this a job site for HAMBURG FRANCHISE HOLDINGS?"</b><br><br>
         Three choices:<br>
         ✅ <b>ADD AS JOB SITE</b> — save it to the customer + fill the form<br>
         📋 <b>FILL, DON'T ADD</b> — just fill, don't pollute the rolodex<br>
         ❌ <b>CANCEL</b> — never mind
        `
      );
      await sleep(4500);

      await flashButton('#hw-modal-add');
      await sleep(1200);
    },

    // ===== SCENE 8: AUTO-FILL RESULT =====
    async franchiseFilled() {
      setApp(`
        <div style="margin-bottom: 14px; text-align: center;">
          <span style="display: inline-block; background: #e6f4ea; color: #1e8e3e; padding: 6px 14px; border-radius: 20px; font-family: Inter, sans-serif; font-size: 11px; font-weight: 600; border: 1px solid #1e8e3e;">
            ✅ Customer + new job site saved to rolodex
          </span>
        </div>

        <div class="hw-form-header">
          <div class="hw-form-title">📥 PHONE MESSAGE #800002</div>
          <div><span class="hw-pill open">OPEN</span></div>
        </div>

        <div class="hw-card">
          <div class="hw-row"><div class="hw-label">Phone</div><div class="hw-input hw-changed">716-555-0500</div></div>
          <div class="hw-row"><div class="hw-label">Name</div><div class="hw-input hw-changed">HAMBURG FRANCHISE HOLDINGS</div></div>
          <div class="hw-row"><div class="hw-label">Bill Addr</div><div class="hw-input hw-changed">5000 CORPORATE WAY</div></div>
          <div class="hw-row"><div class="hw-label"></div><div class="hw-input hw-changed">BUFFALO, NY 14203</div></div>
          <div class="hw-row"><div class="hw-label">Job Site</div><div class="hw-input hw-changed">123 MAIN ST</div></div>
          <div class="hw-row"><div class="hw-label"></div><div class="hw-input hw-changed">HAMBURG, NY 14075</div></div>
        </div>

        <div class="hw-card" style="background: #e8f0fe; border-color: #1a73e8;">
          <div style="font-size: 12px; color: #1a73e8; font-weight: 700; text-transform: uppercase; margin-bottom: 8px;">📍 Hamburg Franchise Holdings — now has 4 job sites on file</div>
          <div style="font-family: 'IBM Plex Mono', monospace; font-size: 12px; line-height: 1.8;">
            • 123 MAIN ST, HAMBURG NY 14075 <span style="color: #1e8e3e; font-weight: 700;">(just added)</span><br>
            • 456 OAK AVE, ORCHARD PARK NY 14127<br>
            • 789 ELM DR, WEST SENECA NY 14224<br>
            • 5000 CORPORATE WAY, BUFFALO NY 14203 <span style="color: #666;">(billing)</span>
          </div>
        </div>
      `);

      setNarrator(8,
        '🎯 One action, two writes',
        `The form is pre-filled — AND the customer record is updated
         with the new job site. <b>Next time anyone types "123 Main" at
         ANY point in ANY form</b>, it'll match instantly.<br><br>
         That's the rolodex learning as you work.`
      );
      await sleep(5000);
    },

    // ===== SCENE 9: DASHBOARD — THE PAPER TRAIL =====
    async dashboard() {
      setApp(`
        <div class="hw-form-header">
          <div class="hw-form-title">👤 ADMIN — DOCUMENT MANAGER</div>
          <div>
            <input type="text" placeholder="🔍 Search name, phone, address, items..."
                   style="padding:8px 14px; border:1px solid #dadce0; border-radius:6px; width:300px; font-size:13px;" id="hw-search">
          </div>
        </div>

        <div class="hw-dashboard">
          <div class="hw-stack" data-type="intake">
            <div class="hw-stack-title">Intake / Phone Msgs</div>
            <div class="hw-doc" style="opacity:0.5;"><span><span class="hw-doc-id">#800001</span> ${JANET.name}</span><span class="hw-doc-date">converted</span></div>
            <div class="hw-doc"><span><span class="hw-doc-id">#800002</span> HAMBURG FRANCHISE</span><span class="hw-doc-date">${today()}</span></div>
          </div>
          <div class="hw-stack" data-type="quote">
            <div class="hw-stack-title">Quotes & Proposals</div>
            <div class="hw-doc"><span><span class="hw-doc-id">#300001</span> ${JANET.name}</span><span class="hw-doc-date">${today()}</span></div>
          </div>
          <div class="hw-stack" data-type="service">
            <div class="hw-stack-title">Service Tickets</div>
            <div class="hw-doc"><span><span class="hw-doc-id">#700001</span> ${JANET.name}</span><span class="hw-doc-date">${today()}</span></div>
          </div>
          <div class="hw-stack" data-type="work">
            <div class="hw-stack-title">Work Orders</div>
            <div class="hw-doc" style="color:#999;">No active</div>
          </div>
          <div class="hw-stack" data-type="invoice">
            <div class="hw-stack-title">Invoices</div>
            <div class="hw-doc" style="color:#999;">No active</div>
          </div>
        </div>
      `);

      setNarrator(9,
        '🔍 Every doc, one search bar',
        `One place to see everything. Converted docs fade out of the
         active view but stay searchable forever.`
      );
      await sleep(2500);

      await typeInto('#hw-search', 'hamburg', 60, 110);
      await sleep(600);

      document.querySelectorAll('#hw-app .hw-stack').forEach(s => s.classList.add('hw-flash'));
      await sleep(1800);
      document.querySelectorAll('#hw-app .hw-stack').forEach(s => s.classList.remove('hw-flash'));

      setNarrator(9,
        '🎯 Type "hamburg" → both customers surface',
        `Janet Hamburg's service trail AND Hamburg Franchise's intake
         both light up. One search, every field, across every document
         type: description, line items, signatures, rep name, account #,
         even typed tech notes.`
      );
      await sleep(4000);
    },

    // ===== SCENE 10: OUTRO =====
    async outro() {
      setApp(`
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; text-align:center; padding:40px 20px;">
          <div style="font-size:72px; margin-bottom:24px;">⚡</div>
          <div style="font-size:28px; font-weight:900; letter-spacing:-1px; color:#202124; margin-bottom:16px;">Type once. Flow forward.</div>
          <div style="font-size:16px; color:#5f6368; max-width:560px; line-height:1.6; margin-bottom:30px;">
            One system. Phone to paper to phone again. No lost tickets.
            No re-keying. The rolodex learns as you work.
          </div>
          <div style="display:flex; gap:16px; margin-bottom:30px; flex-wrap: wrap; justify-content: center;">
            <div style="background:#e8f0fe; color:#1a73e8; padding:16px 20px; border-radius:10px; text-align:center; min-width: 100px;">
              <div style="font-size:24px; font-weight:900;">4</div>
              <div style="font-size:11px; text-transform:uppercase;">Views</div>
            </div>
            <div style="background:#e6f4ea; color:#1e8e3e; padding:16px 20px; border-radius:10px; text-align:center; min-width: 100px;">
              <div style="font-size:24px; font-weight:900;">7</div>
              <div style="font-size:11px; text-transform:uppercase;">Forms</div>
            </div>
            <div style="background:#fef7e0; color:#b06000; padding:16px 20px; border-radius:10px; text-align:center; min-width: 100px;">
              <div style="font-size:24px; font-weight:900;">0</div>
              <div style="font-size:11px; text-transform:uppercase;">Double-Entry</div>
            </div>
            <div style="background:#fce8e6; color:#a82319; padding:16px 20px; border-radius:10px; text-align:center; min-width: 100px;">
              <div style="font-size:24px; font-weight:900;">∞</div>
              <div style="font-size:11px; text-transform:uppercase;">Sync</div>
            </div>
          </div>
          <div style="font-size:12px; color:#9aa0a6;">
            Close this overlay (Esc or ✕) to explore the real thing.
          </div>
        </div>
      `);
      setNarrator(10,
        '✅ Demo complete',
        `Four views — Admin, Dispatch, Mobile, Admin Console. Seven forms
         — Phone, Sales, Quote, Work Order, Service, Invoice, Dashboard.
         One Firestore. Real-time sync. <b>Zero double entry.</b><br><br>
         <b>Close this overlay (Esc or ✕) to explore the real app.</b>`
      );
      await sleep(999999);
    }
  };

  const SCENE_LIST = [
    'intro',
    'phoneMessage',
    'forwardToService',
    'dispatch',
    'mobile',
    'franchiseLookup',
    'disambiguationModal',
    'franchiseFilled',
    'dashboard',
    'outro'
  ];

  const Demo = {
    async play(opts = {}) {
      SPEED = opts.speed || 1;
      ABORT = false;
      PAUSED = false;
      SKIP = 0;
      mountStage();
      Demo.setSpeed(SPEED);

      try {
        let i = 0;
        while (i < SCENE_LIST.length) {
          if (ABORT) break;
          SKIP = 0;
          try {
            await Scenes[SCENE_LIST[i]]();
          } catch (e) {
            if (e.message !== 'ABORT') console.error('[cassette]', e);
          }
          if (SKIP === -1 && i > 0) { i--; continue; }
          i++;
        }
      } finally {
        // Don't auto-unmount; user closes via ✕ or Esc
      }
    },

    stop() {
      ABORT = true;
      setTimeout(unmountStage, 100);
    },

    togglePause() {
      PAUSED = !PAUSED;
      const btn = document.getElementById('hw-btn-pause');
      if (btn) btn.textContent = PAUSED ? '▶ RESUME' : '⏸ PAUSE';
    },

    setSpeed(v) {
      SPEED = v;
      const label = document.getElementById('hw-speed-label');
      if (label) label.textContent = `${v}× speed`;
    }
  };

  window.HamburgWalkthrough = Demo;
  window.HamburgDemo = Demo; // alias

  console.log(
    '%c🎞️ Hamburg Door Walkthrough loaded.\n%c' +
    'Run: HamburgWalkthrough.play()\n' +
    'Stop: HamburgWalkthrough.stop()\n' +
    'Fast: HamburgWalkthrough.play({speed: 2})\n',
    'color:#1a73e8;font-weight:bold;font-size:14px;',
    'color:#5f6368;font-family:monospace;'
  );
})();
