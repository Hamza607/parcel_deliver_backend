const Order = require('../models/Order');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

// Generate unique tracking ID
const generateTrackingId = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  for (let i = 0; i < 5; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `PKG-${dateStr}-${rand}`;
};

// @desc    Create new parcel order
// @route   POST /api/orders
// @access  Private (Admin or User)
exports.createOrder = async (req, res) => {
  try {
    const {
      userId,
      sender,
      receiver,
      pickupAddress,
      deliveryAddress,
      parcelInfo,
      deliveryCharge,
      codAmount,
      paymentType,
      // Simplified top-level aliases:
      receiverName,
      receiverPhone,
      receiverCity,
      description,
      weight,
      quantity,
    } = req.body;

    // Resolve receiver details
    const finalReceiverName = receiver?.name || receiverName;
    const finalReceiverPhone = receiver?.phone || receiverPhone;
    const finalDeliveryAddress = deliveryAddress || receiver?.address;
    const finalReceiverCity = receiver?.city || receiverCity || '';

    // Resolve parcel description
    const finalDescription = parcelInfo?.description || description;

    // Validate essential fields
    if (!finalReceiverName || !finalReceiverPhone || !finalDeliveryAddress || !finalDescription) {
      return res.status(400).json({
        success: false,
        message: 'Please provide Receiver Name, Phone, Delivery Address, and Parcel Description',
      });
    }

    // Resolve sender details (defaulting to logged-in user profile)
    const finalSenderName = sender?.name || req.user.name || 'Customer';
    const finalSenderPhone = sender?.phone || req.user.phone || 'N/A';
    const finalSenderAddress = sender?.address || pickupAddress || req.user.address || 'Sender Address';
    const finalPickupAddress = pickupAddress || finalSenderAddress || 'Sender Location';
    const finalSenderCity = sender?.city || '';

    // Resolve delivery charge (defaults to 500 PKR if not provided)
    const finalDeliveryCharge = deliveryCharge !== undefined && deliveryCharge !== null
      ? Number(deliveryCharge)
      : 500;

    let targetUserId = req.user._id;

    // If Admin is creating, they can select a specific user account
    if (req.user.role === 'admin' && userId) {
      const userExists = await User.findById(userId);
      if (!userExists) {
        return res.status(400).json({ success: false, message: 'Selected user account does not exist' });
      }
      targetUserId = userId;
    }

    const trackingId = generateTrackingId();

    const order = await Order.create({
      trackingId,
      userId: targetUserId,
      sender: {
        name: finalSenderName.trim(),
        phone: finalSenderPhone.trim(),
        city: finalSenderCity.trim(),
        address: finalSenderAddress.trim(),
      },
      receiver: {
        name: finalReceiverName.trim(),
        phone: finalReceiverPhone.trim(),
        city: finalReceiverCity.trim(),
        address: finalDeliveryAddress.trim(),
      },
      pickupAddress: finalPickupAddress.trim(),
      deliveryAddress: finalDeliveryAddress.trim(),
      parcelInfo: {
        category: parcelInfo?.category || 'Standard Parcel',
        weight: Number(parcelInfo?.weight || weight) || 1,
        quantity: Number(parcelInfo?.quantity || quantity) || 1,
        description: finalDescription.trim(),
        specialInstructions: parcelInfo?.specialInstructions || req.body.specialInstructions || '',
      },
      deliveryCharge: finalDeliveryCharge,
      codAmount: Number(codAmount) || 0,
      paymentType: paymentType || 'Account Billed',
      status: 'Pending',
      statusHistory: [
        {
          status: 'Pending',
          updatedBy: req.user._id,
          note: 'Order created',
          timestamp: new Date(),
        },
      ],
    });

    await AuditLog.create({
      actorId: req.user._id,
      action: 'CREATE_ORDER',
      entityType: 'Order',
      entityId: order._id.toString(),
      details: { trackingId: order.trackingId, deliveryCharge: order.deliveryCharge, userId: targetUserId },
    });

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      order,
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ success: false, message: 'Server error creating parcel order' });
  }
};

