import { createClient } from '@supabase/supabase-js';
import './style.css';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabase = url && key ? createClient(url, key) : null;
const app = document.querySelector('#app');

app.innerHTML = `
  <main class="shell">
    <header class="topbar"><div class="brand-mark">K</div><div><strong>KEM VPN</strong><small>SECURE CONNECTION PORTAL</small></div><span class="status">BETA</span></header>
    <section class="hero"><p class="eyebrow">KARIBU KWENYE KEM VPN</p><h1>Internet yako.<br><span>Udhibiti wako.</span></h1><p class="intro">Ingia au fungua akaunti ili kusimamia uanachama na huduma zako.</p></section>
    <section class="auth-card" id="auth-card">
      <div class="tabs"><button class="tab active" data-mode="login">Ingia</button><button class="tab" data-mode="register">Jisajili</button></div>
      <form id="auth-form">
        <label for="email">Barua pepe</label><input id="email" type="email" autocomplete="email" placeholder="jina@example.com" required />
        <label for="password">Nenosiri</label><input id="password" type="password" autocomplete="current-password" minlength="8" placeholder="Angalau herufi 8" required />
        <button class="primary" type="submit" id="submit">Ingia kwenye akaunti <span>→</span></button>
      </form>
      <button type="button" class="link-button" id="forgot">Umesahau nenosiri?</button>
      <p id="message" class="message" aria-live="polite"></p>
      <p class="fineprint">Kwa kujisajili, utakubali masharti ya matumizi na sera ya faragha.</p>
    </section>
    <section class="auth-card account-card" id="account-card" hidden>
      <p class="eyebrow">AKAUNTI YAKO</p><h2 id="account-email"></h2>
      <p>Mpango: <strong id="account-tier">Bronze</strong></p>
      <p class="message" id="vpn-status">Hali ya VPN: Bado haijaunganishwa.</p>
      <p class="fineprint">Huduma ya WireGuard itawashwa baada ya kuunganishwa na seva halisi ya VPN.</p>
      <button class="primary" id="logout" type="button">Toka kwenye akaunti</button>
    </section>
    <footer>© ${new Date().getFullYear()} KEM VPN · Mfumo unaendelea kujengwa</footer>
  </main>`;

let mode = 'login';
const form = document.querySelector('#auth-form');
const msg = document.querySelector('#message');
const submit = document.querySelector('#submit');
const forgot = document.querySelector('#forgot');
const authCard = document.querySelector('#auth-card');
const accountCard = document.querySelector('#account-card');

function showMessage(message, kind = '') {
  msg.textContent = message;
  msg.className = 'message' + (kind ? ' ' + kind : '');
}

document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => {
  mode = button.dataset.mode;
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab === button));
  submit.innerHTML = mode === 'login' ? 'Ingia kwenye akaunti <span>→</span>' : 'Tengeneza akaunti <span>→</span>';
  forgot.hidden = mode !== 'login';
  showMessage('');
}));

forgot.addEventListener('click', async () => {
  if (!supabase) return showMessage('Weka kwanza Supabase URL na Publishable Key.', 'warning');
  const email = document.querySelector('#email').value.trim();
  if (!email) return showMessage('Andika barua pepe yako kwanza.', 'warning');
  forgot.disabled = true;
  showMessage('Inatuma kiungo cha kubadilisha nenosiri...');
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    });
    if (error) throw error;
    showMessage('Kama akaunti ipo, kiungo cha kubadilisha nenosiri kimetumwa kwenye email yako. Angalia Inbox na Spam.', 'success');
  } catch (error) {
    showMessage(error.message || 'Imeshindikana kutuma kiungo. Jaribu tena.', 'warning');
  } finally {
    forgot.disabled = false;
  }
});

async function showAccount(user) {
  authCard.hidden = true;
  accountCard.hidden = false;
  document.querySelector('#account-email').textContent = user.email || 'Akaunti yako';
  if (!supabase) return;
  const { data, error } = await supabase.from('profiles')
    .select('membership_tier').eq('id', user.id).maybeSingle();
  document.querySelector('#account-tier').textContent =
    error ? 'Haijapatikana' : (data?.membership_tier || 'Bronze').toUpperCase();
}

document.querySelector('#logout').addEventListener('click', async () => {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) return alert(error.message);
  accountCard.hidden = true;
  authCard.hidden = false;
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!supabase) return showMessage('Bado: weka Supabase Project URL na Publishable Key kwenye .env kabla ya kujaribu kuingia.', 'warning');
  const email = document.querySelector('#email').value.trim();
  const password = document.querySelector('#password').value;
  submit.disabled = true;
  showMessage('Tafadhali subiri...');
  try {
    const result = mode === 'register'
      ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
      : await supabase.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
    if (mode === 'register') {
      showMessage('Akaunti imeombwa. Angalia email yako kuthibitisha akaunti.', 'success');
    } else if (result.data.user) {
      await showAccount(result.data.user);
    }
  } catch (error) {
    showMessage(error.message || 'Imeshindikana. Jaribu tena.', 'warning');
  } finally {
    submit.disabled = false;
  }
});

if (supabase) {
  supabase.auth.getSession().then(({ data }) => {
    if (data.session?.user) showAccount(data.session.user);
  });
}


// Installable PWA support (works on HTTPS hosting such as GitHub Pages).
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(error => {
      console.warn('KEM VPN offline support could not be enabled:', error);
    });
  });
}
