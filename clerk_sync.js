// ── NYS CLERK EXAM — Supabase Sync System ─────────────────
// Syncs checkboxes, quiz scores, mnemonics, test scores,
// spaced rep diary, and streaks across all devices
// Supabase project: khddivyhzdlptkoznytl

const CLERK_SYNC = (() => {

  const URL = 'https://khddivyhzdlptkoznytl.supabase.co';
  const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtoZGRpdnloemRscHRrb3pueXRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNDk3OTksImV4cCI6MjA5NTgyNTc5OX0.jnTbiHdFPYK1K282polY59j3OG2TcrQesrly1UZojB8';
  const USER  = 'ncolton_main';
  const HEADERS = {
    'apikey': KEY,
    'Authorization': `Bearer ${KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates'
  };

  let syncTimer = null;
  let online = navigator.onLine;

  // ── CORE FETCH ───────────────────────────────────────────
  async function sb(table, method = 'GET', body = null, query = '') {
    try {
      const res = await fetch(`${URL}/rest/v1/${table}${query}`, {
        method,
        headers: HEADERS,
        body: body ? JSON.stringify(body) : null
      });
      if (!res.ok) {
        const err = await res.text();
        console.warn(`Sync ${method} ${table} failed:`, err);
        return null;
      }
      return method === 'GET' ? res.json() : true;
    } catch(e) {
      console.warn('Sync offline:', e.message);
      online = false;
      return null;
    }
  }

  // ── UPSERT (insert or update) ─────────────────────────────
  async function upsert(table, data) {
    return sb(table, 'POST', data);
  }

  // ── PROGRESS / CHECKBOXES ─────────────────────────────────
  async function saveProgress(week, blockKey, checked) {
    return upsert('progress', {
      user_id: USER,
      week,
      block_key: blockKey,
      checked,
      updated_at: new Date().toISOString()
    });
  }

  async function loadProgress(week) {
    const data = await sb('progress', 'GET', null,
      `?user_id=eq.${USER}&week=eq.${week}`);
    if (!data) return {};
    const result = {};
    data.forEach(row => { result[row.block_key] = row.checked; });
    return result;
  }

  async function loadAllProgress() {
    const data = await sb('progress', 'GET', null,
      `?user_id=eq.${USER}`);
    if (!data) return {};
    const result = {};
    data.forEach(row => {
      result[`${row.week}_${row.block_key}`] = row.checked;
    });
    return result;
  }

  // ── QUIZ SCORES ───────────────────────────────────────────
  async function saveQuizScore(article, questionNum, chosen, correct, week) {
    return upsert('quiz_scores', {
      user_id: USER,
      article,
      question_num: questionNum,
      chosen,
      correct,
      week,
      updated_at: new Date().toISOString()
    });
  }

  async function loadQuizScores(article) {
    const data = await sb('quiz_scores', 'GET', null,
      `?user_id=eq.${USER}&article=eq.${encodeURIComponent(article)}`);
    if (!data) return {};
    const result = {};
    data.forEach(row => { result[row.question_num] = row.chosen; });
    return result;
  }

  // ── TEST SCORES ───────────────────────────────────────────
  async function saveTestScore(week, score, notes = '') {
    return upsert('test_scores', {
      user_id: USER,
      week,
      score,
      notes,
      created_at: new Date().toISOString()
    });
  }

  async function loadTestScores() {
    return sb('test_scores', 'GET', null,
      `?user_id=eq.${USER}&order=created_at.desc`);
  }

  // ── MNEMONICS ─────────────────────────────────────────────
  async function saveMnemonic(day, article, text) {
    return upsert('mnemonics', {
      user_id: USER,
      day,
      article,
      mnemonic_text: text,
      updated_at: new Date().toISOString()
    });
  }

  async function loadMnemonics() {
    const data = await sb('mnemonics', 'GET', null,
      `?user_id=eq.${USER}&order=updated_at.desc`);
    if (!data) return {};
    const result = {};
    data.forEach(row => {
      result[`${row.day}_${row.article}`] = row.mnemonic_text;
    });
    return result;
  }

  // ── SPACED REP ────────────────────────────────────────────
  async function saveSpacedRep(article, learnedDate, reviewDates) {
    return upsert('spaced_rep', {
      user_id: USER,
      article,
      learned_date: learnedDate,
      review_dates: reviewDates,
      last_reviewed: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }

  async function loadSpacedRep() {
    return sb('spaced_rep', 'GET', null,
      `?user_id=eq.${USER}&order=updated_at.desc`);
  }

  // ── STREAKS ───────────────────────────────────────────────
  async function saveStreak(count, lastDate) {
    return upsert('streaks', {
      user_id: USER,
      count,
      last_date: lastDate,
      updated_at: new Date().toISOString()
    });
  }

  async function loadStreak() {
    const data = await sb('streaks', 'GET', null,
      `?user_id=eq.${USER}&limit=1`);
    return data && data.length > 0 ? data[0] : null;
  }

  // ── WRONG ANSWERS ─────────────────────────────────────────
  async function saveWrongAnswer(article, question, yourAnswer, correctAnswer) {
    return upsert('wrong_answers', {
      user_id: USER,
      article,
      question,
      your_answer: yourAnswer,
      correct_answer: correctAnswer,
      date_logged: new Date().toLocaleDateString()
    });
  }

  // ── SYNC INDICATOR ────────────────────────────────────────
  function showIndicator(msg = '☁️ Saved', color = '#4a7c6f') {
    let el = document.getElementById('clerk-sync-indicator');
    if (!el) {
      el = document.createElement('div');
      el.id = 'clerk-sync-indicator';
      el.style.cssText = `
        position:fixed;bottom:76px;left:50%;transform:translateX(-50%);
        padding:5px 14px;border-radius:20px;font-size:12px;font-weight:600;
        color:white;z-index:9999;opacity:0;transition:opacity .3s;
        font-family:'DM Sans',system-ui,sans-serif;pointer-events:none;
        white-space:nowrap;
      `;
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.background = color;
    el.style.opacity = '1';
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.style.opacity = '0'; }, 2000);
  }

  // ── DEBOUNCED CHECKBOX SYNC ───────────────────────────────
  // Batches rapid checkbox taps into one save after 800ms
  const pendingChecks = {};
  function scheduleCheckboxSync(week, blockKey, checked) {
    pendingChecks[`${week}_${blockKey}`] = { week, blockKey, checked };
    clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
      const items = Object.values(pendingChecks);
      Object.keys(pendingChecks).forEach(k => delete pendingChecks[k]);
      for (const item of items) {
        await saveProgress(item.week, item.blockKey, item.checked);
      }
      showIndicator('☁️ Saved');
    }, 800);
  }

  // ── INIT — load all data from Supabase on page open ───────
  async function init(weekId) {
    if (!navigator.onLine) {
      showIndicator('📵 Offline — local data only', '#c4503a');
      return;
    }

    try {
      // Load progress for this week
      if (weekId) {
        const remoteProgress = await loadProgress(weekId);
        if (remoteProgress && Object.keys(remoteProgress).length > 0) {
          // Merge remote into localStorage
          const localKey = `nys_${weekId}_blocks`;
          const localData = JSON.parse(localStorage.getItem(localKey) || '{}');
          const merged = { ...localData, ...remoteProgress };
          localStorage.setItem(localKey, JSON.stringify(merged));
          console.log(`Sync: loaded ${Object.keys(remoteProgress).length} checkboxes for ${weekId}`);
        }
      }

      // Load mnemonics
      const remoteMnemonics = await loadMnemonics();
      if (remoteMnemonics && Object.keys(remoteMnemonics).length > 0) {
        const existing = JSON.parse(localStorage.getItem('nys_w1_mnemonics') || '{}');
        Object.keys(remoteMnemonics).forEach(k => {
          if (remoteMnemonics[k]) existing[k] = { text: remoteMnemonics[k] };
        });
        localStorage.setItem('nys_w1_mnemonics', JSON.stringify(existing));
      }

      showIndicator('✓ Synced', '#4a7c6f');
    } catch(e) {
      console.warn('Sync init error:', e);
    }
  }

  // ── NETWORK MONITOR ───────────────────────────────────────
  window.addEventListener('online', async () => {
    online = true;
    showIndicator('🌐 Back online — syncing...', '#2a7f8c');
    // Flush any pending saves
    const items = Object.values(pendingChecks);
    for (const item of items) {
      await saveProgress(item.week, item.blockKey, item.checked);
    }
  });
  window.addEventListener('offline', () => {
    online = false;
    showIndicator('📵 Offline — saved locally', '#c4503a');
  });

  return {
    init,
    saveProgress,
    loadProgress,
    loadAllProgress,
    saveQuizScore,
    loadQuizScores,
    saveTestScore,
    loadTestScores,
    saveMnemonic,
    loadMnemonics,
    saveSpacedRep,
    loadSpacedRep,
    saveStreak,
    loadStreak,
    saveWrongAnswer,
    scheduleCheckboxSync,
    showIndicator
  };

})();
