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
    <section class="auth-card">
      <div class="tabs"><button class="tab active" data-mode="login">Ingia</button><button class="tab" data-mode="register">Jisajili</button></div>
      <form id="auth-form">
        <label for="email">Barua pepe</label><input id="email" type="email" autocomplete="email" placeholder="jina@example.com" required />
        <label for="password">Nenosiri</label><input id="password" type="password" autocomplete="current-password" minlength="8" placeholder="Angalau herufi 8" required />
        <button class="primary" type="submit" id="submit">Ingia kwenye akaunti <span>→</span></button>
      </form>
      <p id="message" class="message" aria-live="polite"></p>
      <p class="fineprint">Kwa kujisajili, utakubali masharti ya matumizi na sera ya faragha.</p>
    </section>
    <footer>© ${new Date().getFullYear()} KEM VPN · Mfumo unaendelea kujengwa</footer>
  </main>`;

let mode = 'login';
const form = document.querySelector('#auth-form');
const msg = document.querySelector('#message');
const submit = document.querySelector('#submit');
document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => {
  mode = button.dataset.mode;
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab === button));
  submit.innerHTML = mode === 'login' ? 'Ingia kwenye akaunti <span>→</span>' : 'Tengeneza akaunti <span>→</span>';
  msg.textContent = '';
}));
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!supabase) {
    msg.textContent = 'Bado: weka Supabase Project URL na Publishable Key kwenye .env kabla ya kujaribu kuingia.';
    msg.className = 'message warning';
    return;
  }
  const email = document.querySelector('#email').value.trim();
  const password = document.querySelector('#password').value;
  submit.disabled = true;
  msg.textContent = 'Tafadhali subiri...';
  msg.className = 'message';
  try {
    const result = mode === 'register'
      ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
      : await supabase.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
    msg.textContent = mode === 'register'
      ? 'Akaunti imeombwa. Angalia email yako kuthibitisha akaunti.'
      : 'Umeingia kikamilifu.';
    msg.className = 'message success';
  } catch (error) {
    msg.textContent = error.message || 'Imeshindikana. Jaribu tena.';
    msg.className = 'message warning';
  } finally {
    submit.disabled = false;
  }
});
