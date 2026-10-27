// XQL Tutor - optional accounts: passwordless sign-in, server-graded points and a handle-only leaderboard.
// Works only when the site is served with its Pages Functions; on a plain static host every control stays hidden.
(function (root) {
  const XQL = root.XQL;
  const UI = XQL.UI;
  const h = UI.h;
  const App = XQL.App;

  const api = async (path, opts) => {
    const res = await fetch(path, Object.assign({ credentials: 'same-origin', headers: { 'content-type': 'application/json' } }, opts || {}));
    let data = null;
    try { data = await res.json(); } catch (e) { /* non-JSON */ }
    if (!res.ok) throw new Error((data && data.error) || `request failed (${res.status})`);
    return data;
  };

  const account = (App.account = {
    enabled: false, canSignIn: false, user: null, providers: { email: false, federated: [] },
    async refresh() {
      try {
        const me = await api('/api/me');
        account.enabled = !!me.enabled; account.canSignIn = !!me.canSignIn; account.user = me.user; account.providers = me.providers || account.providers;
      } catch (e) { account.enabled = false; account.canSignIn = false; account.user = null; }
      account.renderNav();
      return account.user;
    },
    renderNav() {
      const btn = document.getElementById('accountbtn');
      const lb = document.querySelector('nav a[data-view="leaderboard"]');
      const show = account.enabled && (account.canSignIn || !!account.user);
      if (lb) lb.classList.toggle('hidden', !show);
      if (!btn) return;
      btn.classList.toggle('hidden', !show);
      btn.textContent = account.user ? `@${account.user.handle}` : 'Sign in';
      btn.onclick = () => (account.user ? App.go('account') : account.openSignIn());
    },
    // Called after a card is answered correctly. The server grades it again before awarding points.
    async submit(ex, answer) {
      if (!account.enabled || !account.user || answer == null) return null;
      try {
        const r = await api('/api/answers', { method: 'POST', body: JSON.stringify({ cardId: ex.id, answer }) });
        if (r.awarded) { account.user.points = r.total; account.user.cards = r.cards; account.toast(`+${r.points} points (${r.total} total)`); }
        return r;
      } catch (e) { return null; }
    },
    toast(text) {
      const t = h('div', { class: 'toast' }, text);
      document.body.append(t);
      setTimeout(() => t.classList.add('show'), 10);
      setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2600);
    },
    openSignIn() {
      const p = account.providers;
      const msg = h('div', { class: 'formmsg' });
      const email = h('input', { type: 'email', class: 'input', placeholder: 'you@example.com', autocomplete: 'email', required: true });
      const code = h('input', { type: 'text', class: 'input', placeholder: '6-digit code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6' });
      const step2 = h('div', { class: 'hidden' }, h('p', { class: 'muted small' }, 'We sent a 6-digit code to your email. It expires in 10 minutes.'), code, h('button', { class: 'btn primary', type: 'submit' }, 'Verify and sign in'));
      const sendBtn = h('button', { class: 'btn primary', type: 'submit' }, 'Email me a code');
      let stage = 'start';
      const form = h('form', { class: 'form' }, h('label', null, 'Email address', email), sendBtn, step2, msg);
      form.addEventListener('submit', async (e) => {
        e.preventDefault(); msg.textContent = '';
        try {
          if (stage === 'start') {
            sendBtn.disabled = true;
            await api('/api/auth/otp/start', { method: 'POST', body: JSON.stringify({ email: email.value.trim() }) });
            stage = 'verify'; sendBtn.classList.add('hidden'); step2.classList.remove('hidden'); email.readOnly = true; code.focus();
          } else {
            const r = await api('/api/auth/otp/verify', { method: 'POST', body: JSON.stringify({ email: email.value.trim(), code: code.value.trim() }) });
            account.user = r.user; account.renderNav(); overlay.remove();
            App.go(r.needsHandle ? 'account?welcome=1' : 'account');
          }
        } catch (err) { msg.textContent = err.message; sendBtn.disabled = false; }
      });
      const providers = h('div', { class: 'providers' }, (p.federated || []).map((name) => h('a', { class: 'btn', href: `/api/auth/${name}/start` }, `Continue with ${{ github: 'GitHub', google: 'Google', microsoft: 'Microsoft' }[name] || name}`)));
      const body = h('div', null,
        h('h2', null, 'Sign in'),
        h('p', { class: 'muted' }, 'Optional. Sign in to record points and appear on the leaderboard under a handle of your choice. No passwords: a one-time code by email, or an account you already have.'),
        p.email ? form : h('p', { class: 'muted small' }, 'Email codes are not available on this site yet.'),
        (p.federated || []).length ? h('div', null, h('div', { class: 'label' }, 'Or continue with'), providers) : null,
        h('p', { class: 'muted small' }, 'We store your email (or provider id), your handle and your scores, nothing else. Your learning progress stays in this browser. You can delete the account at any time from the Account page.'));
      const overlay = App.modal(body);
      setTimeout(() => email.focus(), 50);
    },
  });

  // ---- views --------------------------------------------------------------------------------------------
  App.viewLeaderboard = async () => {
    const wrap = h('div', null, h('h1', null, 'Leaderboard'), h('p', { class: 'lead' }, 'Points are awarded once per card when the server re-grades a correct answer: write cards score 3 x difficulty, fill-the-blanks and ordering 2 x, reading cards 1 x. Handles only; no names or email addresses are shown.'));
    const tabs = h('div', { class: 'tabs' });
    const table = h('div');
    let period = 'all';
    const render = async () => {
      tabs.innerHTML = '';
      for (const [key, label] of [['all', 'All time'], ['30d', 'Last 30 days']]) tabs.append(h('button', { class: 'tab' + (period === key ? ' active' : ''), type: 'button', onClick: () => { period = key; render(); } }, label));
      table.innerHTML = '';
      try {
        const data = await api(`/api/leaderboard?period=${period}`);
        if (!data.rows.length) { table.append(h('p', { class: 'muted' }, 'Nobody has scored yet. Sign in and answer a card to be first.')); }
        else table.append(h('table', { class: 'grid lb' }, h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'Handle'), h('th', null, 'Points'), h('th', null, 'Cards'), h('th', null, 'Last active'))),
          h('tbody', null, data.rows.map((r) => h('tr', { class: data.me && r.handle === data.me.handle ? 'me' : '' }, h('td', null, r.rank), h('td', null, '@' + r.handle), h('td', null, r.points), h('td', null, r.cards), h('td', null, r.lastActive))))));
        if (data.me) table.append(h('p', { class: 'muted small' }, `You: @${data.me.handle}, ${data.me.points} points, ${data.me.cards} cards${data.me.rank ? `, rank ${data.me.rank}` : ''}.`));
        else if (account.canSignIn) table.append(h('p', { class: 'muted small' }, h('button', { class: 'btn small', type: 'button', onClick: () => account.openSignIn() }, 'Sign in'), ' to record your points.'));
      } catch (e) { table.append(h('p', { class: 'muted' }, 'The leaderboard is not available right now.')); }
    };
    wrap.append(tabs, table);
    App.setView(wrap);
    render();
  };

  App.viewAccount = async (arg, query) => {
    const params = new URLSearchParams(query || '');
    await account.refresh();
    if (!account.user) { App.setView(h('div', null, h('h1', null, 'Account'), params.get('error') ? h('p', { class: 'verdict bad' }, params.get('error')) : null, h('p', { class: 'lead' }, 'You are not signed in.'), h('button', { class: 'btn primary', type: 'button', onClick: () => account.openSignIn() }, 'Sign in'))); return; }
    const u = account.user;
    const handle = h('input', { type: 'text', class: 'input', value: u.handle, maxlength: '20', pattern: '[A-Za-z0-9][A-Za-z0-9_-]{2,19}' });
    const msg = h('div', { class: 'formmsg' });
    const form = h('form', { class: 'form' }, h('label', null, 'Handle (shown on the leaderboard)', handle), h('button', { class: 'btn primary', type: 'submit' }, 'Save handle'), msg);
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); msg.textContent = '';
      try { const r = await api('/api/profile', { method: 'POST', body: JSON.stringify({ handle: handle.value.trim() }) }); account.user.handle = r.user.handle; account.renderNav(); msg.textContent = 'Saved.'; }
      catch (err) { msg.textContent = err.message; }
    });
    App.setView(h('div', null,
      h('h1', null, 'Account'),
      params.get('welcome') ? h('p', { class: 'verdict ok' }, `Welcome. Your handle is @${u.handle}; change it below if you like.`) : null,
      h('div', { class: 'strip' }, App.stat('Points', u.points || 0), App.stat('Cards solved', u.cards || 0), App.stat('Rank', u.rank || '–')),
      form,
      h('h3', null, 'Privacy'),
      h('p', { class: 'muted' }, 'Stored on the server: your email address or provider id, your handle, your first name if a provider supplied one (never shown publicly), and the cards you solved with their points. Your learning progress and review schedule live only in this browser.'),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', type: 'button', onClick: async () => { await api('/api/auth/logout', { method: 'POST' }); account.user = null; account.renderNav(); App.go('learn'); } }, 'Sign out'),
        h('button', { class: 'btn danger', type: 'button', onClick: async () => { if (!confirm('Delete your account, points and handle? This cannot be undone.')) return; await api('/api/profile', { method: 'DELETE' }); account.user = null; account.renderNav(); App.go('learn'); } }, 'Delete account'))));
  };

  document.addEventListener('DOMContentLoaded', () => { account.refresh(); });
})(typeof globalThis !== 'undefined' ? globalThis : this);
