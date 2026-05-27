// ── PWA FEATURES — NYS Clerk Exam Prep ──────────────────────
// Handles: push notifications, badging, install prompt,
//          share target, background sync, scheduled reminders

const PWA = (() => {

  // ── NOTIFICATION SCHEDULE ────────────────────────────────
  const REMINDERS = [
    {
      id: 'morning',
      hour: 8, minute: 15,
      title: '📚 Morning commute study',
      body: 'Open ClerkOne. 30 min. You know what to do.',
      url: '/week1_schedule_final.html',
      tag: 'morning-study',
      days: [1,2,3,4,5] // Mon-Fri only
    },
    {
      id: 'lunch',
      hour: 13, minute: 15,
      title: '✍️ Lunch blurt — blank paper',
      body: 'Write everything you remember. No notes. Go.',
      url: '/week1_schedule_final.html',
      tag: 'lunch-study',
      days: [1,2,3,4,5]
    },
    {
      id: 'winddown',
      hour: 20, minute: 0,
      title: '📖 Wind-down time — NO SCREEN after this',
      body: 'Pick up the book. Open it. 15 minutes.',
      url: '/week1_schedule_final.html',
      tag: 'winddown-study',
      days: [1,2,3,4,5,6,0] // Every day
    }
  ];

  let schedulerInterval = null;
  let lastNotifiedDate = {};

  // ── SERVICE WORKER REGISTRATION ──────────────────────────
  async function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      console.log('SW registered:', reg.scope);
      // Check for updates every 60 seconds
      setInterval(() => reg.update(), 60000);
      return reg;
    } catch (e) {
      console.warn('SW registration failed:', e);
    }
  }

  // ── PUSH NOTIFICATION PERMISSION ─────────────────────────
  async function requestNotificationPermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const result = await Notification.requestPermission();
    return result === 'granted';
  }

  // ── SCHEDULED REMINDERS (client-side timer) ───────────────
  // Since we don't have a push server yet, we schedule notifications
  // using setTimeout when the app is open, and store schedules
  // in localStorage so they fire next time the app opens too.
  function startScheduler() {
    if (schedulerInterval) clearInterval(schedulerInterval);
    checkReminders(); // Check immediately
    schedulerInterval = setInterval(checkReminders, 60000); // Every minute
  }

  function checkReminders() {
    if (Notification.permission !== 'granted') return;
    const now = new Date();
    const dayOfWeek = now.getDay();
    const h = now.getHours();
    const m = now.getMinutes();
    const dateKey = now.toDateString();

    REMINDERS.forEach(reminder => {
      if (!reminder.days.includes(dayOfWeek)) return;
      if (h !== reminder.hour || m !== reminder.minute) return;
      const key = reminder.id + '_' + dateKey;
      if (lastNotifiedDate[key]) return; // Already fired today
      lastNotifiedDate[key] = true;
      fireNotification(reminder);
    });
  }

  function fireNotification(reminder) {
    if (!('serviceWorker' in navigator)) {
      // Fallback: direct notification
      new Notification(reminder.title, {
        body: reminder.body,
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-72.png',
        tag: reminder.tag,
        vibrate: [100, 50, 100]
      });
      return;
    }
    navigator.serviceWorker.ready.then(reg => {
      reg.showNotification(reminder.title, {
        body: reminder.body,
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-72.png',
        tag: reminder.tag,
        renotify: true,
        vibrate: [100, 50, 100],
        data: { url: reminder.url },
        actions: [
          { action: 'open', title: '📖 Open now' },
          { action: 'snooze', title: '⏰ Snooze 10min' },
          { action: 'dismiss', title: 'Dismiss' }
        ]
      });
    });
  }

  // ── TEST NOTIFICATION ─────────────────────────────────────
  function sendTestNotification() {
    fireNotification({
      title: '✅ Notifications are working!',
      body: 'You\'ll get reminders at 8:15am, 1:15pm, and 8:00pm on study days.',
      tag: 'test',
      url: '/index.html',
      icon: '/icons/icon-192.png'
    });
  }

  // ── BADGING API ───────────────────────────────────────────
  function updateBadge() {
    if (!('setAppBadge' in navigator)) return;
    try {
      // Count incomplete high-priority tasks today
      const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
      const dayMap = {
        'Monday': 'mon', 'Tuesday': 'tue', 'Wednesday': 'wed',
        'Thursday': 'thu', 'Friday': 'fri', 'Saturday': 'sat', 'Sunday': 'sun'
      };
      const dayKey = dayMap[today];
      if (!dayKey) { navigator.clearAppBadge?.(); return; }

      const checklistState = JSON.parse(localStorage.getItem('nys_week1_checklist') || '{}');
      const dayKeys = Object.keys(checklistState).filter(k => k.startsWith(dayKey + '-'));
      const todayTotal = getTodayTotal(dayKey);
      const todayDone = dayKeys.filter(k => checklistState[k]).length;
      const incomplete = Math.max(0, todayTotal - todayDone);

      if (incomplete > 0) {
        navigator.setAppBadge(incomplete);
      } else {
        navigator.clearAppBadge();
      }
    } catch (e) {
      console.warn('Badge update failed:', e);
    }
  }

  function getTodayTotal(dayKey) {
    const totals = { mon: 8, tue: 8, wed: 8, thu: 9, fri: 5, sat: 7, sun: 12 };
    return totals[dayKey] || 0;
  }

  function clearBadge() {
    navigator.clearAppBadge?.();
  }

  // ── INSTALL PROMPT BANNER ─────────────────────────────────
  let deferredPrompt = null;

  function initInstallPrompt() {
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      deferredPrompt = e;
      // Only show if not already installed
      if (!window.matchMedia('(display-mode: standalone)').matches) {
        showInstallBanner();
      }
    });

    window.addEventListener('appinstalled', () => {
      hideInstallBanner();
      deferredPrompt = null;
      showToast('📱 ClerkPrep installed! Find it on your home screen.', 4000);
    });
  }

  function showInstallBanner() {
    if (document.getElementById('pwa-install-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.style.cssText = `
      position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
      background: #1a1f3c; border: 1px solid #c9952a; border-radius: 14px;
      padding: 14px 18px; display: flex; align-items: center; gap: 12px;
      z-index: 9999; box-shadow: 0 8px 40px rgba(0,0,0,.5);
      font-family: 'DM Sans', sans-serif; max-width: 360px;
      width: calc(100% - 40px); animation: slideUp .3s ease;
    `;
    banner.innerHTML = `
      <style>
        @keyframes slideUp { from { transform: translateX(-50%) translateY(20px); opacity:0; }
                             to   { transform: translateX(-50%) translateY(0);    opacity:1; } }
      </style>
      <span style="font-size:28px">📚</span>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:600;color:white;margin-bottom:2px">Install ClerkPrep</div>
        <div style="font-size:11px;color:rgba(255,255,255,.55)">Works offline · Home screen icon · No browser bar</div>
      </div>
      <button id="pwa-install-btn" style="background:#c9952a;color:#1a1f3c;border:none;border-radius:8px;
        padding:8px 16px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap">
        Install
      </button>
      <button id="pwa-dismiss-btn" style="background:none;border:none;color:rgba(255,255,255,.35);
        font-size:22px;cursor:pointer;padding:0 2px;line-height:1">×</button>
    `;
    document.body.appendChild(banner);
    document.getElementById('pwa-install-btn').onclick = triggerInstall;
    document.getElementById('pwa-dismiss-btn').onclick = hideInstallBanner;
  }

  function hideInstallBanner() {
    document.getElementById('pwa-install-banner')?.remove();
  }

  async function triggerInstall() {
    if (!deferredPrompt) return;
    hideInstallBanner();
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (outcome === 'accepted') {
      showToast('Installing ClerkPrep...', 2000);
    }
  }

  // ── NOTIFICATION PERMISSION BANNER ────────────────────────
  function showNotificationBanner() {
    if (Notification.permission !== 'default') return;
    if (document.getElementById('notif-banner')) return;
    // Small delay so it doesn't fire immediately with install banner
    setTimeout(() => {
      const banner = document.createElement('div');
      banner.id = 'notif-banner';
      banner.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0;
        background: linear-gradient(135deg, #1c2030, #1a1f3c);
        border-bottom: 1px solid #c9952a44; padding: 12px 20px;
        display: flex; align-items: center; gap: 12px; z-index: 9998;
        font-family: 'DM Sans', sans-serif;
      `;
      banner.innerHTML = `
        <span style="font-size:20px">🔔</span>
        <div style="flex:1">
          <div style="font-size:12px;font-weight:600;color:white">Enable study reminders</div>
          <div style="font-size:11px;color:rgba(255,255,255,.5)">8:15am · 1:15pm · 8:00pm daily</div>
        </div>
        <button id="notif-allow-btn" style="background:#c9952a;color:#1a1f3c;border:none;border-radius:7px;
          padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">
          Allow
        </button>
        <button id="notif-deny-btn" style="background:none;border:none;color:rgba(255,255,255,.35);
          font-size:20px;cursor:pointer;padding:0 4px">×</button>
      `;
      document.body.appendChild(banner);
      document.getElementById('notif-allow-btn').onclick = async () => {
        banner.remove();
        const granted = await requestNotificationPermission();
        if (granted) {
          startScheduler();
          showToast('🔔 Reminders set for 8:15am, 1:15pm and 8:00pm', 3000);
          sendTestNotification();
        } else {
          showToast('Notifications blocked. Enable in iPhone Settings → Safari → Notifications.', 4000);
        }
      };
      document.getElementById('notif-deny-btn').onclick = () => banner.remove();
    }, 2000);
  }

  // ── SHARE TARGET HANDLER ──────────────────────────────────
  async function handleSharedContent() {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('shared')) return;

    try {
      const cache = await caches.open('shared-content');
      const res = await cache.match('/shared-latest');
      if (!res) return;
      const data = await res.json();
      await cache.delete('/shared-latest');
      showSharedContentModal(data);
    } catch (e) {
      console.warn('Could not retrieve shared content:', e);
    }
  }

  function showSharedContentModal(data) {
    const modal = document.createElement('div');
    modal.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:10000;
      display:flex;align-items:center;justify-content:center;padding:24px;
      font-family:'DM Sans',sans-serif;
    `;
    modal.innerHTML = `
      <div style="background:#1a1f3c;border:1px solid #c9952a55;border-radius:16px;
        padding:24px;max-width:400px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.6)">
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;
          color:#c9952a;margin-bottom:8px">Shared content received</div>
        <div style="font-size:14px;font-weight:600;color:white;margin-bottom:6px">${data.title || 'No title'}</div>
        <div style="font-size:13px;color:rgba(255,255,255,.6);margin-bottom:14px;
          word-break:break-all;max-height:120px;overflow-y:auto">${data.combined || 'No content'}</div>
        <div style="font-size:12px;color:rgba(255,255,255,.4);margin-bottom:16px">
          Save this to your study resources?
        </div>
        <div style="display:flex;gap:10px">
          <button onclick="PWA.saveSharedToResources('${encodeURIComponent(JSON.stringify(data))}');this.closest('[style]').remove()"
            style="flex:1;background:#c9952a;color:#1a1f3c;border:none;border-radius:8px;
            padding:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">
            Save to Resources
          </button>
          <button onclick="this.closest('[style]').remove()"
            style="background:rgba(255,255,255,.08);color:rgba(255,255,255,.6);border:none;
            border-radius:8px;padding:10px 16px;font-size:13px;cursor:pointer;font-family:inherit">
            Dismiss
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  function saveSharedToResources(encodedData) {
    try {
      const data = JSON.parse(decodeURIComponent(encodedData));
      const saved = JSON.parse(localStorage.getItem('pwa_shared_resources') || '[]');
      saved.push({ ...data, savedAt: new Date().toISOString() });
      localStorage.setItem('pwa_shared_resources', JSON.stringify(saved));
      showToast('✅ Saved to your study resources', 2500);
    } catch (e) {
      showToast('Could not save content', 2000);
    }
  }

  // ── BACKGROUND SYNC REGISTRATION ──────────────────────────
  async function registerSync(tag) {
    if (!('serviceWorker' in navigator)) return;
    if (!('SyncManager' in window)) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.sync.register(tag);
    } catch (e) {
      console.warn('Background sync registration failed:', e);
    }
  }

  // Call this when a checkbox is toggled offline
  function onCheckboxChange() {
    updateBadge();
    registerSync('sync-checklist');
  }

  // ── TOAST NOTIFICATIONS ───────────────────────────────────
  function showToast(message, duration = 3000) {
    const existing = document.getElementById('pwa-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'pwa-toast';
    toast.style.cssText = `
      position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
      background:#2d3561;color:white;padding:10px 20px;border-radius:20px;
      font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;
      z-index:10001;white-space:nowrap;box-shadow:0 4px 20px rgba(0,0,0,.4);
      animation:fadeIn .2s ease;max-width:calc(100% - 40px);text-align:center;
    `;
    toast.innerHTML = `<style>@keyframes fadeIn{from{opacity:0;transform:translateX(-50%) translateY(10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}</style>${message}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
  }

  // ── ONLINE / OFFLINE INDICATOR ─────────────────────────────
  function initNetworkIndicator() {
    const show = (online) => {
      const existing = document.getElementById('network-indicator');
      if (existing) existing.remove();
      if (online) {
        showToast('✅ Back online — syncing your progress', 2500);
        registerSync('sync-checklist');
        return;
      }
      const bar = document.createElement('div');
      bar.id = 'network-indicator';
      bar.style.cssText = `
        position:fixed;top:0;left:0;right:0;background:#c4503a;color:white;
        text-align:center;padding:6px;font-family:'DM Sans',sans-serif;
        font-size:12px;font-weight:500;z-index:9997;
      `;
      bar.textContent = '📵 You\'re offline — cached content available below';
      document.body.appendChild(bar);
    };

    window.addEventListener('online',  () => show(true));
    window.addEventListener('offline', () => show(false));
    if (!navigator.onLine) show(false);
  }

  // ── INIT ──────────────────────────────────────────────────
  async function init() {
    await registerSW();
    initInstallPrompt();
    initNetworkIndicator();

    // If notifications already granted, start scheduler
    if (Notification.permission === 'granted') {
      startScheduler();
    } else {
      showNotificationBanner();
    }

    // Update badge on page load
    updateBadge();

    // Handle shared content from share target
    await handleSharedContent();

    // Patch localStorage setItem to trigger badge update + sync
    const origSet = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function(key, value) {
      origSet(key, value);
      if (key.startsWith('nys_week1')) {
        updateBadge();
        registerSync('sync-checklist');
      }
    };
  }

  // Public API
  return {
    init,
    updateBadge,
    clearBadge,
    showToast,
    triggerInstall,
    sendTestNotification,
    saveSharedToResources,
    registerSync,
    onCheckboxChange
  };

})();

// Auto-init when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => PWA.init());
} else {
  PWA.init();
}
