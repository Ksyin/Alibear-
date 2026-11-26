import {
  auth,
  authenticatedRequest,
  createUserWithEmailAndPassword,
  database,
  get,
  onAuthStateChanged,
  ref,
  sendEmailVerification,
  sendPasswordResetEmail,
  set,
  signInWithEmailAndPassword,
  signOut,
  update,
  updateProfile
} from './firebase-client.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const orderId = params.get('order');
let mode = 'signup';

function friendlyAuthError(error) {
  const known = {
    'auth/email-already-in-use': 'An account already exists for this email. Use Sign in or Reset password.',
    'auth/invalid-credential': 'Wrong email or password. Try again or reset your password.',
    'auth/invalid-login-credentials': 'Wrong email or password. Try again or reset your password.',
    'auth/user-not-found': 'No account exists for this email. Create an account first.',
    'auth/wrong-password': 'Wrong password. Try again or reset your password.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/weak-password': 'Use at least eight characters for your password.',
    'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
    'auth/network-request-failed': 'Could not reach Firebase. Check your connection.',
    'auth/unauthorized-domain': 'This site domain is not authorized in Firebase Authentication settings.'
  };
  return known[error?.code] || error?.message || 'Could not complete this account request.';
}

function feedback(message, tone = 'info') {
  const target = $('account-feedback');
  if (!target) return;
  target.textContent = message;
  target.dataset.tone = tone;
  target.hidden = !message;
}

function showOrderNotice() {
  const notice = $('account-order-notice');
  if (!notice) return;
  if (params.get('paid') === '1' && orderId) {
    notice.hidden = false;
    notice.textContent = `Paystack confirmed your payment for order ${orderId}. Sign in with the email used at checkout and your order connects automatically.`;
  } else if (orderId) {
    notice.hidden = false;
    notice.textContent = `Order ${orderId} is ready to connect to the verified email address used at checkout.`;
  }
}

function setMode(next) {
  mode = next;
  document.querySelectorAll('[data-account-mode]').forEach(button => {
    button.classList.toggle('active', button.dataset.accountMode === next);
  });
  const signup = next === 'signup';
  const reset = next === 'reset';
  $('account-name-label').hidden = !signup;
  $('account-name').hidden = !signup;
  $('account-name').required = signup;
  $('account-password-label').hidden = reset;
  $('account-password').hidden = reset;
  $('account-password').required = !reset;
  $('account-password').minLength = signup ? 8 : 1;
  $('account-password').autocomplete = signup ? 'new-password' : 'current-password';
  $('account-submit').textContent = {
    signup: 'Create my account →',
    signin: 'Sign in →',
    reset: 'Send password reset email →'
  }[next];
  feedback('');
}

async function submit(event) {
  event.preventDefault();
  const email = $('account-email').value.trim().toLowerCase();
  const password = $('account-password').value;
  const name = $('account-name').value.trim();

  try {
    if (mode === 'reset') {
      await sendPasswordResetEmail(auth, email);
      feedback('If an account exists for this email, Firebase has sent a password reset link.', 'success');
      return;
    }
    if (mode === 'signin') {
      await signInWithEmailAndPassword(auth, email, password);
      return;
    }
    if (name.length < 2) {
      feedback('Enter your name to create an account.', 'error');
      return;
    }
    if (password.length < 8) {
      feedback('Use at least eight characters for your password.', 'error');
      return;
    }

    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credential.user, { displayName: name });
    try {
      await set(ref(database, `customers/${credential.user.uid}`), {
        name,
        email,
        createdAt: new Date().toISOString()
      });
    } catch (error) {
      console.warn('Could not save the customer profile:', error?.code || error);
    }
    let note = 'Account created. You are signed in.';
    try {
      await sendEmailVerification(credential.user);
      note += ' Check your inbox to verify your email before linking a paid order.';
    } catch (error) {
      note += ' We could not send the verification email right now; use the resend button later.';
    }
    feedback(note, 'success');
  } catch (error) {
    feedback(friendlyAuthError(error), 'error');
  }
}

