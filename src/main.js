import { createClient } from '@supabase/supabase-js';
import './style.css';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
const supabase = url && key && !url.includes('YOUR_PROJECT_ID') && !key.includes('YOUR_SUPABASE')
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;
const app = document.querySelector('#app');

app.innerHTML = `
  <main class="shell">
    <header class="topbar"><div class="brand-mark">K</div><div><strong>KEM VPN</strong><small>SECURE CONNECTION PORTAL</small></div><span class="status">BETA</span></header>
    <section class="hero"><p class="eyebrow">KARIBU KWENYE KEM VPN</p><h1>Internet yako.<br><span>Udhibiti wako.</span></h1><p class="intro">Ingia au fungua akaunti ili kusimamia uanachama na huduma zako.</p></section>
    <section class="auth-card" id="auth-card">
      <div class="tabs"><button class="tab active" data-mode="login" type="button">Ingia</button><button class="tab" data-mode="register" type="button">Jisajili</button></div>
      <form id="auth-form">
        <label for="email">Barua pepe</label><input id="email" type="email" autocomplete="email" placeholder="jina@example.com" required />
        <label for="password">Nenosiri</label><input id="password" type="password" autocomplete="current-password" minlength="8" placeholder="Angalau herufi 8" required />
        <button class="primary" type="submit" id="submit">Ingia kwenye akaunti <span>→</span></button>
      </form>
      <div class="otp-actions">
        <button type="button" class="link-button" id="send-otp">Ingia kwa OTP ya email</button>
        <form id="otp-form" hidden>
          <label for="otp">Nambari ya OTP (tarakimu 6)</label>
          <input id="otp" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="123456" />
          <button class="primary" type="submit" id="verify-otp">Thibitisha OTP</button>
        </form>
      </div>
      <button type="button" class="link-button" id="forgot">Umesahau nenosiri?</button>
      <p id="message" class="message" aria-live="polite"></p>
      <p class="fineprint">Kwa kujisajili, utakubali masharti ya matumizi na sera ya faragha.</p>
    </section>
    <section class="auth-card account-card" id="account-card" hidden>
      <p class="eyebrow">AKAUNTI YAKO</p><h2 id="account-email"></h2>
      <p>Mpango: <strong id="account-tier">Bronze</strong></p>
      <p class="message" id="vpn-status">Hali ya VPN: Haijaunganishwa. Seva ya VPN bado haijawekwa.</p>
      <p class="fineprint">Usalama: akaunti imeingia. Muunganisho wa VPN utawezeshwa tu baada ya kuweka seva halisi ya WireGuard.</p>
      <button class="primary" id="logout" type="button">Toka kwenye akaunti</button>
    </section>
    <footer>© ${new Date().getFullYear()} KEM VPN · Mfumo unaendelea kujengwa</footer>
  </main>`;

let mode = 'login';
const form = document.querySelector('#auth-form');
const msg = document.querySelector('#message');
const submit = document.querySelector('#submit');
const forgot = document.querySelector('#forgot');
const sendOtp = document.querySelector('#send-otp');
const otpForm = document.querySelector('#otp-form');
const authCard = document.querySelector('#auth-card');
const accountCard = document.querySelector('#account-card');
const emailInput = document.querySelector('#email');
const passwordInput = document.querySelector('#password');

function showMessage(message, kind = '') {
  msg.textContent = message;
  msg.className = 'message' + (kind ? ' ' + kind : '');
}
function requireSupabase() {
  if (supabase) return true;
  showMessage('Supabase haijawekwa. Weka VITE_SUPABASE_URL na VITE_SUPABASE_PUBLISHABLE_KEY kwenye GitHub Actions Secrets/Variables au .env kisha build upya.', 'warning');
  return false;
}
function setBusy(button, busy, label) {
  button.disabled = busy;
  if (label) button.textContent = busy ? 'Tafadhali subiri...' : label;
}

document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => {
  mode = button.dataset.mode;
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab === button));
  submit.innerHTML = mode === 'login' ? 'Ingia kwenye akaunti <span>→</span>' : 'Tengeneza akaunti <span>→</span>';
  passwordInput.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  forgot.hidden = mode !== 'login';
  sendOtp.hidden = mode !== 'login';
  otpForm.hidden = true;
  showMessage('');
}));

