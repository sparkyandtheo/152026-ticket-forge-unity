// public/js/pwa-install-banner.js
//
// PWA install encouragement across every platform that supports it:
//
//   - Desktop Chrome / Edge: top-right pill when the browser signals
//     installability. One click -> app window, pinned to dock/taskbar.
//   - Android Chrome: bottom-docked card with a one-tap INSTALL button.
//   - iOS Safari: bottom-docked card with how-to instructions, since iOS
//     doesn't expose the install prompt as an event.
//
// The banner hides itself when:
//   - Already running as an installed PWA (display-mode: standalone).
//   - User clicks DISMISS (sets localStorage for 7 days).
//   - A desktop browser that doesn't fire beforeinstallprompt -> silent.

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

    // Detect platform.
    const ua = navigator.userAgent;
    const isIOS     = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    const isAndroid = /Android/.test(ua);

    let deferredPrompt = null;

    function mount(mode) {
        if (document.getElementById('hd-pwa-banner')) return;
        const banner = document.createElement('div');
        banner.id = 'hd-pwa-banner';
        banner.dataset.mode = mode;

        const isDesktop = mode === 'desktop';
        const isIOSMode = mode === 'ios';
        const isAndroidMode = mode === 'android';

        banner.innerHTML = `
            <style>
                /* Shared base */
                #hd-pwa-banner {
                    background: #202124; color: white; z-index: 9999;
                    box-shadow: 0 8px 24px rgba(0,0,0,.35);
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                    display: flex; align-items: center; gap: 14px;
                }
                /* Mobile: bottom-docked full-width card */
                #hd-pwa-banner[data-mode="android"],
                #hd-pwa-banner[data-mode="ios"] {
                    position: fixed; left: 10px; right: 10px; bottom: 10px;
                    border-radius: 12px; padding: 14px 16px;
                    animation: hd-pwa-slide-up .35s ease-out;
                }
                /* Desktop: top-right compact pill */
                #hd-pwa-banner[data-mode="desktop"] {
                    position: fixed; top: 16px; right: 16px;
                    max-width: 380px; border-radius: 14px; padding: 14px 16px;
                    animation: hd-pwa-slide-down .35s ease-out;
                }
                @keyframes hd-pwa-slide-up {
                    from { transform: translateY(120%); opacity: 0; }
                    to   { transform: translateY(0);     opacity: 1; }
                }
                @keyframes hd-pwa-slide-down {
                    from { transform: translateY(-30px); opacity: 0; }
                    to   { transform: translateY(0);      opacity: 1; }
                }
                #hd-pwa-banner .hd-pwa-icon { font-size: 28px; flex-shrink: 0; }
                #hd-pwa-banner .hd-pwa-text { flex: 1; font-size: 13px; line-height: 1.35; }
                #hd-pwa-banner .hd-pwa-text b { display: block; font-size: 14px; margin-bottom: 2px; }
                #hd-pwa-banner .hd-pwa-text small {
                    display: block; color: #9aa0a6; margin-top: 3px; font-size: 11px;
                }
                #hd-pwa-banner .hd-pwa-actions { display: flex; gap: 8px; align-items: center; flex-shrink: 0; }
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

            <div class="hd-pwa-icon">${isDesktop ? '\ud83d\udda5\ufe0f' : '\ud83d\udce5'}</div>

            <div class="hd-pwa-text">
                <b>${isDesktop
                    ? 'Install as a desktop app'
                    : 'Install Hamburg Door'}</b>
                ${isDesktop
                    ? 'Pin to your dock or taskbar. Opens in its own window \u2014 no tabs, no URL bar.'
                    : 'Add to your home screen for one-tap access, offline support, and native-app feel.'}
                ${isIOSMode ? `
                    <div class="hd-ios-detail">
                        1. Tap the <b>Share</b> button \ud83d\udd17 at the bottom of Safari<br>
                        2. Scroll and tap <b>"Add to Home Screen"</b><br>
                        3. Tap <b>Add</b> in the top-right
                    </div>
                ` : ''}
            </div>

            <div class="hd-pwa-actions">
                ${isAndroidMode || isDesktop
                    ? `<button class="hd-pwa-install" id="hd-pwa-install-btn">Install</button>`
                    : ''}
                ${isIOSMode
                    ? `<button class="hd-pwa-install" id="hd-pwa-how">How?</button>`
                    : ''}
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

    if (isIOS) {
        // iOS Safari has no beforeinstallprompt; show the manual hint.
        setTimeout(() => mount('ios'), 1500);
    } else {
        // Mobile Chrome/Edge (Android) AND Desktop Chrome/Edge both emit
        // beforeinstallprompt when the PWA meets install criteria (HTTPS,
        // manifest, service worker). We pick the right UI based on the
        // viewport at prompt time.
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            mount(isAndroid ? 'android' : 'desktop');
        });

        // Clean up the banner if the user accepts the install from anywhere.
        window.addEventListener('appinstalled', () => {
            const banner = document.getElementById('hd-pwa-banner');
            if (banner) banner.remove();
            console.log('[pwa] installed.');
        });
    }
})();
