const User = require('../models/User');
const Order = require('../models/Order');
const Payment = require('../models/Payment');
const AuditLog = require('../models/AuditLog');

// @desc    Get dashboard metrics based on role
// @route   GET /api/stats/dashboard
// @access  Private
exports.getDashboardStats = async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';

    if (isAdmin) {
      // Platform-wide counts
      const totalUsers = await User.countDocuments({ role: 'user' });
      const activeUsers = await User.countDocuments({ role: 'user', status: 'active' });

      // Orders counts
      const totalOrders = await Order.countDocuments({ isArchived: false });
      const pendingOrders = await Order.countDocuments({ isArchived: false, status: 'Pending' });
      const confirmedOrders = await Order.countDocuments({ isArchived: false, status: 'Confirmed' });
      const inTransitOrders = await Order.countDocuments({ isArchived: false, status: 'In Transit' });
      const completionRequestedOrders = await Order.countDocuments({ isArchived: false, status: 'Completion Requested' });
      const deliveredOrders = await Order.countDocuments({ isArchived: false, status: 'Delivered' });
      const cancelledOrders = await Order.countDocuments({ isArchived: false, status: 'Cancelled' });

      // Financials
      const orders = await Order.find({ isArchived: false }).select('deliveryCharge');
      const totalBilled = orders.reduce((sum, o) => sum + (o.deliveryCharge || 0), 0);

      const payments = await Payment.find().select('amount');
      const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

      const outstandingBalance = totalBilled - totalPaid;

      // Recent data
      const recentOrders = await Order.find({ isArchived: false })
        .populate('userId', 'name email phone company')
        .sort({ createdAt: -1 })
        .limit(5);

      const recentPayments = await Payment.find()
        .populate('userId', 'name email phone company')
        .populate('orderId', 'trackingId')
        .sort({ date: -1, createdAt: -1 })
        .limit(5);

      const recentActivities = await AuditLog.find()
        .populate('actorId', 'name role')
        .sort({ createdAt: -1 })
        .limit(6);

      return res.json({
        success: true,
        role: 'admin',
        stats: {
          totalUsers,
          activeUsers,
          totalOrders,
          pendingOrders,
          confirmedOrders,
          inTransitOrders,
          completionRequestedOrders,
          deliveredOrders,
          cancelledOrders,
          totalBilled,
          totalPaid,
          outstandingBalance,
        },
        recentOrders,
        recentPayments,
        recentActivities,
      });
    } else {
      // User specific metrics
      const userId = req.user._id;

      const totalOrders = await Order.countDocuments({ userId, isArchived: false });
      const pendingOrders = await Order.countDocuments({ userId, isArchived: false, status: 'Pending' });
      const confirmedOrders = await Order.countDocuments({ userId, isArchived: false, status: 'Confirmed' });
      const inTransitOrders = await Order.countDocuments({ userId, isArchived: false, status: 'In Transit' });
      const completionRequestedOrders = await Order.countDocuments({ userId, isArchived: false, status: 'Completion Requested' });
      const deliveredOrders = await Order.countDocuments({ userId, isArchived: false, status: 'Delivered' });
      const cancelledOrders = await Order.countDocuments({ userId, isArchived: false, status: 'Cancelled' });

      const orders = await Order.find({ userId, isArchived: false }).select('deliveryCharge');
      const totalBilled = orders.reduce((sum, o) => sum + (o.deliveryCharge || 0), 0);

      const payments = await Payment.find({ userId }).select('amount');
      const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

      const outstandingBalance = totalBilled - totalPaid;

      const recentOrders = await Order.find({ userId, isArchived: false })
        .sort({ createdAt: -1 })
        .limit(5);

      const recentPayments = await Payment.find({ userId })
        .populate('orderId', 'trackingId')
        .sort({ date: -1, createdAt: -1 })
        .limit(5);

      return res.json({
        success: true,
        role: 'user',
        stats: {
          totalOrders,
          pendingOrders,
          confirmedOrders,
          inTransitOrders,
          completionRequestedOrders,
          deliveredOrders,
          cancelledOrders,
          totalBilled,
          totalPaid,
          outstandingBalance,
        },
        recentOrders,
        recentPayments,
      });
    }
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ success: false, message: 'Server error retrieving dashboard stats' });
  }
};
