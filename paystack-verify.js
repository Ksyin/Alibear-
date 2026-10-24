const {
  body,
  database,
  json,
  requireSameOrigin,
  sendReceipt,
  user,
  verifyPaystack
} = require('./_lib');

module.exports = async function (req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Use POST to verify Paystack payment.' });

  try {
    requireSameOrigin(req);
    const identity = await user(req);
    const { orderId, reference } = await body(req);
    if (!/^[0-9a-f-]{36}$/i.test(String(orderId || '')) || typeof reference !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(reference)) {
      return json(res, 400, { error: 'The order or payment reference is invalid.' });
    }

    const orderRef = database().ref(`orders/${orderId}`);
    const snapshot = await orderRef.get();
    const order = snapshot.val();
    if (!order || order.customerUid !== identity.uid || order.email !== String(identity.email || '').toLowerCase() || order.reference !== reference) {
      return json(res, 404, { error: 'This payment does not match your account and order.' });
    }
    if (order.paymentStatus === 'paid') {
      return json(res, 200, { paid: true, orderId, receiptStatus: order.receiptStatus || 'pending' });
    }

    const transaction = await verifyPaystack(reference);
    const expectedAmount = Number(order.total) * 100;
    if (transaction.status !== 'success' ||
        transaction.reference !== reference ||
        Number(transaction.amount) !== expectedAmount ||
        transaction.currency !== 'KES' ||
        String(transaction.customer?.email || '').toLowerCase() !== order.email) {
      return json(res, 409, { error: 'Paystack has not confirmed the expected amount and customer for this order.' });
    }

    let paid = false;
    let shouldSendReceipt = false;
    await orderRef.transaction(current => {
      if (!current || current.reference !== reference || current.customerUid !== identity.uid) return;
      if (current.paymentStatus === 'paid') {
        paid = true;
        shouldSendReceipt = false;
        return current;
      }
      if (current.paymentStatus !== 'pending' && current.paymentStatus !== 'initiating') return;
      paid = true;
      shouldSendReceipt = true;
      return {
        ...current,
        paymentStatus: 'paid',
        paidAt: new Date().toISOString(),
        receiptNumber: reference,
        verifiedAmount: Number(transaction.amount),
        receiptStatus: 'sending'
      };
    });

    if (!paid) return json(res, 409, { error: 'The order could not be marked paid. Contact the store with your payment reference.' });
    let receiptStatus = order.receiptStatus || 'pending';
    if (shouldSendReceipt) {
      try {
        const receipt = await sendReceipt({ ...order, receiptNumber: reference });
        receiptStatus = receipt.sent ? 'sent' : 'disabled';
        await orderRef.update({
          receiptStatus,
          ...(receipt.sent ? { receiptEmailId: receipt.id } : { receiptMessage: receipt.reason })
        });
      } catch (error) {
        receiptStatus = 'failed';
        await orderRef.update({
          receiptStatus,
          receiptMessage: String(error.message || 'Receipt email could not be sent.').slice(0, 180)
        });
      }
    }
    return json(res, 200, { paid: true, orderId, receiptStatus });
  } catch (error) {
    return json(res, 400, { error: error.message || 'Could not verify this Paystack payment.' });
  }
};