sendOtp.addEventListener('click', async () => {
  if (!requireSupabase()) return;
  const email = emailInput.value.trim().toLowerCase();
  if (!email) return showMessage('Andika barua pepe yako kwanza.', 'warning');
  setBusy(sendOtp, true);
  showMessage('Inatuma msimbo wa OTP kwenye email...');
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false }
    });
    if (error) throw error;
    otpForm.hidden = false;
    showMessage('OTP imetumwa. Angalia Inbox na Spam, kisha weka msimbo wa tarakimu 6.', 'success');
  } catch (error) {
    showMessage(error.message || 'Imeshindikana kutuma OTP. Hakikisha akaunti ipo na Email provider imewashwa Supabase.', 'warning');
  } finally {
    setBusy(sendOtp, false, 'Ingia kwa OTP ya email');
  }
});

otpForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!requireSupabase()) return;
  const email = emailInput.value.trim().toLowerCase();
  const token = document.querySelector('#otp').value.trim();
  if (!email || !/^\d{6}$/.test(token)) return showMessage('Weka email na OTP sahihi ya tarakimu 6.', 'warning');
  const verifyButton = document.querySelector('#verify-otp');
  setBusy(verifyButton, true);
  showMessage('Inathibitisha OTP...');
  try {
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    if (error) throw error;
    if (data.user) await showAccount(data.user);
    else showMessage('OTP imekubaliwa lakini session haijapatikana. Jaribu kuingia tena.', 'warning');
  } catch (error) {
    showMessage(error.message || 'OTP si sahihi au muda wake umeisha. Omba OTP mpya.', 'warning');
  } finally {
    setBusy(verifyButton, false, 'Thibitisha OTP');
  }
});

forgot.addEventListener('click', async () => {
  if (!requireSupabase()) return;
  const email = emailInput.value.trim().toLowerCase();
  if (!email) return showMessage('Andika barua pepe yako kwanza.', 'warning');
  setBusy(forgot, true);
  showMessage('Inatuma kiungo cha kubadilisha nenosiri...');
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    if (error) throw error;
    showMessage('Kama akaunti ipo, kiungo cha kubadilisha nenosiri kimetumwa. Angalia Inbox na Spam.', 'success');
  } catch (error) {
    showMessage(error.message || 'Imeshindikana kutuma kiungo. Jaribu tena.', 'warning');
  } finally {
    setBusy(forgot, false, 'Umesahau nenosiri?');
  }
});

async function showAccount(user) {
  authCard.hidden = true;
  accountCard.hidden = false;
  document.querySelector('#account-email').textContent = user.email || 'Akaunti yako';
  document.querySelector('#account-tier').textContent = 'BRONZE';
  if (!supabase) return;
  const { data, error } = await supabase.from('profiles').select('membership_tier').eq('id', user.id).maybeSingle();
  if (!error && data?.membership_tier) {
    document.querySelector('#account-tier').textContent = data.membership_tier.toUpperCase();
  } else if (error) {
    console.warn('Profile lookup failed:', error.message);
  }
}

document.querySelector('#logout').addEventListener('click', async () => {
  if (!requireSupabase()) return;
  const button = document.querySelector('#logout');
  button.disabled = true;
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    accountCard.hidden = true;
    authCard.hidden = false;
    form.reset();
    otpForm.reset();
    showMessage('Umetoka salama kwenye akaunti.', 'success');
  } catch (error) {
    showMessage(error.message || 'Imeshindikana kutoka kwenye akaunti.', 'warning');
  } finally {
    button.disabled = false;
  }
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!requireSupabase()) return;
  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;
  setBusy(submit, true);
  showMessage('Tafadhali subiri...');
  try {
    const result = mode === 'register'
      ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
      : await supabase.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
    if (mode === 'register') {
      if (result.data.session && result.data.user) await showAccount(result.data.user);
      else showMessage('Ombi la usajili limepokelewa. Angalia email kuthibitisha akaunti kabla ya kuingia.', 'success');
    } else if (result.data.user) {
      await showAccount(result.data.user);
    } else {
      showMessage('Ingia haijakamilika. Hakikisha email imethibitishwa.', 'warning');
    }
  } catch (error) {
    showMessage(error.message || 'Imeshindikana. Hakiki taarifa zako kisha jaribu tena.', 'warning');
  } finally {
    setBusy(submit, false);
    submit.innerHTML = mode === 'login' ? 'Ingia kwenye akaunti <span>→</span>' : 'Tengeneza akaunti <span>→</span>';
  }
});

if (supabase) {
  supabase.auth.getSession().then(({ data, error }) => {
    if (error) console.warn('Session restore failed:', error.message);
    if (data?.session?.user) showAccount(data.session.user);
  });
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session?.user) showAccount(session.user);
    if (event === 'SIGNED_OUT') {
      accountCard.hidden = true;
      authCard.hidden = false;
    }
  });
}

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(error => console.warn('KEM VPN offline support could not be enabled:', error));
  });
}
