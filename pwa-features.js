// ── PWA FEATURES v3 — NYS Clerk Exam Prep ───────────────────
// iOS Safari compatible · notifications · badging · offline
// Install: Share → Add to Home Screen (iOS requirement)

const PWA = (() => {

  // ── DETECT PLATFORM ──────────────────────────────────────
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isAndroid = /android/i.test(navigator.userAgent);
  const isMobile = isIOS || isAndroid || window.innerWidth < 768;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;

  // ── NOTIFICATION SCHEDULE ────────────────────────────────
  const REMINDERS = [
    {
      id: 'morning', hour: 8, minute: 15,
      title: '📚 Morning commute — time to study',
      body: 'Open ClerkOne. 30 min. You know what to do.',
      url: 'week1_schedule_final.html',
      tag: 'morning-study', days: [1,2,3,4,5]
    },
    {
      id: 'lunch', hour: 13, minute: 15,
      title: '✍️ Lunch blurt — blank paper',
      body: 'Write everything you remember. No notes. Go.',
      url: 'week1_schedule_final.html',
      tag: 'lunch-study', days: [1,2,3,4,5]
    },
    {
      id: 'winddown', hour: 20, minute: 0,
      title: '📖 Wind-down — NO SCREEN after this',
      body: 'Pick up the book. Open it. 15 minutes.',
      url: 'week1_schedule_final.html',
      tag: 'winddown-study', days: [1,2,3,4,5,6,0]
    }
  ];

  let schedulerInterval = null;
  const firedToday = {};

  // ── SERVICE WORKER ────────────────────────────────────────
  async function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.register('sw.js', { scope: './' });
      setInterval(() => reg.update(), 60000);
      return reg;
    } catch(e) { console.warn('SW failed:', e); }
  }

  // ── iOS INSTALL GUIDE ─────────────────────────────────────
  // Safari on iOS does NOT support beforeinstallprompt.
  // We show a manual guide instead when not yet installed.
  function showIOSInstallGuide() {
    if (!isIOS) return;
    if (isStandalone) return; // already installed
    if (localStorage.getItem('ios_install_dismissed')) return;
    if (document.getElementById('ios-install-guide')) return;

    const guide = document.createElement('div');
    guide.id = 'ios-install-guide';
    guide.style.cssText = `
      position:fixed;bottom:0;left:0;right:0;
      background:#1a1f3c;border-top:2px solid #c9952a;
      padding:16px 20px 32px;z-index:9999;
      font-family:'DM Sans',system-ui,sans-serif;
      animation:slideUp .3s ease;
    `;
    guide.innerHTML = `
      <style>
        @keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
      </style>
      <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:14px">
        <span style="font-size:28px;flex-shrink:0">📚</span>
        <div style="flex:1">
          <div style="font-size:14px;font-weight:600;color:white;margin-bottom:3px">Install ClerkPrep on your iPhone</div>
          <div style="font-size:12px;color:rgba(255,255,255,.55)">Works offline · Home screen icon · No browser bar</div>
        </div>
        <button onclick="PWA.dismissIOSGuide()" style="background:none;border:none;color:rgba(255,255,255,.35);font-size:22px;cursor:pointer;padding:0;line-height:1;flex-shrink:0">×</button>
      </div>
      <div style="display:flex;align-items:center;gap:0;background:rgba(255,255,255,.06);border-radius:12px;padding:12px 14px">
        <div style="display:flex;flex-direction:column;gap:10px;width:100%">
          <div style="display:flex;align-items:center;gap:10px;font-size:13px;color:rgba(255,255,255,.8)">
            <div style="width:28px;height:28px;background:#c9952a;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#1a1f3c;flex-shrink:0">1</div>
            Tap the <span style="display:inline-flex;align-items:center;gap:4px;background:rgba(255,255,255,.12);padding:2px 8px;border-radius:5px;font-size:12px;margin:0 3px">Share <svg width="12" height="14" viewBox="0 0 12 14" fill="none" style="margin-left:2px"><path d="M6 0L10 4H7.5V9H4.5V4H2L6 0Z" fill="rgba(255,255,255,.8)"/><rect x="0" y="6" width="12" height="8" rx="1.5" fill="none" stroke="rgba(255,255,255,.8)" stroke-width="1.2"/></svg></span> button at the bottom of Safari
          </div>
          <div style="display:flex;align-items:center;gap:10px;font-size:13px;color:rgba(255,255,255,.8)">
            <div style="width:28px;height:28px;background:#c9952a;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#1a1f3c;flex-shrink:0">2</div>
            Scroll down and tap <span style="background:rgba(255,255,255,.12);padding:2px 8px;border-radius:5px;font-size:12px;margin:0 3px">Add to Home Screen</span>
          </div>
          <div style="display:flex;align-items:center;gap:10px;font-size:13px;color:rgba(255,255,255,.8)">
            <div style="width:28px;height:28px;background:#c9952a;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#1a1f3c;flex-shrink:0">3</div>
            Tap <span style="background:rgba(255,255,255,.12);padding:2px 8px;border-radius:5px;font-size:12px;margin:0 3px">Add</span> in the top right — done!
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(guide);
  }

  function dismissIOSGuide() {
    document.getElementById('ios-install-guide')?.remove();
    localStorage.setItem('ios_install_dismissed', '1');
  }

  // ── ANDROID INSTALL PROMPT (Chrome) ──────────────────────
  let deferredPrompt = null;

  function initAndroidInstall() {
    if (isIOS) return;
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      deferredPrompt = e;
      if (!isStandalone) showAndroidBanner();
    });
    window.addEventListener('appinstalled', () => {
      document.getElementById('android-install-banner')?.remove();
      showToast('📱 ClerkPrep installed! Find it on your home screen.', 4000);
    });
  }

  function showAndroidBanner() {
    if (document.getElementById('android-install-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'android-install-banner';
    banner.style.cssText = `
      position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
      background:#1a1f3c;border:1px solid #c9952a;border-radius:14px;
      padding:14px 18px;display:flex;align-items:center;gap:12px;
      z-index:9999;box-shadow:0 8px 40px rgba(0,0,0,.5);
      font-family:'DM Sans',system-ui,sans-serif;
      max-width:360px;width:calc(100% - 40px);
    `;
    banner.innerHTML = `
      <span style="font-size:28px">📚</span>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:600;color:white;margin-bottom:2px">Install ClerkPrep</div>
        <div style="font-size:11px;color:rgba(255,255,255,.55)">Offline · Home screen · No browser bar</div>
      </div>
      <button onclick="PWA.triggerAndroidInstall()" style="background:#c9952a;color:#1a1f3c;border:none;border-radius:8px;padding:8px 16px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">Install</button>
      <button onclick="this.parentElement.remove()" style="background:none;border:none;color:rgba(255,255,255,.35);font-size:22px;cursor:pointer;padding:0 2px">×</button>
    `;
    document.body.appendChild(banner);
  }

  async function triggerAndroidInstall() {
    if (!deferredPrompt) return;
    document.getElementById('android-install-banner')?.remove();
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (outcome === 'accepted') showToast('Installing ClerkPrep...', 2000);
  }

  // ── NOTIFICATIONS ─────────────────────────────────────────
  // On iOS: only works when app is installed as PWA (standalone mode)
  // On desktop/Android: works in browser too
  async function requestNotificationPermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const result = await Notification.requestPermission();
    return result === 'granted';
  }

  function showNotificationPrompt() {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'default') return;
    if (document.getElementById('notif-prompt')) return;

    // On iOS, notifications only work in standalone mode
    if (isIOS && !isStandalone) {
      // Don't show notification prompt until installed
      return;
    }

    setTimeout(() => {
      const prompt = document.createElement('div');
      prompt.id = 'notif-prompt';
      prompt.style.cssText = `
        position:fixed;top:0;left:0;right:0;
        background:linear-gradient(135deg,#1c2030,#1a1f3c);
        border-bottom:1px solid rgba(201,149,42,.4);
        padding:12px 20px;display:flex;align-items:center;gap:12px;
        z-index:9998;font-family:'DM Sans',system-ui,sans-serif;
      `;
      prompt.innerHTML = `
        <span style="font-size:20px">🔔</span>
        <div style="flex:1">
          <div style="font-size:12px;font-weight:600;color:white">Enable study reminders</div>
          <div style="font-size:11px;color:rgba(255,255,255,.5)">8:15am · 1:15pm · 8:00pm daily</div>
        </div>
        <button id="notif-allow" style="background:#c9952a;color:#1a1f3c;border:none;border-radius:7px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">Allow</button>
        <button onclick="this.parentElement.remove()" style="background:none;border:none;color:rgba(255,255,255,.35);font-size:20px;cursor:pointer;padding:0 4px">×</button>
      `;
      document.body.appendChild(prompt);
      document.getElementById('notif-allow').onclick = async () => {
        prompt.remove();
        const granted = await requestNotificationPermission();
        if (granted) {
          startScheduler();
          showToast('🔔 Reminders set: 8:15am · 1:15pm · 8:00pm', 3000);
          // Fire a test notification after 3 seconds
          setTimeout(() => fireNotification({
            title: '✅ Study reminders are on!',
            body: 'You\'ll get reminded at 8:15am, 1:15pm, and 8:00pm.',
            tag: 'test', url: 'index.html'
          }), 3000);
        } else {
          showToast('To enable: Settings → Safari → Notifications → ClerkPrep → Allow', 5000);
        }
      };
    }, isStandalone ? 1500 : 2500);
  }

  // ── SCHEDULER ─────────────────────────────────────────────
  function startScheduler() {
    if (schedulerInterval) clearInterval(schedulerInterval);
    checkReminders();
    schedulerInterval = setInterval(checkReminders, 60000);
  }

  function checkReminders() {
    if (Notification.permission !== 'granted') return;
    const now = new Date();
    const day = now.getDay(), h = now.getHours(), m = now.getMinutes();
    const dateKey = now.toDateString();
    REMINDERS.forEach(r => {
      if (!r.days.includes(day)) return;
      if (h !== r.hour || m !== r.minute) return;
      const key = r.id + '_' + dateKey;
      if (firedToday[key]) return;
      firedToday[key] = true;
      fireNotification(r);
    });
  }

  function fireNotification(r) {
    if (!('serviceWorker' in navigator)) {
      new Notification(r.title, {
        body: r.body, icon: 'icons/icon-192.png',
        tag: r.tag, vibrate: [100,50,100]
      });
      return;
    }
    navigator.serviceWorker.ready.then(reg => {
      reg.showNotification(r.title, {
        body: r.body, icon: 'icons/icon-192.png',
        badge: 'icons/badge-72.png', tag: r.tag,
        renotify: true, vibrate: [100,50,100],
        data: { url: r.url || 'index.html' },
        actions: [
          { action: 'open',    title: '📖 Open now' },
          { action: 'snooze',  title: '⏰ 10 min'   },
          { action: 'dismiss', title: 'Dismiss'      }
        ]
      });
    });
  }

  // ── BADGING ───────────────────────────────────────────────
  function updateBadge() {
    if (!('setAppBadge' in navigator)) return;
    try {
      const today = new Date().toLocaleDateString('en-US',{weekday:'long'});
      const map = {Monday:'mon',Tuesday:'tue',Wednesday:'wed',Thursday:'thu',Friday:'fri',Saturday:'sat',Sunday:'sun'};
      const totals = {mon:8,tue:8,wed:8,thu:9,fri:5,sat:7,sun:12};
      const key = map[today];
      if (!key) { navigator.clearAppBadge?.(); return; }
      const state = JSON.parse(localStorage.getItem('nys_week1_checklist')||'{}');
      const done = Object.keys(state).filter(k=>k.startsWith(key+'-')&&state[k]).length;
      const left = Math.max(0, (totals[key]||0) - done);
      left > 0 ? navigator.setAppBadge(left) : navigator.clearAppBadge();
    } catch(e) {}
  }

  // ── RESPONSIVE VIEW SWITCHER ──────────────────────────────
  function initViewSwitcher() {
    if (document.getElementById('view-switcher')) return;
    const switcher = document.createElement('div');
    switcher.id = 'view-switcher';
    switcher.style.cssText = `
      position:fixed;bottom:20px;right:16px;
      display:flex;flex-direction:column;gap:6px;z-index:888;
    `;
    switcher.innerHTML = `
      <button onclick="PWA.setView('mobile')" id="btn-mobile" title="Mobile view"
        style="width:38px;height:38px;border-radius:50%;border:1.5px solid rgba(201,149,42,.5);
        background:#1a1f3c;color:#c9952a;font-size:16px;cursor:pointer;
        display:flex;align-items:center;justify-content:center;box-shadow:0 2px 12px rgba(0,0,0,.4)">📱</button>
      <button onclick="PWA.setView('desktop')" id="btn-desktop" title="Desktop view"
        style="width:38px;height:38px;border-radius:50%;border:1.5px solid rgba(201,149,42,.5);
        background:#1a1f3c;color:#c9952a;font-size:16px;cursor:pointer;
        display:flex;align-items:center;justify-content:center;box-shadow:0 2px 12px rgba(0,0,0,.4)">🖥️</button>
    `;
    document.body.appendChild(switcher);

    // Apply saved preference or auto-detect
    const saved = localStorage.getItem('pwa_view_mode');
    if (saved) { applyView(saved); }
    else { applyView(isMobile ? 'mobile' : 'desktop'); }
  }

  function setView(mode) {
    localStorage.setItem('pwa_view_mode', mode);
    applyView(mode);
    showToast(mode === 'mobile' ? '📱 Mobile view' : '🖥️ Desktop view', 1500);
  }

  function applyView(mode) {
    const root = document.documentElement;
    if (mode === 'mobile') {
      root.style.setProperty('--layout-max', '100%');
      root.style.setProperty('--padding-h', '14px');
      root.style.setProperty('--font-base', '13px');
      root.style.setProperty('--grid-cols', '1fr');
      root.classList.add('mobile-view');
      root.classList.remove('desktop-view');
    } else {
      root.style.setProperty('--layout-max', '1200px');
      root.style.setProperty('--padding-h', '40px');
      root.style.setProperty('--font-base', '14px');
      root.style.setProperty('--grid-cols', '1fr 1fr');
      root.classList.add('desktop-view');
      root.classList.remove('mobile-view');
    }
    // Update button states
    ['mobile','desktop'].forEach(m => {
      const btn = document.getElementById('btn-'+m);
      if (!btn) return;
      btn.style.background = m === mode ? '#c9952a' : '#1a1f3c';
      btn.style.color      = m === mode ? '#1a1f3c' : '#c9952a';
    });
  }

  // ── NETWORK INDICATOR ─────────────────────────────────────
  function initNetworkIndicator() {
    const show = online => {
      document.getElementById('net-bar')?.remove();
      if (online) { showToast('✅ Back online', 2000); return; }
      const bar = document.createElement('div');
      bar.id = 'net-bar';
      bar.style.cssText = `position:fixed;top:0;left:0;right:0;background:#c4503a;
        color:white;text-align:center;padding:6px;font-family:'DM Sans',system-ui,sans-serif;
        font-size:12px;font-weight:500;z-index:9997;`;
      bar.textContent = '📵 Offline — cached content available';
      document.body.appendChild(bar);
    };
    window.addEventListener('online',  () => show(true));
    window.addEventListener('offline', () => show(false));
    if (!navigator.onLine) show(false);
  }

  // ── TOAST ─────────────────────────────────────────────────
  function showToast(msg, duration=3000) {
    document.getElementById('pwa-toast')?.remove();
    const t = document.createElement('div');
    t.id = 'pwa-toast';
    t.style.cssText = `
      position:fixed;bottom:70px;left:50%;transform:translateX(-50%);
      background:#2d3561;color:white;padding:10px 20px;border-radius:20px;
      font-family:'DM Sans',system-ui,sans-serif;font-size:13px;font-weight:500;
      z-index:10001;white-space:nowrap;box-shadow:0 4px 20px rgba(0,0,0,.4);
      animation:fadeIn .2s ease;max-width:calc(100% - 40px);text-align:center;
    `;
    t.innerHTML = `<style>@keyframes fadeIn{from{opacity:0;transform:translateX(-50%) translateY(8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}</style>${msg}`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), duration);
  }

  // ── BACKGROUND SYNC ───────────────────────────────────────
  async function registerSync(tag) {
    if (!('serviceWorker' in navigator) || !('SyncManager' in window)) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.sync.register(tag);
    } catch(e) {}
  }

  // ── PATCH localStorage FOR AUTO BADGE + SYNC ──────────────
  function patchStorage() {
    const orig = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function(key, value) {
      orig(key, value);
      if (key.startsWith('nys_week1')) {
        updateBadge();
        registerSync('sync-checklist');
      }
    };
  }

  // ── GLOBAL RESPONSIVE CSS ─────────────────────────────────
  function injectResponsiveCSS() {
    const style = document.createElement('style');
    style.textContent = `
      :root {
        --layout-max: ${isMobile ? '100%' : '1200px'};
        --padding-h:  ${isMobile ? '14px'  : '40px'};
        --font-base:  ${isMobile ? '13px'  : '14px'};
        --grid-cols:  ${isMobile ? '1fr'   : '1fr 1fr'};
      }
      /* Mobile-view overrides */
      html.mobile-view .main,
      html.mobile-view .header,
      html.mobile-view .bar,
      html.mobile-view .legend,
      html.mobile-view .tab-bar,
      html.mobile-view .panel { padding-left:14px!important; padding-right:14px!important; }
      html.mobile-view .main  { grid-template-columns:1fr!important; }
      html.mobile-view .two   { grid-template-columns:1fr!important; }
      html.mobile-view .art-grid { grid-template-columns:1fr!important; }
      html.mobile-view .day-card { font-size:13px; }
      html.mobile-view .header h1 { font-size:22px!important; }
      html.mobile-view .cl-days { grid-template-columns:1fr!important; }
      html.mobile-view .quiz-wrap .qi-actions { flex-direction:column!important; }
      html.mobile-view .week-viz .viz-row { grid-template-columns:repeat(4,1fr)!important; }
      /* Desktop-view overrides */
      html.desktop-view .main  { padding-left:40px!important; padding-right:40px!important; }
      html.desktop-view body   { font-size:14px!important; }
      /* Smooth font scaling */
      @media (max-width: 480px) {
        body { font-size: 13px; }
        .header h1 { font-size: 22px!important; }
        .day-name  { font-size: 16px!important; }
        .block     { grid-template-columns: 72px 1fr!important; }
      }
    `;
    document.head.appendChild(style);
  }

  // ── INIT ──────────────────────────────────────────────────
  async function init() {
    injectResponsiveCSS();
    await registerSW();
    initAndroidInstall();
    initNetworkIndicator();
    initViewSwitcher();
    patchStorage();
    updateBadge();

    // iOS: show install guide
    if (isIOS && !isStandalone) {
      setTimeout(showIOSInstallGuide, 3000);
    }

    // Notifications
    if (Notification.permission === 'granted') {
      startScheduler();
    } else {
      showNotificationPrompt();
    }
  }

  return {
    init, setView, updateBadge, showToast,
    triggerAndroidInstall, dismissIOSGuide,
    fireNotification, registerSync
  };

})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => PWA.init());
} else {
  PWA.init();
}
