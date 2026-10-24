import {
  auth,
  authenticatedRequest,
  createUserWithEmailAndPassword,
  database,
  get,
  onAuthStateChanged,
  ref,
  sendEmailVerification,
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

function feedback(message, tone = 'info') {
  const target = $('checkout-feedback');
  target.textContent = message;
  target.dataset.tone = tone;
  target.hidden = !message;
}

function setMode(next) {
  mode = next;
  document.querySelectorAll('[data-checkout-mode]').forEach(button => {
    button.classList.toggle('active', button.dataset.checkoutMode === next);
  });
  $('checkout-name-label').hidden = next === 'signin';
  $('checkout-name').hidden = next === 'signin';
  $('checkout-name').required = next === 'signup';
  $('checkout-password-label').textContent = next === 'signup' ? 'Create a password' : 'Password';
  $('checkout-password').autocomplete = next === 'signup' ? 'new-password' : 'current-password';
  $('checkout-password').minLength = next === 'signup' ? 8 : 1;
  $('checkout-submit').textContent = next === 'signup' ? 'Create account and continue to Paystack →' : 'Sign in and continue to Paystack →';
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
  await sendEmailVerification(credential.user, {
    url: `${location.origin}/account.html`,
    handleCodeInApp: false
  });
  return credential.user;
}

async function submit(event) {
  event.preventDefault();
  const name = $('checkout-name').value.trim();
  const email = $('checkout-email').value.trim().toLowerCase();
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
    const customer = await authenticateCustomer(email, password, name);
    if (returnOrderId && returnReference) {
      await verifyPayment(customer);
      return;
    }
    const items = cart.map(item => ({ id: item.id, quantity: item.q }));
    feedback('Creating your secure Paystack checkout…');
    const result = await authenticatedRequest('/api/paystack-initialize', {
      method: 'POST',
      body: JSON.stringify({ name: name || customer.displayName || 'Customer', email, phone, items })
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

onAuthStateChanged(auth, user => {
  if (user && !user.isAnonymous) {
    $('checkout-email').value = $('checkout-email').value || user.email || '';
    $('checkout-name').value = $('checkout-name').value || user.displayName || '';
    setMode('signin');
    verifyPayment(user);
  } else if (returnReference) {
    setMode('signin');
    feedback('Sign in with the account used for checkout to verify your payment.');
  }
});

if (params.get('status') === 'cancelled' || params.get('cancelled') === 'true') {
  feedback('Payment was not completed. Your cart is still saved; you can try again.', 'error');
}
renderCart();
setMode('signup');
