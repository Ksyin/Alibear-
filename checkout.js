import {
  auth,
  authenticatedRequest,
  createUserWithEmailAndPassword,
  database,
  get,
  onAuthStateChanged,
  ref,
  sendEmailVerification,
  set,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from './firebase-client.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const returnOrderId = params.get('order');
const returnReference = params.get('reference') || params.get('trxref');
const cart = (() => {
  try {
    return JSON.parse(sessionStorage.getItem('cart') || '[]');
  } catch {
    return [];
  }
})();
let mode = 'signup';
let verifying = false;
let profile = {};

function feedback(message, tone = 'info') {
  const target = $('checkout-feedback');
  target.textContent = message;
  target.dataset.tone = tone;
  target.hidden = !message;
}

function setMode(next) {
  mode = next;
  const member = next === 'member';
  const signup = next === 'signup';
  document.querySelectorAll('[data-checkout-mode]').forEach(button => {
    button.classList.toggle('active', button.dataset.checkoutMode === next);
  });
  $('checkout-tabs').hidden = member;
  $('checkout-member-note').hidden = !member;
  $('checkout-name-label').hidden = !signup;
  $('checkout-name').hidden = !signup;
  $('checkout-name').required = signup;
  $('checkout-email-label').hidden = member;
  $('checkout-email').hidden = member;
  $('checkout-email').required = !member;
  $('checkout-password-label').hidden = member;
  $('checkout-password').hidden = member;
  $('checkout-password').required = !member;
  $('checkout-password-label').textContent = signup ? 'Create a password' : 'Password';
  $('checkout-password').autocomplete = signup ? 'new-password' : 'current-password';
  $('checkout-password').minLength = signup ? 8 : 1;
  $('checkout-submit').textContent = member
    ? 'Continue to Paystack →'
    : signup ? 'Create account and continue to Paystack →' : 'Sign in and continue to Paystack →';
  feedback('');
}

function renderCart() {
  const container = $('checkout-items');
  const total = $('checkout-total');
  if (!cart.length) {
    container.innerHTML = '<p class="empty-state">Your cart is empty. Add products before checkout.</p>';
    total.textContent = 'KSh 0';
    $('checkout-submit').disabled = true;
    return;
  }
  get(ref(database, 'products')).then(snapshot => {
    const liveProducts = snapshot.exists() ? Object.values(snapshot.val()) : Store.load().products;
    const items = cart.map(row => {
      const product = liveProducts.find(item => String(item.id) === String(row.id));
      return product ? { ...product, quantity: Number(row.q) || 1 } : null;
    }).filter(Boolean);
    if (!items.length) {
      container.innerHTML = '<p class="empty-state">The products in your cart are no longer available.</p>';
      total.textContent = 'KSh 0';
      $('checkout-submit').disabled = true;
      return;
    }
    container.innerHTML = items.map(item => `<article class="checkout-item"><img src="${esc(item.img)}" alt="${esc(item.alt || item.name)}"><div><b>${esc(item.name)}</b><span>Qty ${item.quantity}</span></div><strong>${K(item.price * item.quantity)}</strong></article>`).join('');
    total.textContent = K(items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0));
    $('checkout-submit').disabled = false;
  }).catch(error => {
    console.error('Could not load the cart summary:', error);
    container.innerHTML = '<p class="empty-state">Could not load your cart. Refresh the shop and try again.</p>';
    $('checkout-submit').disabled = true;
  });
}

async function verifyPayment(user) {
  if (!returnOrderId || !returnReference || !user || user.isAnonymous || verifying) return;
  verifying = true;
  $('checkout-submit').disabled = true;
  feedback('Verifying your Paystack payment securely…');
  try {
    const result = await authenticatedRequest('/api/paystack-verify', {
      method: 'POST',
      body: JSON.stringify({ orderId: returnOrderId, reference: returnReference })
    });
    if (!result.paid) throw new Error('Paystack has not confirmed this payment.');
    sessionStorage.removeItem('cart');
    location.replace(`/account.html?order=${encodeURIComponent(result.orderId)}&paid=1`);
  } catch (error) {
    verifying = false;
    $('checkout-submit').disabled = false;
    feedback(error.message || 'We could not verify your payment yet. Sign in with the checkout account and try again.', 'error');
  }
}

