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

  const SCENES_COUNT = 8;
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

  const Scenes = {

    async intro() {
      setApp(`
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; text-align:center; padding:60px 20px;">
          <div style="font-size:64px; margin-bottom:20px;">🏠</div>
          <div style="font-size:28px; font-weight:900; letter-spacing:-1px; color:#202124; margin-bottom:12px;">Hamburg Overhead Door</div>
          <div style="font-size:16px; color:#5f6368; max-width:500px; line-height:1.5;">
            Ticket Forge Unity — one staff portal for phone calls, quotes, jobs, dispatch, field tech, and invoicing. All connected. All real-time.
          </div>
          <div style="margin-top:40px; display:flex; gap:30px; font-size:12px; color:#5f6368; text-transform:uppercase; letter-spacing:.1em;">
            <div>📞 Intake</div><div>→</div><div>📝 Quote</div><div>→</div>
            <div>🛠️ Work Order</div><div>→</div><div>🗓️ Dispatch</div><div>→</div>
            <div>📱 Mobile</div><div>→</div><div>💰 Invoice</div>
          </div>
        </div>
      `);
      setNarrator(1,
        '🎬 The whole show in 90 seconds',
        `Meet <b>Ticket Forge Unity</b>. Before: paper forms, whiteboard
         scheduling, phone tag between office and tech. After: every piece
         of a job — from the first ring of the phone to the final invoice —
         lives in one system.<br><br>Watch Janet Hamburg's story play out.`
      );
      await sleep(6000);
    },

    async phoneMessage() {
      setApp(`
        <div class="hw-form-header">
          <div class="hw-form-title">📥 PHONE MESSAGE #<span id="hw-msg-id">800001</span></div>
          <div><span class="hw-pill open">OPEN</span></div>
        </div>

        <div class="hw-card">
          <div class="hw-row"><div class="hw-label">Date</div><div class="hw-input" id="hw-date">${today()}</div></div>
          <div class="hw-row"><div class="hw-label">Phone</div><div class="hw-input" id="hw-phone"></div></div>
          <div class="hw-row"><div class="hw-label">Name</div><div class="hw-input" id="hw-name"></div></div>
          <div class="hw-row"><div class="hw-label">Address</div><div class="hw-input" id="hw-addr1"></div></div>
          <div class="hw-row"><div class="hw-label"></div><div class="hw-input" id="hw-addr2"></div></div>
          <div class="hw-row"><div class="hw-label">Account #</div><div class="hw-input" id="hw-acct"></div></div>
        </div>

        <div class="hw-card">
          <div class="hw-label" style="margin-bottom:8px;">Intake Notes</div>
          <div class="hw-input" id="hw-notes" style="min-height:80px; white-space:pre-wrap;"></div>
        </div>

        <div style="display:flex; gap:10px; margin-top:20px;">
          <button class="hw-btn hw-yellow" id="hw-save">💾 SAVE</button>
          <button class="hw-btn hw-green" id="hw-conv-service">→ SERVICE</button>
          <button class="hw-btn hw-green" id="hw-conv-sales">→ SALES</button>
          <button class="hw-btn hw-green" id="hw-conv-quote">→ QUOTE</button>
        </div>
      `);

      setNarrator(2,
        '📞 Janet calls in',
        `The phone rings. Office staff clicks <b>CREATE NEW → Phone Message</b>.
         Every caller becomes a structured record, not a sticky note.<br><br>
         Watch her info fill in — phone, name, address. Once saved to the
         Rolodex, future calls from this number auto-fill.`
      );

      await sleep(1500);
      await typeInto('#hw-phone', JANET.phone, 50, 120);
      await typeInto('#hw-name', JANET.name, 40, 90);
      await typeInto('#hw-addr1', JANET.address1, 40, 80);
      await typeInto('#hw-addr2', JANET.address2, 40, 80);
      await typeInto('#hw-acct', JANET.accountId, 50, 100);
      await typeInto('#hw-notes', 'Garage door stuck halfway open.\nCable appears broken.\nWants service ASAP.', 20, 50);

      setNarrator(2,
        '📞 Save + convert',
        `<b>SAVE</b> persists the message. <b>→ SERVICE</b> promotes it to
         a real service ticket — the customer's info is carried forward
         automatically. No re-typing.`
      );
      await sleep(2000);
      await flashButton('#hw-save');
      await sleep(500);
      await flashButton('#hw-conv-service');
      await sleep(800);
    },

    async serviceTicket() {
      setApp(`
        <div class="hw-form-header">
          <div class="hw-form-title">🛠️ SERVICE TICKET #<span>700001</span></div>
          <div><span class="hw-pill open">OPEN</span> <span style="margin-left:8px;" id="hw-status-pill"></span></div>
        </div>

        <div class="hw-card" style="background:#fff9c4; border-color:#f9ab00;">
          <div style="font-size:12px; color:#b06000; font-weight:600;">✨ AUTO-FILLED FROM PHONE MESSAGE #800001</div>
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
          <div class="hw-input" id="hw-scope" style="min-height:80px; white-space:pre-wrap;"></div>
        </div>

        <div style="display:flex; gap:10px; margin-top:20px;">
          <button class="hw-btn hw-yellow">💾 SAVE</button>
          <button class="hw-btn hw-green" id="hw-dispatch-btn">🚚 SEND TO DISPATCH</button>
          <button class="hw-btn hw-gray">🖨️ PRINT</button>
        </div>
      `);

      setNarrator(3,
        '🛠️ Service ticket — auto-populated',
        `Watch — the new ticket opens with Janet's full info already filled
         in. Customer identity carried across. Office just needs to add
         who's handling it and any scope details.`
      );

      await sleep(2500);
      await typeInto('#hw-rep', 'Mario', 80, 120);
      await typeInto('#hw-scope', 'Replace broken spring cable.\nInspect drum and tracks.\nTest 5 cycles before leaving.', 20, 50);

      setNarrator(3,
        '🚚 Send to Dispatch',
        `Clicking <b>SEND TO DISPATCH</b> flips the status and drops this
         ticket into the dispatcher's parking lot on the board.`
      );
      await sleep(2000);
      await flashButton('#hw-dispatch-btn');
      $app('#hw-status-pill').innerHTML = '<span class="hw-pill scheduled">READY FOR DISPATCH</span>';
      await sleep(1500);
    },

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
        '🗓️ The dispatch board',
        `Janet's ticket lands in <b>UNSCHEDULED</b> on the left. The
         dispatcher sees the whole day: techs down the left, time slots
         across the top.<br><br>
         Watch them drag Janet's ticket onto Mario's 9:00 slot.`
      );
      await sleep(3500);

      // Animate drag: move the card from parking to the 9:00 Mario cell
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

      // Drop: move card into target cell (DOM)
      card.style.transition = '';
      card.style.transform = '';
      card.classList.remove('hw-dragging');
      card.style.borderLeftColor = '#1a73e8';
      target.appendChild(card);
      $app('.hw-parking-title').textContent = 'Unscheduled (0)';

      setNarrator(4,
        '✅ Scheduled',
        `Mario's 9:00 is locked in. Firestore updated in real-time — the
         card now carries status "Scheduled", assignedTech "Mario", slot "9:00".
         Mario's phone will see the new job within seconds.`
      );
      await sleep(3000);
    },

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
              <p>Mario signs in on his phone. The app is a <b>PWA</b> — installs like a native app, works offline, pulls today's jobs from Firestore.</p>
              <p>Within 1-2 seconds of dispatch scheduling him, the job appears on his list.</p>
            </div>
          </div>
        </div>
      `);

      setNarrator(5,
        '📱 Mario\'s phone',
        `Mario's in the van. He opens the Hamburg Door app. Today's jobs
         sync automatically — no refresh, no "pull to reload." Real-time
         Firestore listeners.`
      );

      await sleep(2500);

      // Show the job appearing
      $app('#hw-phone-list').innerHTML = `
        <div class="hw-phone-card" style="animation: hw-pop .5s ease-out;">
          <div class="hw-time">⏰ 9:00</div>
          <div class="hw-addr">${JANET.address1}</div>
          <div class="hw-cust">${JANET.name}</div>
        </div>
      `;

      await sleep(1500);
      setNarrator(5,
        '📱 Tap the job → open it',
        `He taps the card. Job detail opens: address, customer, scope of
         work, one-tap navigation, one-tap phone call. When done, he
         types notes, signs, hits COMPLETE.`
      );
      await sleep(2500);

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
            Replace broken spring cable. Inspect drum + tracks. Test 5 cycles.
          </div>
          <div style="margin-top:14px; font-size:11px; color:#f9ab00; text-transform:uppercase;">Tech Notes</div>
          <div class="hw-input" id="hw-mobile-notes" style="background:#202124; color:white; border-color:#5f6368; min-height:60px; margin-top:4px;"></div>
          <button class="hw-complete-btn">✅ COMPLETE JOB</button>
        </div>
      `;

      await sleep(1000);
      await typeInto('#hw-mobile-notes', 'Replaced cable w/ 1/8" galv. Tested 5 cycles. Door operating smoothly.', 30, 80);
      await sleep(1000);
      await flashButton($app('.hw-complete-btn'));
      await sleep(1000);

      // Show completion confirmation
      $app('#hw-phone-list').innerHTML = `
        <div style="text-align:center; padding:60px 0;">
          <div style="font-size:60px; margin-bottom:14px;">✅</div>
          <div style="color:#1e8e3e; font-weight:900; font-size:18px;">JOB COMPLETE</div>
          <div style="color:#9aa0a6; font-size:12px; margin-top:8px;">Synced to office</div>
        </div>
      `;
      setNarrator(5,
        '✅ Synced to office',
        `Status flips to <b>Complete</b>. Office sees the status change
         instantly. No phone call. No "I think he's done?" No lost
         paperwork in the truck.`
      );
      await sleep(3000);
    },

    async newInstallPipeline() {
      setApp(`
        <div style="text-align:center; padding: 20px 0;">
          <div style="font-weight:900; font-size:22px; color:#202124; margin-bottom:8px;">🔄 The other path: new installs</div>
          <div style="color:#5f6368; font-size:14px;">What if Janet wanted a new door instead of a repair?</div>
        </div>

        <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:14px; margin-top:30px;">
          <div class="hw-card" style="text-align:center; padding:16px 10px;">
            <div style="font-size:32px; margin-bottom:8px;">📥</div>
            <div style="font-weight:700; font-size:13px;">Phone Message</div>
            <div style="font-size:11px; color:#5f6368; margin-top:4px;">#800001</div>
            <div style="margin-top:8px;"><span class="hw-pill complete">Converted</span></div>
          </div>
          <div class="hw-card" style="text-align:center; padding:16px 10px;">
            <div style="font-size:32px; margin-bottom:8px;">📝</div>
            <div style="font-weight:700; font-size:13px;">Quote</div>
            <div style="font-size:11px; color:#5f6368; margin-top:4px;">#300001</div>
            <div style="margin-top:8px;"><span class="hw-pill complete">Converted</span></div>
          </div>
          <div class="hw-card" style="text-align:center; padding:16px 10px;">
            <div style="font-size:32px; margin-bottom:8px;">🛠️</div>
            <div style="font-weight:700; font-size:13px;">Work Order</div>
            <div style="font-size:11px; color:#5f6368; margin-top:4px;">#500001</div>
            <div style="margin-top:8px;"><span class="hw-pill complete">Complete</span></div>
          </div>
          <div class="hw-card" style="text-align:center; padding:16px 10px;">
            <div style="font-size:32px; margin-bottom:8px;">💰</div>
            <div style="font-weight:700; font-size:13px;">Invoice</div>
            <div style="font-size:11px; color:#5f6368; margin-top:4px;">#600001</div>
            <div style="margin-top:8px;"><span class="hw-pill closed">Closed</span></div>
          </div>
        </div>

        <div class="hw-card" style="margin-top:30px; background:#e8f0fe; border-color:#1a73e8;">
          <div style="font-weight:700; color:#1a73e8; margin-bottom:8px;">📦 Carried across every step:</div>
          <div style="font-size:13px; color:#202124; line-height:1.8;">
            Customer identity · Phone · Billing address · Job site · Account # · Line items · Scope notes
          </div>
        </div>

        <div style="margin-top:20px; padding:14px; background:#fff3cd; border-left:4px solid #f9ab00; border-radius:4px;">
          <div style="font-size:12px; color:#7a5a00; font-weight:700; text-transform:uppercase;">⚡ In practice</div>
          <div style="font-size:13px; color:#202124; margin-top:4px;">
            Janet's info is typed once, at the phone message. Every downstream
            document inherits it. Zero re-keying. Zero drift.
          </div>
        </div>
      `);
      setNarrator(6,
        '🔄 The full paper trail',
        `Same customer, different path. Phone → Quote → Work Order → Invoice.
         Each step carries the customer forward automatically. Each step
         gets its own sequential number (800K series for messages, 300K for
         quotes, 500K for work orders, 600K for invoices).`
      );
      await sleep(6000);
    },

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
            <div class="hw-doc"><span><span class="hw-doc-id">#800001</span> ${JANET.name}</span><span class="hw-doc-date">${today()}</span></div>
          </div>
          <div class="hw-stack" data-type="quote">
            <div class="hw-stack-title">Quotes & Proposals</div>
            <div class="hw-doc"><span><span class="hw-doc-id">#300001</span> ${JANET.name}</span><span class="hw-doc-date">${today()}</span></div>
          </div>
          <div class="hw-stack" data-type="work">
            <div class="hw-stack-title">Work Orders</div>
            <div class="hw-doc"><span><span class="hw-doc-id">#500001</span> ${JANET.name}</span><span class="hw-doc-date">${today()}</span></div>
          </div>
          <div class="hw-stack" data-type="service">
            <div class="hw-stack-title">Service Tickets</div>
            <div class="hw-doc"><span><span class="hw-doc-id">#700001</span> ${JANET.name}</span><span class="hw-doc-date">${today()}</span></div>
          </div>
          <div class="hw-stack" data-type="invoice">
            <div class="hw-stack-title">Invoices</div>
            <div class="hw-doc"><span><span class="hw-doc-id">#600001</span> ${JANET.name}</span><span class="hw-doc-date">${today()}</span></div>
          </div>
        </div>
      `);
      setNarrator(7,
        '🔍 Every doc, one search',
        `The dashboard stacks every kind of document. Search by name,
         phone, address, account #, rep name, signature, line-item text —
         whatever the office remembers. One bar. Every field.`
      );
      await sleep(3000);

      // Demo a search
      await typeInto('#hw-search', 'hamburg', 70, 120);
      await sleep(500);

      // "flash" all stacks to show matches
      document.querySelectorAll('#hw-app .hw-stack').forEach(s => s.classList.add('hw-flash'));
      await sleep(2000);
      document.querySelectorAll('#hw-app .hw-stack').forEach(s => s.classList.remove('hw-flash'));

      setNarrator(7,
        '🔍 Single search, 5 results',
        `One typed word — "hamburg" — finds Janet's trail across every
         stack. Every document she's connected to, all at once. No tab
         juggling, no Ctrl-F in Excel, no "did we file that under her
         name or his?"`
      );
      await sleep(3500);
    },

    async outro() {
      setApp(`
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; text-align:center; padding:40px 20px;">
          <div style="font-size:72px; margin-bottom:24px;">⚡</div>
          <div style="font-size:28px; font-weight:900; letter-spacing:-1px; color:#202124; margin-bottom:16px;">That's the whole thing.</div>
          <div style="font-size:16px; color:#5f6368; max-width:560px; line-height:1.6; margin-bottom:30px;">
            One system. Phone to paper to phone again. No lost tickets.
            No re-keying. No "where's that quote Janet wanted?"
          </div>
          <div style="display:flex; gap:16px; margin-bottom:30px;">
            <div style="background:#e8f0fe; color:#1a73e8; padding:16px 20px; border-radius:10px; text-align:center;">
              <div style="font-size:24px; font-weight:900;">3</div>
              <div style="font-size:11px; text-transform:uppercase;">Views</div>
            </div>
            <div style="background:#e6f4ea; color:#1e8e3e; padding:16px 20px; border-radius:10px; text-align:center;">
              <div style="font-size:24px; font-weight:900;">7</div>
              <div style="font-size:11px; text-transform:uppercase;">Forms</div>
            </div>
            <div style="background:#fef7e0; color:#b06000; padding:16px 20px; border-radius:10px; text-align:center;">
              <div style="font-size:24px; font-weight:900;">∞</div>
              <div style="font-size:11px; text-transform:uppercase;">Sync</div>
            </div>
          </div>
          <div style="font-size:12px; color:#9aa0a6;">
            Close this overlay to explore the real app.
          </div>
        </div>
      `);
      setNarrator(8,
        '✅ Demo complete',
        `Three views — Admin, Dispatch, Mobile. Seven forms — Phone,
         Sales, Quote, Work Order, Service, Invoice, Dashboard. One
         Firestore. Real-time sync.<br><br>
         <b>Close this overlay (Esc or ✕) to explore the real thing.</b>`
      );
      await sleep(999999); // wait for user to close
    }
  };

  // ---------- Main loop ----------

  const SCENE_LIST = ['intro', 'phoneMessage', 'serviceTicket', 'dispatch', 'mobile', 'newInstallPipeline', 'dashboard', 'outro'];

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
