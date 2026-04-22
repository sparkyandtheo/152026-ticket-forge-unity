// public/js/pwa-install-banner.js
//
// Smart PWA install banner for mobile visitors. Shows a small bottom-docked
// card with "Install Hamburg Door on your home screen" and the right call
// to action for the user's platform:
//
//   - Chrome / Android: native beforeinstallprompt (one-tap install).
//   - iOS Safari: shows a how-to hint (Safari doesn't support the prompt).
//
// The banner hides itself when:
//   - Already running as an installed PWA (display-mode: standalone).
//   - User clicks DISMISS (sets localStorage for 7 days).
//   - Viewport is not mobile-sized (min-width 900px).

(function () {
    'use strict';

    const DISMISS_KEY = 'hd-pwa-banner-dismissed-until';
    const SEVEN_DAYS  = 7 * 24 * 60 * 60 * 1000;

    // Already installed?
    const isStandalone =
        window.matchMedia?.('(display-mode: standalone)').matches ||
        window.navigator.standalone === true;
    if (isStandalone) return;

    // Dismissed recently?
    const dismissedUntil = parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10);
    if (dismissedUntil && Date.now() < dismissedUntil) return;

    // Not a mobile-sized viewport?
    if (window.innerWidth > 900) return;

    // Detect platform. iOS Safari is the awkward case \u2014 no beforeinstallprompt,
    // install is manual via the Share sheet.
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    const isAndroid = /Android/.test(ua);

    let deferredPrompt = null;

    function mount(mode) {
        if (document.getElementById('hd-pwa-banner')) return;
        const banner = document.createElement('div');
        banner.id = 'hd-pwa-banner';
        banner.innerHTML = `
            <style>
                #hd-pwa-banner {
                    position: fixed; left: 10px; right: 10px; bottom: 10px;
                    background: #202124; color: white; z-index: 9999;
                    border-radius: 12px; padding: 14px 16px;
                    box-shadow: 0 8px 24px rgba(0,0,0,.35);
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                    display: flex; align-items: center; gap: 14px;
                    animation: hd-pwa-slide .35s ease-out;
                }
                @keyframes hd-pwa-slide {
                    from { transform: translateY(120%); opacity: 0; }
                    to   { transform: translateY(0);     opacity: 1; }
                }
                #hd-pwa-banner .hd-pwa-icon { font-size: 28px; }
                #hd-pwa-banner .hd-pwa-text { flex: 1; font-size: 13px; line-height: 1.35; }
                #hd-pwa-banner .hd-pwa-text b { display: block; font-size: 14px; margin-bottom: 2px; }
                #hd-pwa-banner .hd-pwa-text small {
                    display: block; color: #9aa0a6; margin-top: 3px; font-size: 11px;
                }
                #hd-pwa-banner .hd-pwa-actions { display: flex; gap: 8px; align-items: center; }
                #hd-pwa-banner button {
                    border: none; border-radius: 8px; padding: 9px 14px;
                    font-family: inherit; font-weight: 700; font-size: 12px;
                    cursor: pointer; text-transform: uppercase; letter-spacing: .03em;
                }
                #hd-pwa-banner .hd-pwa-install {
                    background: #1a73e8; color: white;
                }
                #hd-pwa-banner .hd-pwa-install:hover { background: #1557b0; }
                #hd-pwa-banner .hd-pwa-dismiss {
                    background: transparent; color: #9aa0a6; padding: 6px 10px;
                }
                #hd-pwa-banner .hd-pwa-dismiss:hover { color: white; }
                #hd-pwa-banner.hd-ios-expanded .hd-ios-detail { display: block; }
                #hd-pwa-banner .hd-ios-detail {
                    display: none; margin-top: 10px; padding-top: 10px;
                    border-top: 1px solid #3c4043; font-size: 12px;
                    color: #bdc1c6; line-height: 1.6;
                }
            </style>

            <div class="hd-pwa-icon">\ud83d\udce5</div>

            <div class="hd-pwa-text">
                <b>Install Hamburg Door</b>
                Add to your home screen for one-tap access, offline support,
                and native-app feel.
                ${mode === 'ios' ? `
                    <div class="hd-ios-detail">
                        1. Tap the <b>Share</b> button \ud83d\udd17 at the bottom of Safari<br>
                        2. Scroll down and tap <b>\u201cAdd to Home Screen\u201d</b><br>
                        3. Tap <b>Add</b> in the top-right
                    </div>
                ` : ''}
            </div>

            <div class="hd-pwa-actions">
                ${mode === 'android' ? `<button class="hd-pwa-install" id="hd-pwa-install-btn">Install</button>` : ''}
                ${mode === 'ios'     ? `<button class="hd-pwa-install" id="hd-pwa-how">How?</button>` : ''}
                <button class="hd-pwa-dismiss" id="hd-pwa-dismiss-btn">\u2715</button>
            </div>
        `;
        document.body.appendChild(banner);

        const installBtn = document.getElementById('hd-pwa-install-btn');
        if (installBtn) {
            installBtn.addEventListener('click', async () => {
                if (!deferredPrompt) return;
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                console.log('[pwa] user choice:', outcome);
                deferredPrompt = null;
                banner.remove();
            });
        }

        const howBtn = document.getElementById('hd-pwa-how');
        if (howBtn) {
            howBtn.addEventListener('click', () => {
                banner.classList.toggle('hd-ios-expanded');
                howBtn.textContent = banner.classList.contains('hd-ios-expanded') ? 'Hide' : 'How?';
            });
        }

        document.getElementById('hd-pwa-dismiss-btn').addEventListener('click', () => {
            localStorage.setItem(DISMISS_KEY, String(Date.now() + SEVEN_DAYS));
            banner.remove();
        });
    }

    if (isAndroid) {
        // Native install prompt is available; wait for the browser to emit it.
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            mount('android');
        });
    } else if (isIOS) {
        // iOS Safari has no beforeinstallprompt \u2014 show the manual hint.
        // Delay slightly so it doesn't fight with page load.
        setTimeout(() => mount('ios'), 1500);
    }
    // Desktop / unknown \u2014 no banner.
})();
