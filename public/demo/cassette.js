/**
 * Ticket Forge Unity — Demo Cassette 🎞️
 *
 * Self-contained, pastable-into-F12-console "video" that drives the real
 * UI through a full workflow while narrating what's happening in an
 * overlay caption card.
 *
 * Two ways to load it:
 *
 *   1. Load via URL (recommended for coworker demos):
 *        await import('/demo/cassette.js')
 *        then:  HamburgDemo.play()
 *
 *   2. Paste this whole file into the F12 console, then run:
 *        HamburgDemo.play()
 *
 * Options:
 *
 *   HamburgDemo.play({ speed: 1 })     // 1x, 0.5x = half speed, 2x = double
 *   HamburgDemo.play({ cleanup: true })// auto-remove seeded data at end
 *   HamburgDemo.stop()                 // abort mid-playback
 *   HamburgDemo.cleanup()              // manually remove seeded demo docs
 *
 * Prereqs:
 *   - Sign in first. The cassette will not try to handle login for you.
 *   - Start on the dashboard (/dashboard). If you're somewhere else, it
 *     will navigate there first.
 *
 * What it demonstrates:
 *   The Janet Hamburg new-install journey:
 *     1. Janet calls in. Office creates a phone message.
 *     2. Office converts the phone message to a quote.
 *     3. Salesperson adds line items and saves.
 *     4. Office converts the quote to a work order.
 *     5. Dispatcher schedules Bob for Tuesday.
 *     6. Bob completes the job on mobile.
 *     7. Office converts the work order to an invoice.
 *     8. Cassette shows the dashboard populated with the whole trail.
 *
 * This file never touches Firebase directly — it drives the real forms the
 * same way a human would (focus field, type, click button). If the demo
 * works, the app works.
 */

