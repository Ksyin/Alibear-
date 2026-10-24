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
  signInWithEmailAndPassword,
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
    notice.textContent = `Paystack confirmed your payment for order ${orderId}. Sign in with the same verified email used at checkout to link this order.`;
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
  if (!user.emailVerified) {
    feedback('Verify your email using the link we sent before linking this order.', 'error');
    return;
  }
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

async function resendVerification() {
  const user = auth.currentUser;
  if (!user) {
    feedback('Create an account or sign in before requesting a verification email.', 'error');
    return;
  }
  try {
    await sendEmailVerification(user);
    feedback('A new email verification link has been sent.', 'success');
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

onAuthStateChanged(auth, async user => {
  const linkButton = $('link-order');
  const resendButton = $('account-resend');
  linkButton.hidden = !orderId || !user || user.isAnonymous;
  resendButton.hidden = !user || user.isAnonymous || user.emailVerified;
  if (!user || user.isAnonymous) return;

  $('account-email').value = $('account-email').value || user.email || '';
  try {
    await user.reload();
    await user.getIdToken(true);
    linkButton.hidden = !orderId || !user.emailVerified;
    resendButton.hidden = user.emailVerified;
    if (!user.emailVerified) {
      feedback('Verify your email before linking your order. Use the resend button if you need another link.', 'error');
    }
  } catch (error) {
    feedback(error.message || 'Could not refresh your account verification status.', 'error');
  }
});

showOrderNotice();
setMode('signup');
