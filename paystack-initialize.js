const crypto = require('node:crypto');
const {
  body,
  database,
  json,
  paystackRequest,
  phoneNumber,
  requireSameOrigin,
  sha256,
  siteUrl,
  user
} = require('./_lib');

const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

module.exports = async function (req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Use POST to start Paystack checkout.' });

  try {
    requireSameOrigin(req);
    const identity = await user(req);
    if (!identity.email || identity.firebase?.sign_in_provider === 'anonymous') {
      return json(res, 403, { error: 'Create or sign in to a customer account before paying.' });
    }

    const fields = await body(req);
    const email = String(fields.email || '').trim().toLowerCase();
    const customerName = String(fields.name || '').trim();
    const phone = phoneNumber(fields.phone);
    if (customerName.length < 2 || customerName.length > 120 || !validEmail(email)) {
      return json(res, 400, { error: 'Enter your name and a valid email address.' });
    }
    if (email !== identity.email.toLowerCase()) {
      return json(res, 403, { error: 'Sign in with the same email address used for this checkout.' });
    }

    const db = database();
    const catalogSnapshot = await db.ref('products').get();
    const catalog = catalogSnapshot.val() || {};
    const requestedItems = Array.isArray(fields.items) ? fields.items : [];
    if (!requestedItems.length || requestedItems.length > 30) {
      return json(res, 400, { error: 'Your cart must contain between 1 and 30 items.' });
    }

    const items = [];
    for (const requested of requestedItems) {
      const product = catalog[String(requested.id)];
      const price = Number(product?.price);
      const quantity = Number(requested.quantity);
      if (!product || !Number.isSafeInteger(price) || price < 1 || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
        return json(res, 400, { error: 'A cart item is unavailable or has an invalid quantity. Refresh the shop and try again.' });
      }
      items.push({
        id: String(requested.id),
        name: String(product.name || '').slice(0, 150),
        quantity,
        price,
        priceText: new Intl.NumberFormat('en-KE').format(price * quantity)
      });
    }

    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    if (!Number.isSafeInteger(total) || total < 1 || total > 150_000) {
      return json(res, 400, { error: 'The checkout total must be between KSh 1 and KSh 150,000.' });
    }

    const ip = String(req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
    const limitRef = db.ref(`checkoutLimits/${sha256(ip)}`);
    const now = Date.now();
    let rateLimited = false;
    await limitRef.transaction(current => {
      if (current && current.expiresAt > now && current.count >= 5) {
        rateLimited = true;
        return;
      }
      return { count: current && current.expiresAt > now ? current.count + 1 : 1, expiresAt: now + 60_000 };
    });
    if (rateLimited) return json(res, 429, { error: 'Please wait a minute before starting another payment.' });

    const orderId = crypto.randomUUID();
    const reference = `AA${Date.now()}${crypto.randomBytes(5).toString('hex')}`;
    const order = {
      id: orderId,
      reference,
      customerUid: identity.uid,
      customerName,
      email,
      phone,
      items,
      total,
      currency: 'KES',
      paymentStatus: 'initiating',
      receiptStatus: 'disabled',
      createdAt: new Date().toISOString()
    };
    await db.ref(`orders/${orderId}`).set(order);

    try {
      const callback = new URL('/checkout.html', siteUrl(req));
      callback.searchParams.set('order', orderId);
      const transaction = await paystackRequest('/transaction/initialize', {
        email,
        amount: total * 100,
        currency: 'KES',
        reference,
        callback_url: callback.toString(),
        metadata: {
          order_id: orderId,
          customer_name: customerName,
          customer_phone: phone
        }
      });
      if (!transaction.authorization_url || transaction.reference !== reference) {
        throw new Error('Paystack did not return a valid checkout link.');
      }
      await db.ref(`orders/${orderId}`).update({ paymentStatus: 'pending' });
      return json(res, 200, { orderId, reference, authorizationUrl: transaction.authorization_url });
    } catch (error) {
      await db.ref(`orders/${orderId}`).update({
        paymentStatus: 'failed',
        paymentError: String(error.message || 'Payment could not be initialized.').slice(0, 180)
      });
      throw error;
    }
  } catch (error) {
    const unavailable = /PAYSTACK_SECRET_KEY|Firebase service account/.test(error.message);
    return json(res, unavailable ? 503 : 400, {
      error: error.message || 'Could not start secure checkout.'
    });
  }
};