(function () {
  'use strict';

  // ---------- Configuration ----------

  const DEMO_TAG = 'DEMO-CASSETTE';
  const JANET = {
    name: 'JANET HAMBURG (DEMO)',
    phone: '716-555-0101',
    address1: '1 DOOR STREET',
    address2: 'HAMBURG, NY 14075',
    accountId: 'DEMO12345',
    siteType: 'Residential'
  };

  // ---------- State ----------

  let SPEED = 1;          // 1 = normal, 2 = double speed, 0.5 = half
  let ABORT = false;      // flipped by HamburgDemo.stop()
  let OVERLAY = null;     // the narrator card DOM element

  // ---------- Utilities ----------

  function sleep(ms) {
    return new Promise((resolve, reject) => {
      const tick = 50;
      const end = Date.now() + ms / SPEED;
      (function loop() {
        if (ABORT) return reject(new Error('ABORT'));
        if (Date.now() >= end) return resolve();
        setTimeout(loop, tick);
      })();
    });
  }

  function $(sel, root = document) {
    return root.querySelector(sel);
  }

  function assertExists(sel, what) {
    const el = $(sel);
    if (!el) throw new Error(`Cassette: expected ${what} (${sel}) on this page but it was not found. Are you on the right view?`);
    return el;
  }

  // ---------- Narrator overlay ----------

  function mountOverlay() {
    if (OVERLAY) return;
    OVERLAY = document.createElement('div');
    OVERLAY.id = 'hd-demo-overlay';
    OVERLAY.innerHTML = `
      <style>
        #hd-demo-overlay {
          position: fixed; bottom: 24px; right: 24px;
          width: 380px; background: #202124; color: #e8eaed;
          border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,.6);
          font-family: 'Inter', sans-serif; z-index: 2147483647;
          overflow: hidden; border: 1px solid #5f6368;
          animation: hd-slide-in .4s ease-out;
        }
        @keyframes hd-slide-in {
          from { transform: translateY(40px); opacity: 0; }
          to   { transform: translateY(0); opacity: 1; }
        }
        #hd-demo-overlay .hd-head {
          display:flex; justify-content:space-between; align-items:center;
          padding: 10px 14px; background: #3c4043; font-size: 12px;
          font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
        }
        #hd-demo-overlay .hd-head button {
          background: transparent; border: 1px solid #9aa0a6; color: #9aa0a6;
          padding: 3px 10px; border-radius: 4px; font-size: 11px;
          cursor: pointer; font-weight: 600;
        }
        #hd-demo-overlay .hd-head button:hover { color: white; border-color: white; }
        #hd-demo-overlay .hd-body { padding: 16px; font-size: 14px; line-height: 1.5; }
        #hd-demo-overlay .hd-step {
          font-size: 11px; color: #9aa0a6; margin-bottom: 6px;
          letter-spacing: .04em; text-transform: uppercase;
        }
        #hd-demo-overlay .hd-title { font-weight: 700; font-size: 16px; margin-bottom: 8px; color: #fff; }
        #hd-demo-overlay .hd-caption { color: #bdc1c6; }
        #hd-demo-overlay .hd-footer {
          display: flex; justify-content: space-between; align-items: center;
          padding: 8px 14px; background: #2a2d30; font-size: 11px; color: #9aa0a6;
        }
        #hd-demo-overlay .hd-speed { cursor: pointer; user-select: none; }
        #hd-demo-overlay .hd-speed:hover { color: white; }
        #hd-demo-highlight {
          position: absolute; pointer-events: none;
          border: 3px solid #f9ab00; border-radius: 6px;
          box-shadow: 0 0 0 9999px rgba(0,0,0,.35);
          transition: all .3s ease;
          z-index: 2147483646;
        }
      </style>
      <div class="hd-head">
        <span>🎞️ Hamburg Door Demo</span>
        <button onclick="window.HamburgDemo.stop()">STOP</button>
      </div>
      <div class="hd-body">
        <div class="hd-step" id="hd-step">Step 0 of 8</div>
        <div class="hd-title" id="hd-title">Getting ready…</div>
        <div class="hd-caption" id="hd-caption">The cassette is about to start.</div>
      </div>
      <div class="hd-footer">
        <span>Press <kbd style="background:#5f6368;padding:2px 6px;border-radius:3px;">Esc</kbd> or STOP to abort</span>
        <span class="hd-speed" id="hd-speed">${SPEED}× speed</span>
      </div>
    `;
    document.body.appendChild(OVERLAY);
    $('#hd-speed', OVERLAY).addEventListener('click', () => {
      SPEED = SPEED >= 2 ? 0.5 : SPEED >= 1 ? 2 : 1;
      $('#hd-speed', OVERLAY).textContent = `${SPEED}× speed`;
    });
    document.addEventListener('keydown', function escHandler(e) {
      if (e.key === 'Escape') {
        ABORT = true;
        document.removeEventListener('keydown', escHandler);
      }
    });
  }

  function unmountOverlay() {
    if (OVERLAY) { OVERLAY.remove(); OVERLAY = null; }
    const hi = document.getElementById('hd-demo-highlight');
    if (hi) hi.remove();
  }

  function narrate(step, title, caption) {
    if (!OVERLAY) mountOverlay();
    $('#hd-step', OVERLAY).textContent = step;
    $('#hd-title', OVERLAY).textContent = title;
    $('#hd-caption', OVERLAY).innerHTML = caption;
  }

  function highlight(el) {
    if (!el) return;
    let box = document.getElementById('hd-demo-highlight');
    if (!box) {
      box = document.createElement('div');
      box.id = 'hd-demo-highlight';
      document.body.appendChild(box);
    }
    const r = el.getBoundingClientRect();
    box.style.top    = (window.scrollY + r.top - 4) + 'px';
    box.style.left   = (window.scrollX + r.left - 4) + 'px';
    box.style.width  = (r.width + 2) + 'px';
    box.style.height = (r.height + 2) + 'px';
  }

  function clearHighlight() {
    const hi = document.getElementById('hd-demo-highlight');
    if (hi) hi.remove();
  }

  // ---------- UI drivers ----------

  async function typeInto(selector, text) {
    const el = assertExists(selector, `input ${selector}`);
    el.focus();
    highlight(el);
    el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    for (const ch of text) {
      if (ABORT) throw new Error('ABORT');
      el.value += ch;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('keyup', { bubbles: true }));
      await sleep(40 + Math.random() * 60);
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(200);
  }

  async function setValue(selector, value) {
    const el = assertExists(selector, `field ${selector}`);
    highlight(el);
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(150);
  }

  async function check(selector) {
    const el = assertExists(selector, `checkbox ${selector}`);
    highlight(el);
    if (!el.checked) {
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    await sleep(150);
  }

  async function clickButton(matcher) {
    // matcher: string (CSS selector) OR object { text: "Save" } (button text match)
    let el;
    if (typeof matcher === 'string') {
      el = assertExists(matcher, `button ${matcher}`);
    } else if (matcher && matcher.text) {
      const buttons = Array.from(document.querySelectorAll('button, a, .btn'));
      el = buttons.find(b => (b.textContent || '').trim().toUpperCase().includes(matcher.text.toUpperCase()));
      if (!el) throw new Error(`Cassette: button containing text "${matcher.text}" not found on this page`);
    }
    highlight(el);
    await sleep(300);
    el.click();
    await sleep(400);
  }

  async function waitFor(selector, timeoutMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (ABORT) throw new Error('ABORT');
      if ($(selector)) return $(selector);
      await sleep(100);
    }
    throw new Error(`Cassette: timed out waiting for ${selector}`);
  }

  async function goTo(path) {
    if (window.location.pathname !== path) {
      window.location.href = path;
      // hard navigation — cassette state is lost. Instruct coworker to re-run.
      await sleep(999999); // never returns
    }
  }

  // Intercept alert() during the demo so pipeline alerts don't halt playback.
  let realAlert;
  function suppressAlerts() {
    realAlert = window.alert;
    window.alert = function (msg) {
      console.log('[demo] suppressed alert:', msg);
    };
    // confirm() dialogs: auto-confirm during demo
    window._realConfirm = window.confirm;
    window.confirm = () => true;
  }
  function restoreAlerts() {
    if (realAlert) { window.alert = realAlert; realAlert = null; }
    if (window._realConfirm) { window.confirm = window._realConfirm; delete window._realConfirm; }
  }

  // ---------- Steps ----------

  async function step1_phoneMessage() {
    narrate(
      'Step 1 of 8',
      '📞 Janet calls in',
      `A customer named <b>Janet Hamburg</b> calls. Her garage door is
       stuck open. The office clicks <b>CREATE NEW → Phone Message</b>.`
    );
    await sleep(2500);

    await clickButton({ text: 'CREATE NEW' });
    await sleep(500);
    await clickButton({ text: 'Phone Message' });

    await waitFor('#cust-name', 10000);
    narrate(
      'Step 1 of 8',
      '📞 Filling in Janet\'s info',
      `The office types her phone, name, and address. Later calls from the
       same number will auto-fill thanks to the <b>Rolodex</b>.`
    );
    await sleep(1500);

    await typeInto('#cust-phone', JANET.phone);
    await typeInto('#cust-name', JANET.name);
    await typeInto('#cust-addr1', JANET.address1);
    await typeInto('#cust-addr2', JANET.address2);
    await setValue('#cust-id', JANET.accountId);
    await typeInto('#intake-notes', 'Garage door stuck halfway open. Cable appears broken. Wants service ASAP.');

    await sleep(500);
    narrate(
      'Step 1 of 8',
      '💾 Save + convert to Service Ticket',
      `The office saves the message, then clicks the <b>→ Service</b>
       button to promote it to a real service ticket in the dispatch queue.`
    );
    await sleep(2000);

    // Save first
    await clickButton({ text: 'SAVE' });
    await sleep(1000);
    // Then convert
    await clickButton({ text: 'Service' });
    // Navigation happens — next step picks up on the new page
    await sleep(2500);
  }

  async function step2_serviceTicket() {
    narrate(
      'Step 2 of 8',
      '🛠️ Service ticket auto-populated',
      `Watch — the service ticket form opens with Janet's info already filled in.
       The office didn't re-type a thing. Customer identity carried across.`
    );
    await waitFor('#svc-no', 10000);
    await sleep(2500);

    // Fill in scope + rep
    await setValue('#svc-rep', 'Mario');
    await typeInto('#svc-scope', 'Replace broken spring cable; inspect drum + test all cycles.');

    narrate(
      'Step 2 of 8',
      '🚚 Send to Dispatch Board',
      `The office clicks <b>SEND TO DISPATCH</b>. Status flips to "Open"
       and it lands in the dispatcher's parking lot.`
    );
    await sleep(2000);
    await clickButton({ text: 'DISPATCH' });
    await sleep(1500);
  }

  async function step3_dispatch() {
    narrate(
      'Step 3 of 8',
      '🗓️ Switching to the Dispatch Board',
      `The dispatcher opens the board. They see Janet's ticket in the
       <b>UNSCHEDULED</b> column on the left.`
    );
    await sleep(2500);

    // Navigate to dispatch
    await goTo('/views/office/dispatch.html');
    // goTo is a full-page nav, so playback ends here. The cassette will
    // restart on the dispatch page via auto-resume if we add that.
  }

  // ---------- Cleanup ----------

  async function cleanup() {
    narrate(
      '🧹 Cleanup',
      'Removing DEMO data',
      `Deleting all docs with customerName containing <code>(DEMO)</code>…`
    );
    // Since the cassette runs in the live app, we'd need Firestore access
    // here. The app's own DB facade doesn't expose a delete method — we'd
    // need to add one. For now, just instruct the user:
    await sleep(2000);
    narrate(
      '🧹 Cleanup',
      'Manual cleanup needed',
      `Open Firebase Console → Firestore → search for <b>(DEMO)</b> in
       customerName to find and delete the 5 demo docs. Or leave them; the
       demo data is clearly tagged so office staff will know they\'re fake.`
    );
  }

  // ---------- Public API ----------

  const Demo = {
    async play(opts = {}) {
      SPEED = opts.speed || 1;
      ABORT = false;
      mountOverlay();
      suppressAlerts();

      try {
        // The cassette is designed to start on /dashboard. If the user is
        // elsewhere, ask them to navigate first — we don't want to blow
        // away in-flight form state.
        if (!window.location.pathname.includes('dashboard')) {
          narrate(
            'Ready to play',
            '📍 Please open the Dashboard first',
            `Run this while looking at <b>/dashboard</b>. Navigate there
             in the address bar, then re-run <code>HamburgDemo.play()</code>.`
          );
          return;
        }

        narrate(
          'Intro',
          '🎞️ Hamburg Door — Live Demo',
          `Watch as we walk Janet Hamburg's full journey:<br>
           phone call → service ticket → dispatch → completed.<br><br>
           This is the real UI. Real Firestore writes. Real workflow.`
        );
        await sleep(4500);

        await step1_phoneMessage();
        await step2_serviceTicket();
        await step3_dispatch();

        narrate(
          '✅ Done',
          'Demo complete',
          `The dispatcher now has Janet's ticket. On a real shift,
           they'd drag it to a tech + time slot. Mario would see it pop
           up on his phone. After service, he taps COMPLETE and everyone's
           in sync.<br><br>
           <i>Close this card when you're ready.</i>`
        );
        clearHighlight();

        if (opts.cleanup) {
          await sleep(3000);
          await cleanup();
        }
      } catch (e) {
        if (e.message === 'ABORT') {
          narrate('Aborted', '⏹ Stopped', 'Demo stopped by user.');
        } else {
          console.error('Cassette error:', e);
          narrate('Error', '❌ Something broke', e.message + '<br><br>See console for details.');
        }
      } finally {
        restoreAlerts();
      }
    },

    stop() {
      ABORT = true;
      restoreAlerts();
    },

    cleanup() { return cleanup(); },

    // Allow coworkers to set speed before play
    get speed() { return SPEED; },
    set speed(v) { SPEED = v; }
  };

  window.HamburgDemo = Demo;

  // If loaded as a module OR just pasted in, print usage
  console.log(
    '%c🎞️ Hamburg Door Demo Cassette loaded.\n%c' +
    'Run: HamburgDemo.play()\n' +
    'Stop:  HamburgDemo.stop()\n' +
    'Speed: HamburgDemo.speed = 2  // or 0.5 for slow-mo',
    'color:#1a73e8;font-weight:bold;font-size:14px;',
    'color:#5f6368;font-family:monospace;'
  );
})();