async function linkOrder(user) {
  if (!orderId) return;
  try {
    await user.getIdToken(true);
    const result = await authenticatedRequest('/api/link-order', {
      method: 'POST',
      body: JSON.stringify({ orderId })
    });
    const snapshot = await get(ref(database, `orders/${result.orderId}`));
    const order = snapshot.val();
    feedback(
      order
        ? `Order linked. Paystack receipt: ${order.receiptNumber || order.reference}. Receipt email status: ${order.receiptStatus || 'pending'}.`
        : 'Your order was linked, but its details are not available yet.',
      'success'
    );
    $('link-order').hidden = true;
  } catch (error) {
    feedback(error.message || 'Could not link this order to your account.', 'error');
  }
}

async function loadDashboard(user) {
  $('acct-email').textContent = user.email || '';
  let profile = {};
  try {
    profile = (await get(ref(database, `customers/${user.uid}`))).val() || {};
  } catch (error) {
    console.warn('Could not load the saved profile:', error?.code || error);
  }
  $('profile-name').value = user.displayName || profile.name || '';
  $('profile-phone').value = profile.phone || '';

  const box = $('account-orders');
  try {
    const ids = Object.keys(profile.orders || {});
    const orders = (await Promise.all(ids.map(async id => {
      try {
        return (await get(ref(database, `orders/${id}`))).val();
      } catch {
        return null;
      }
    }))).filter(Boolean).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    box.innerHTML = orders.length
      ? orders.map(order => `<article class="account-order"><div class="account-order-top"><b>${K(order.total)}</b><span class="account-order-status" data-status="${esc(order.paymentStatus)}">${esc(order.paymentStatus)}</span></div><span>${(order.items || []).map(item => `${esc(item.name)} × ${Number(item.quantity)}`).join(', ')}</span><small>${new Date(order.createdAt).toLocaleDateString('en-KE')} · ${esc(order.id)}</small></article>`).join('')
      : '<p class="empty-state">No orders yet. Your paid orders will appear here.</p>';
  } catch (error) {
    box.innerHTML = '<p class="empty-state">Could not load your orders right now.</p>';
  }
}

async function saveProfile(event) {
  event.preventDefault();
  const user = auth.currentUser;
  const name = $('profile-name').value.trim();
  const phone = $('profile-phone').value.trim();
  if (!user) return;
  if (name.length < 2) return feedback('Enter your full name.', 'error');
  if (phone.length < 7) return feedback('Enter a valid phone number.', 'error');
  try {
    await updateProfile(user, { displayName: name });
    await update(ref(database, `customers/${user.uid}`), { name, phone, email: user.email || '', updatedAt: new Date().toISOString() });
    feedback('Your details are saved. They will be used at checkout.', 'success');
  } catch (error) {
    feedback(error.message || 'Could not save your details.', 'error');
  }
}

async function resendVerification() {
  const user = auth.currentUser;
  if (!user) {
    feedback('Create an account or sign in before requesting a verification email.', 'error');
    return;
  }
  try {
    const sent = await sendEmailVerification(user);
    feedback(sent ? 'A new email verification link has been sent.' : 'Email could not be sent until this domain is added to Firebase Authentication > Settings > Authorized domains. You can still use your account.', sent ? 'success' : 'error');
  } catch (error) {
    feedback(friendlyAuthError(error), 'error');
  }
}

document.querySelectorAll('[data-account-mode]').forEach(button => {
  button.addEventListener('click', () => setMode(button.dataset.accountMode));
});
$('account-form').addEventListener('submit', submit);
$('link-order').addEventListener('click', () => {
  if (auth.currentUser) linkOrder(auth.currentUser);
});
$('account-resend').addEventListener('click', resendVerification);
$('profile-form').addEventListener('submit', saveProfile);
$('account-signout').addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, async user => {
  const linkButton = $('link-order');
  const resendButton = $('account-resend');
  const signedIn = !!user && !user.isAnonymous;
  $('account-auth').hidden = signedIn;
  $('account-dashboard').hidden = !signedIn;
  linkButton.hidden = !orderId || !signedIn;
  resendButton.hidden = true;
  if (!signedIn) return;

  $('account-email').value = $('account-email').value || user.email || '';
  try {
    await user.reload();
    await user.getIdToken(true);
    linkButton.hidden = true;
    resendButton.hidden = user.emailVerified;
    if (orderId) await linkOrder(user);
    loadDashboard(user);
  } catch (error) {
    feedback(error.message || 'Could not refresh your account verification status.', 'error');
  }
});

showOrderNotice();
setMode('signup');