// @desc    Get all orders (Admin views all, User views their own)
// @route   GET /api/orders
// @access  Private
exports.getAllOrders = async (req, res) => {
  try {
    const { status, search, userId, startDate, endDate } = req.query;

    const query = { isArchived: false };

    // Role filtering: Regular users only see their own orders
    if (req.user.role !== 'admin') {
      query.userId = req.user._id;
    } else if (userId) {
      query.userId = userId;
    }

    if (status && status !== 'all') {
      query.status = status;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { trackingId: searchRegex },
        { 'receiver.name': searchRegex },
        { 'receiver.phone': searchRegex },
        { 'sender.name': searchRegex },
        { 'sender.phone': searchRegex },
        { pickupAddress: searchRegex },
        { deliveryAddress: searchRegex },
      ];
    }

    const orders = await Order.find(query)
      .populate('userId', 'name email phone company')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    console.error('Get all orders error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching orders' });
  }
};

// @desc    Get single order details
// @route   GET /api/orders/:id
// @access  Private
exports.getOrderById = async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, isArchived: false })
      .populate('userId', 'name email phone company address')
      .populate('statusHistory.updatedBy', 'name role');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Authorization check
    if (req.user.role !== 'admin' && order.userId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied to this order' });
    }

    res.json({ success: true, order });
  } catch (error) {
    console.error('Get order by id error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching order details' });
  }
};

// @desc    Update order (User can edit if not Delivered/Cancelled; Admin can edit all + status)
// @route   PUT /api/orders/:id
// @access  Private
exports.updateOrder = async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, isArchived: false });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const isAdmin = req.user.role === 'admin';
    const isOwner = order.userId.toString() === req.user._id.toString();

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // User restrictions: cannot edit if Delivered or Cancelled
    if (!isAdmin && (order.status === 'Delivered' || order.status === 'Cancelled')) {
      return res.status(400).json({
        success: false,
        message: `Order cannot be modified as it is already marked as ${order.status}`,
      });
    }

    const {
      sender,
      receiver,
      pickupAddress,
      deliveryAddress,
      parcelInfo,
      deliveryCharge,
      codAmount,
      paymentType,
      status,
      statusNote,
    } = req.body;

    if (sender) {
      if (sender.name) order.sender.name = sender.name;
      if (sender.phone) order.sender.phone = sender.phone;
      if (sender.city !== undefined) order.sender.city = sender.city;
      if (sender.address !== undefined) order.sender.address = sender.address;
    }

    if (receiver) {
      if (receiver.name) order.receiver.name = receiver.name;
      if (receiver.phone) order.receiver.phone = receiver.phone;
      if (receiver.city !== undefined) order.receiver.city = receiver.city;
      if (receiver.address !== undefined) order.receiver.address = receiver.address;
    }

    if (pickupAddress) order.pickupAddress = pickupAddress;
    if (deliveryAddress) order.deliveryAddress = deliveryAddress;

    if (parcelInfo) {
      if (parcelInfo.category) order.parcelInfo.category = parcelInfo.category;
      if (parcelInfo.weight !== undefined) order.parcelInfo.weight = Number(parcelInfo.weight);
      if (parcelInfo.quantity !== undefined) order.parcelInfo.quantity = Number(parcelInfo.quantity);
      if (parcelInfo.description) order.parcelInfo.description = parcelInfo.description;
      if (parcelInfo.specialInstructions !== undefined) order.parcelInfo.specialInstructions = parcelInfo.specialInstructions;
    }

    // Admin can update charges and status
    if (isAdmin) {
      if (deliveryCharge !== undefined && Number(deliveryCharge) >= 0) {
        order.deliveryCharge = Number(deliveryCharge);
      }
      if (codAmount !== undefined) {
        order.codAmount = Number(codAmount);
      }
      if (paymentType) {
        order.paymentType = paymentType;
      }

      if (status && status !== order.status) {
        order.status = status;
        order.statusHistory.push({
          status,
          updatedBy: req.user._id,
          note: statusNote || `Status updated to ${status} by admin`,
          timestamp: new Date(),
        });
      }
    }

    await order.save();

    await AuditLog.create({
      actorId: req.user._id,
      action: 'UPDATE_ORDER',
      entityType: 'Order',
      entityId: order._id.toString(),
      details: { trackingId: order.trackingId, status: order.status },
    });

    res.json({
      success: true,
      message: 'Order updated successfully',
      order,
    });
  } catch (error) {
    console.error('Update order error:', error);
    res.status(500).json({ success: false, message: 'Server error updating order' });
  }
};

