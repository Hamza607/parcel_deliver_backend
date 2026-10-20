const Payment = require('../models/Payment');
const Order = require('../models/Order');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

// @desc    Record a new payment (Admin only)
// @route   POST /api/payments
// @access  Private/Admin
exports.recordPayment = async (req, res) => {
  try {
    const { userId, orderId, amount, method, date, reference, notes } = req.body;

    if (!userId || !amount || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Valid user and payment amount are required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    let linkedOrder = null;
    if (orderId) {
      linkedOrder = await Order.findById(orderId);
      if (!linkedOrder) {
        return res.status(404).json({ success: false, message: 'Specified order not found' });
      }
    }

    const payment = await Payment.create({
      userId,
      orderId: orderId || null,
      amount: Number(amount),
      method: method || 'Cash',
      date: date ? new Date(date) : new Date(),
      reference: reference ? reference.trim() : '',
      notes: notes ? notes.trim() : '',
      recordedBy: req.user._id,
    });

    await AuditLog.create({
      actorId: req.user._id,
      action: 'RECORD_PAYMENT',
      entityType: 'Payment',
      entityId: payment._id.toString(),
      details: {
        userId,
        userName: user.name,
        amount: payment.amount,
        method: payment.method,
        reference: payment.reference,
      },
    });

    const populatedPayment = await Payment.findById(payment._id)
      .populate('userId', 'name email phone company')
      .populate('orderId', 'trackingId deliveryCharge status')
      .populate('recordedBy', 'name');

    res.status(201).json({
      success: true,
      message: 'Payment recorded successfully',
      payment: populatedPayment,
    });
  } catch (error) {
    console.error('Record payment error:', error);
    res.status(500).json({ success: false, message: 'Server error recording payment' });
  }
};

// @desc    Get payments (Admin gets all with filters; User gets own only)
// @route   GET /api/payments
// @access  Private
exports.getAllPayments = async (req, res) => {
  try {
    const { userId, method, startDate, endDate, search } = req.query;

    const query = {};

    if (req.user.role !== 'admin') {
      query.userId = req.user._id;
    } else if (userId) {
      query.userId = userId;
    }

    if (method && method !== 'all') {
      query.method = method;
    }

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.date.$lte = end;
      }
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [{ reference: searchRegex }, { notes: searchRegex }];
    }

    const payments = await Payment.find(query)
      .populate('userId', 'name email phone company')
      .populate('orderId', 'trackingId deliveryCharge status')
      .populate('recordedBy', 'name')
      .sort({ date: -1, createdAt: -1 });

    res.json({
      success: true,
      count: payments.length,
      payments,
    });
  } catch (error) {
    console.error('Get all payments error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching payments' });
  }
};

// @desc    Update payment entry (Admin only)
// @route   PUT /api/payments/:id
// @access  Private/Admin
exports.updatePayment = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment record not found' });
    }

    const { amount, method, date, reference, notes, orderId } = req.body;

    if (amount !== undefined && Number(amount) > 0) {
      payment.amount = Number(amount);
    }
    if (method) payment.method = method;
    if (date) payment.date = new Date(date);
    if (reference !== undefined) payment.reference = reference.trim();
    if (notes !== undefined) payment.notes = notes.trim();
    if (orderId !== undefined) payment.orderId = orderId || null;

    await payment.save();

    await AuditLog.create({
      actorId: req.user._id,
      action: 'UPDATE_PAYMENT',
      entityType: 'Payment',
      entityId: payment._id.toString(),
      details: { amount: payment.amount, method: payment.method, reference: payment.reference },
    });

    const updatedPayment = await Payment.findById(payment._id)
      .populate('userId', 'name email phone company')
      .populate('orderId', 'trackingId deliveryCharge status')
      .populate('recordedBy', 'name');

    res.json({
      success: true,
      message: 'Payment updated successfully',
      payment: updatedPayment,
    });
  } catch (error) {
    console.error('Update payment error:', error);
    res.status(500).json({ success: false, message: 'Server error updating payment' });
  }
};

// @desc    Delete payment entry (Admin only)
// @route   DELETE /api/payments/:id
// @access  Private/Admin
exports.deletePayment = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment record not found' });
    }

    await Payment.findByIdAndDelete(payment._id);

    await AuditLog.create({
      actorId: req.user._id,
      action: 'DELETE_PAYMENT',
      entityType: 'Payment',
      entityId: payment._id.toString(),
      details: { amount: payment.amount, userId: payment.userId },
    });

    res.json({ success: true, message: 'Payment record deleted successfully' });
  } catch (error) {
    console.error('Delete payment error:', error);
    res.status(500).json({ success: false, message: 'Server error deleting payment' });
  }
};

// @desc    Get user payment summary and ledger
// @route   GET /api/payments/user/:id/summary
// @access  Private
exports.getUserPaymentSummary = async (req, res) => {
  try {
    const targetUserId = req.params.id;

    if (req.user.role !== 'admin' && req.user._id.toString() !== targetUserId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const user = await User.findById(targetUserId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const orders = await Order.find({ userId: targetUserId, isArchived: false }).sort({ createdAt: -1 });
    const payments = await Payment.find({ userId: targetUserId }).sort({ date: -1 });

    const totalBilled = orders.reduce((sum, o) => sum + (o.deliveryCharge || 0), 0);
    const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const outstandingBalance = totalBilled - totalPaid;

    res.json({
      success: true,
      summary: {
        userId: user._id,
        userName: user.name,
        company: user.company,
        totalOrders: orders.length,
        totalBilled,
        totalPaid,
        outstandingBalance,
      },
      orders,
      payments,
    });
  } catch (error) {
    console.error('Get summary error:', error);
    res.status(500).json({ success: false, message: 'Server error calculating payment summary' });
  }
};
