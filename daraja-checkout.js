const crypto = require('node:crypto');
const {
  body,
  database,
  darajaConfig,
  darajaPost,
  darajaToken,
  json,
  phoneNumber,
  requireSameOrigin,
  sha256,
  timestamp,
  user
} = require('./_lib');

module.exports = async function (req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Use POST to start M-Pesa checkout.' });

  try {
    requireSameOrigin(req);
    await user(req);

    const fields = await body(req);
    const email = String(fields.email || '').trim().toLowerCase();
    const customerName = String(fields.name || '').trim();
    const phone = phoneNumber(fields.phone);
    if (customerName.length < 2 || customerName.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(res, 400, { error: 'Enter your name and a valid email address for the payment receipt.' });
    }

    const db = database();
    const settings = darajaConfig();
    const productsSnapshot = await db.ref('products').get();
    const catalog = productsSnapshot.val() || {};
    const cart = Array.isArray(fields.items) ? fields.items : [];
    if (!cart.length || cart.length > 30) {
      return json(res, 400, { error: 'Add up to 30 valid products before checking out.' });
    }

    const items = [];
    for (const requested of cart) {
      const product = catalog[String(requested.id)];
      const unitPrice = Number(product?.price);
      const quantity = Number(requested.quantity);
      if (!product || !Number.isSafeInteger(unitPrice) || unitPrice < 1 || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
        return json(res, 400, { error: 'A product in your cart is no longer available. Refresh the shop and try again.' });
      }
      items.push({
        id: String(requested.id),
        name: String(product.name || '').slice(0, 150),
        quantity,
        price: unitPrice,
        priceText: new Intl.NumberFormat('en-KE').format(unitPrice * quantity)
      });
    }

    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    if (!Number.isSafeInteger(total) || total < 1 || total > 150_000) {
      return json(res, 400, { error: 'Your checkout total must be between KSh 1 and KSh 150,000 per M-Pesa request.' });
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
    if (rateLimited) return json(res, 429, { error: 'Please wait a minute before starting another payment request.' });

    const id = crypto.randomUUID();
    const orderToken = crypto.randomBytes(32).toString('base64url');
    const createdAt = new Date().toISOString();
    const order = {
      id,
      customerUid: null,
      customerName,
      email,
      phone,
      items,
      total,
      paymentStatus: 'initiating',
      receiptStatus: 'disabled',
      createdAt,
      orderTokenHash: sha256(orderToken),
      currency: 'KES'
    };
    await db.ref(`orders/${id}`).set(order);

    try {
      const access = await darajaToken(settings);
      const time = timestamp();
      const password = Buffer.from(`${settings.shortcode}${settings.passkey}${time}`).toString('base64');
      const result = await darajaPost('/mpesa/stkpush/v1/processrequest', access, {
        BusinessShortCode: settings.shortcode,
        Password: password,
        Timestamp: time,
        TransactionType: 'CustomerPayBillOnline',
        Amount: total,
        PartyA: phone,
        PartyB: settings.shortcode,
        PhoneNumber: phone,
        CallBackURL: settings.callback,
        AccountReference: `AH${id.replace(/-/g, '').slice(0, 10)}`,
        TransactionDesc: `Order ${id.slice(0, 6)}`
      }, settings);

      if (!result.CheckoutRequestID || result.ResponseCode !== '0') {
        throw new Error(result.CustomerMessage || result.errorMessage || 'M-Pesa did not accept the payment request.');
      }

      await db.ref(`orders/${id}`).update({
        paymentStatus: 'pending',
        checkoutRequestId: result.CheckoutRequestID,
        merchantRequestId: result.MerchantRequestID || ''
      });
      await db.ref(`paymentLookups/${sha256(result.CheckoutRequestID)}`).set(id);
      return json(res, 200, {
        orderId: id,
        orderToken,
        checkoutRequestId: result.CheckoutRequestID,
        message: result.CustomerMessage || 'Approve the M-Pesa prompt on your phone.'
      });
    } catch (error) {
      await db.ref(`orders/${id}`).update({
        paymentStatus: 'failed',
        paymentError: String(error.message || 'Payment request failed').slice(0, 180)
      });
      throw error;
    }
  } catch (error) {
    const unavailable = /is not configured yet/.test(error.message);
    return json(res, unavailable ? 503 : 400, {
      error: error.message || 'Could not start checkout. Please contact the shop for help.'
    });
  }
};
