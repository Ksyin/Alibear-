const crypto = require('node:crypto');
const {
  cfg,
  database,
  json,
  sendReceipt,
  verifyPaystack
} = require('./_lib');

async function readRawBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 128_000) throw new Error('Webhook request is too large.');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function validSignature(rawBody, signature) {
  const secret = cfg('PAYSTACK_SECRET_KEY');
  if (!secret) throw new Error('PAYSTACK_SECRET_KEY is missing.');
  if (typeof signature !== 'string' || !/^[a-f0-9]{128}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha512', secret).update(rawBody).digest();
  const received = Buffer.from(signature, 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

module.exports = async function (req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Use POST for Paystack webhooks.' });

  try {
    const rawBody = await readRawBody(req);
    if (!validSignature(rawBody, req.headers['x-paystack-signature'])) {
      return json(res, 401, { error: 'Invalid Paystack webhook signature.' });
    }

    let event;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return json(res, 400, { error: 'The webhook body is not valid JSON.' });
    }
    if (event.event !== 'charge.success') return json(res, 200, { received: true });

    const reference = event.data?.reference;
    const orderId = event.data?.metadata?.order_id;
    if (typeof reference !== 'string' || typeof orderId !== 'string' || !/^[0-9a-f-]{36}$/i.test(orderId)) {
      return json(res, 400, { error: 'The payment event has no valid order reference.' });
    }

    const db = database();
    const orderRef = db.ref(`orders/${orderId}`);
    const snapshot = await orderRef.get();
    const order = snapshot.val();
    if (!order || order.reference !== reference) {
      return json(res, 404, { error: 'No matching order was found for this payment.' });
    }

    const transaction = await verifyPaystack(reference);
    if (transaction.status !== 'success' ||
        transaction.reference !== reference ||
        transaction.metadata?.order_id !== orderId ||
        Number(transaction.amount) !== Number(order.total) * 100 ||
        transaction.currency !== 'KES' ||
        String(transaction.customer?.email || '').toLowerCase() !== order.email) {
      return json(res, 409, { error: 'The verified Paystack transaction does not match this order.' });
    }

    const receiptClaimId = crypto.randomUUID();
    const paidAt = new Date().toISOString();
    const result = await orderRef.transaction(current => {
      if (!current || current.reference !== reference || current.paymentStatus === 'paid') return current;
      if (current.paymentStatus !== 'pending' && current.paymentStatus !== 'initiating') return;
      return {
        ...current,
        paymentStatus: 'paid',
        paidAt,
        receiptNumber: reference,
        verifiedAmount: Number(transaction.amount),
        receiptStatus: 'sending',
        receiptClaimId
      };
    });

    const confirmedOrder = result.snapshot.val();
    if (!confirmedOrder || confirmedOrder.paymentStatus !== 'paid') {
      return json(res, 409, { error: 'The order could not be marked paid.' });
    }

    if (confirmedOrder.receiptClaimId === receiptClaimId) {
      try {
        const receipt = await sendReceipt({ ...confirmedOrder, receiptNumber: reference });
        await orderRef.update({
          receiptStatus: receipt.sent ? 'sent' : 'disabled',
          ...(receipt.sent ? { receiptEmailId: receipt.id } : { receiptMessage: receipt.reason })
        });
      } catch (error) {
        await orderRef.update({
          receiptStatus: 'failed',
          receiptMessage: String(error.message || 'Receipt email could not be sent.').slice(0, 180)
        });
      }
    }

    return json(res, 200, { received: true, paid: true, orderId });
  } catch (error) {
    const unavailable = /PAYSTACK_SECRET_KEY|FIREBASE_SERVICE_ACCOUNT_JSON/.test(error.message);
    return json(res, unavailable ? 503 : 400, {
      error: error.message || 'Could not process the Paystack webhook.'
    });
  }
};

module.exports.config = { api: { bodyParser: false } };
// Paystack signs the raw body, so Vercel's JSON body parser must be off.
module.exports.config = { api: { bodyParser: false } };