async function authenticateCustomer(email, password, name) {
  let current = auth.currentUser;
  if (current && !current.isAnonymous && current.email?.toLowerCase() === email) return current;
  if (current && !current.isAnonymous) {
    throw new Error('Sign out of the other customer account before continuing checkout.');
  }
  if (current?.isAnonymous) {
    await signOut(auth);
    current = null;
  }
  if (mode === 'signin') {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    return credential.user;
  }
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName: name });
  try {
    await set(ref(database, `customers/${credential.user.uid}`), {
      name,
      email,
      phone: $('checkout-phone').value.trim(),
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    console.warn('Could not save the customer profile:', error?.code || error);
  }
  try {
    await sendEmailVerification(credential.user);
  } catch (error) {
    console.warn('Verification email not sent:', error?.code || error);
  }
  return credential.user;
}

async function submit(event) {
  event.preventDefault();
  const member = mode === 'member';
  const current = auth.currentUser;
  if (member && (!current || current.isAnonymous)) return feedback('Sign in to continue.', 'error');
  const name = member ? (current.displayName || profile.name || '') : $('checkout-name').value.trim();
  const email = member ? String(current.email || '').toLowerCase() : $('checkout-email').value.trim().toLowerCase();
  const phone = $('checkout-phone').value.trim();
  const password = $('checkout-password').value;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return feedback('Enter a valid email address.', 'error');
  if (!phone) return feedback('Enter a phone number for your order.', 'error');
  if (mode === 'signup' && name.length < 2) return feedback('Enter your full name.', 'error');
  if (mode === 'signup' && password.length < 8) return feedback('Use at least eight characters for your password.', 'error');
  if (mode === 'signin' && !password) return feedback('Enter your account password.', 'error');
  if (!returnOrderId && !cart.length) return feedback('Your cart is empty. Add products before checkout.', 'error');

  $('checkout-submit').disabled = true;
  try {
    const customer = member ? current : await authenticateCustomer(email, password, name);
    if (returnOrderId && returnReference) {
      await verifyPayment(customer);
      return;
    }
    const items = cart.map(item => ({ id: item.id, quantity: item.q }));
    feedback('Creating your secure Paystack checkout…');
    const result = await authenticatedRequest('/api/paystack-initialize', {
      method: 'POST',
      body: JSON.stringify({ name: name || customer.displayName || profile.name || 'Customer', email, phone, items })
    });
    if (!result.authorizationUrl) throw new Error('Paystack did not provide a checkout link.');
    location.assign(result.authorizationUrl);
  } catch (error) {
    $('checkout-submit').disabled = false;
    feedback(error.message || 'Could not prepare your checkout. Please try again.', 'error');
  }
}

document.querySelectorAll('[data-checkout-mode]').forEach(button => {
  button.addEventListener('click', () => setMode(button.dataset.checkoutMode));
});
$('checkout-form').addEventListener('submit', submit);

$('checkout-signout').addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, async user => {
  $('checkout-form').hidden = false;
  if (user && !user.isAnonymous) {
    try {
      const snapshot = await get(ref(database, `customers/${user.uid}`));
      profile = snapshot.val() || {};
    } catch (error) {
      console.warn('Could not load the saved profile:', error?.code || error);
      profile = {};
    }
    $('checkout-member-name').textContent = user.displayName || profile.name || 'your account';
    $('checkout-member-email').textContent = user.email || '';
    $('checkout-phone').value = $('checkout-phone').value || profile.phone || '';
    setMode('member');
    verifyPayment(user);
  } else {
    profile = {};
    setMode(mode === 'member' ? 'signup' : mode);
    if (returnReference) {
      setMode('signin');
      feedback('Sign in with the account used for checkout to verify your payment.');
    }
  }
  showCancelled();
});

const cancelled = params.get('status') === 'cancelled' || params.get('cancelled') === 'true';
function showCancelled() {
  if (cancelled) feedback('Payment was not completed. Your cart is still saved; you can try again.', 'error');
}
showCancelled();
renderCart();
setMode('signup');