// @desc    Soft delete (archive) order
// @route   DELETE /api/orders/:id
// @access  Private
exports.deleteOrder = async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, isArchived: false });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const isAdmin = req.user.role === 'admin';
    const isOwner = order.userId.toString() === req.user._id.toString();

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    if (!isAdmin && order.status === 'Delivered') {
      return res.status(400).json({
        success: false,
        message: 'Delivered orders cannot be deleted to preserve financial audit trail',
      });
    }

    // Soft delete / archive
    order.isArchived = true;
    await order.save();

    await AuditLog.create({
      actorId: req.user._id,
      action: 'ARCHIVE_ORDER',
      entityType: 'Order',
      entityId: order._id.toString(),
      details: { trackingId: order.trackingId, deliveryCharge: order.deliveryCharge },
    });

    res.json({ success: true, message: 'Order archived/deleted successfully' });
  } catch (error) {
    console.error('Delete order error:', error);
    res.status(500).json({ success: false, message: 'Server error deleting order' });
  }
};

// @desc    Client marks order as delivered (Requests verification from Admin)
// @route   PUT /api/orders/:id/request-completion
// @access  Private (Order Owner or Admin)
exports.requestCompletion = async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, isArchived: false });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const isOwner = order.userId.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Access denied: You can only request completion for your own order' });
    }

    if (order.status === 'Delivered') {
      return res.status(400).json({ success: false, message: 'Order is already marked as Delivered / Completed' });
    }

    const { note } = req.body;

    order.status = 'Completion Requested';
    order.statusHistory.push({
      status: 'Completion Requested',
      updatedBy: req.user._id,
      note: note || 'Client reported parcel as delivered. Awaiting admin verification.',
      timestamp: new Date(),
    });

    await order.save();

    await AuditLog.create({
      actorId: req.user._id,
      action: 'REQUEST_COMPLETION',
      entityType: 'Order',
      entityId: order._id.toString(),
      details: { trackingId: order.trackingId, status: order.status },
    });

    res.json({
      success: true,
      message: 'Completion request submitted! Waiting for Admin verification.',
      order,
    });
  } catch (error) {
    console.error('Request completion error:', error);
    res.status(500).json({ success: false, message: 'Server error requesting completion' });
  }
};

// @desc    Admin verifies and completes or rejects completion request
// @route   PUT /api/orders/:id/verify-completion
// @access  Private (Admin only)
exports.verifyCompletion = async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, isArchived: false });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied: Admin only' });
    }

    const { action, note } = req.body; // action: 'approve' | 'reject'

    if (action === 'reject') {
      order.status = 'Pending';
      order.statusHistory.push({
        status: 'Pending',
        updatedBy: req.user._id,
        note: note ? `Admin rejected completion request: ${note}` : 'Admin rejected completion request (Verification failed)',
        timestamp: new Date(),
      });
    } else {
      // Default: approve & complete
      order.status = 'Delivered';
      order.statusHistory.push({
        status: 'Delivered',
        updatedBy: req.user._id,
        note: note || 'Delivery verified and marked as Completed by admin',
        timestamp: new Date(),
      });
    }

    await order.save();

    await AuditLog.create({
      actorId: req.user._id,
      action: action === 'reject' ? 'REJECT_COMPLETION' : 'VERIFY_COMPLETION',
      entityType: 'Order',
      entityId: order._id.toString(),
      details: { trackingId: order.trackingId, status: order.status, action },
    });

    res.json({
      success: true,
      message: action === 'reject' ? 'Completion request rejected' : 'Delivery verified and order completed successfully!',
      order,
    });
  } catch (error) {
    console.error('Verify completion error:', error);
    res.status(500).json({ success: false, message: 'Server error verifying completion' });
  }
};
