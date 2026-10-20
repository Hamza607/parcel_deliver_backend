const User = require('../models/User');
const Order = require('../models/Order');
const Payment = require('../models/Payment');
const AuditLog = require('../models/AuditLog');

// @desc    Create new user account (Admin only)
// @route   POST /api/users
// @access  Private/Admin
exports.createUser = async (req, res) => {
  try {
    const { name, email, password, phone, company, address, role } = req.body;

    if (!name || !email || !password || !phone) {
      return res.status(400).json({ success: false, message: 'Please provide name, email, password and phone' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'A user with this email already exists' });
    }

    const newUser = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      phone: phone.trim(),
      company: company ? company.trim() : '',
      address: address ? address.trim() : '',
      role: role === 'admin' ? 'admin' : 'user',
      status: 'active',
    });

    await AuditLog.create({
      actorId: req.user._id,
      action: 'CREATE_USER',
      entityType: 'User',
      entityId: newUser._id.toString(),
      details: { email: newUser.email, role: newUser.role, name: newUser.name },
    });

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        phone: newUser.phone,
        company: newUser.company,
        address: newUser.address,
        role: newUser.role,
        status: newUser.status,
        createdAt: newUser.createdAt,
      },
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ success: false, message: 'Server error creating user' });
  }
};

// @desc    Get all users with computed order count, billed, paid, balance
// @route   GET /api/users
// @access  Private/Admin
exports.getAllUsers = async (req, res) => {
  try {
    const { search, status, role } = req.query;

    const query = {};
    if (status) query.status = status;
    if (role) query.role = role;
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { name: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
        { company: searchRegex },
      ];
    }

    const users = await User.find(query).sort({ createdAt: -1 });

    // Compute financial and order aggregates for each user
    const usersWithStats = await Promise.all(
      users.map(async (u) => {
        // Orders aggregate
        const orders = await Order.find({ userId: u._id, isArchived: false });
        const totalOrders = orders.length;
        const totalBilled = orders.reduce((sum, o) => sum + (o.deliveryCharge || 0), 0);

        // Payments aggregate
        const payments = await Payment.find({ userId: u._id });
        const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

        const outstandingBalance = totalBilled - totalPaid;

        return {
          id: u._id,
          name: u.name,
          email: u.email,
          phone: u.phone,
          company: u.company,
          address: u.address,
          role: u.role,
          status: u.status,
          totalOrders,
          totalBilled,
          totalPaid,
          outstandingBalance,
          createdAt: u.createdAt,
        };
      })
    );

    res.json({
      success: true,
      count: usersWithStats.length,
      users: usersWithStats,
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching users' });
  }
};

// @desc    Get user by ID with their complete order and payment history
// @route   GET /api/users/:id
// @access  Private/Admin
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const orders = await Order.find({ userId: user._id, isArchived: false }).sort({ createdAt: -1 });
    const payments = await Payment.find({ userId: user._id }).sort({ date: -1 });

    const totalOrders = orders.length;
    const totalBilled = orders.reduce((sum, o) => sum + (o.deliveryCharge || 0), 0);
    const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const outstandingBalance = totalBilled - totalPaid;

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        company: user.company,
        address: user.address,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
      },
      stats: {
        totalOrders,
        totalBilled,
        totalPaid,
        outstandingBalance,
      },
      orders,
      payments,
    });
  } catch (error) {
    console.error('Get user by id error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching user details' });
  }
};

// @desc    Update user details & status (active/inactive)
// @route   PUT /api/users/:id
// @access  Private/Admin
exports.updateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const { name, phone, company, address, status, role } = req.body;

    if (name) user.name = name.trim();
    if (phone) user.phone = phone.trim();
    if (company !== undefined) user.company = company.trim();
    if (address !== undefined) user.address = address.trim();

    // Prevent deactivating or demoting the last active admin
    if (user.role === 'admin' && (status === 'inactive' || (role && role !== 'admin'))) {
      const activeAdminCount = await User.countDocuments({ role: 'admin', status: 'active' });
      if (activeAdminCount <= 1) {
        return res.status(400).json({
          success: false,
          message: 'Cannot deactivate or change role of the last active administrator',
        });
      }
    }

    if (status) user.status = status;
    if (role && (role === 'admin' || role === 'user')) user.role = role;

    await user.save();

    await AuditLog.create({
      actorId: req.user._id,
      action: 'UPDATE_USER',
      entityType: 'User',
      entityId: user._id.toString(),
      details: { name: user.name, status: user.status, role: user.role },
    });

    res.json({
      success: true,
      message: 'User updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        company: user.company,
        address: user.address,
        role: user.role,
        status: user.status,
      },
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ success: false, message: 'Server error updating user' });
  }
};

// @desc    Admin reset user password
// @route   PUT /api/users/:id/reset-password
// @access  Private/Admin
exports.resetUserPassword = async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.password = newPassword;
    await user.save();

    await AuditLog.create({
      actorId: req.user._id,
      action: 'RESET_PASSWORD_BY_ADMIN',
      entityType: 'User',
      entityId: user._id.toString(),
      details: { email: user.email },
    });

    res.json({ success: true, message: `Password reset successfully for ${user.email}` });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error resetting password' });
  }
};

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private/Admin
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own admin account' });
    }

    if (user.role === 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount <= 1) {
        return res.status(400).json({ success: false, message: 'At least one admin account must be retained' });
      }
    }

    // Soft delete associated orders
    await Order.updateMany({ userId: user._id }, { isArchived: true });

    await User.findByIdAndDelete(user._id);

    await AuditLog.create({
      actorId: req.user._id,
      action: 'DELETE_USER',
      entityType: 'User',
      entityId: user._id.toString(),
      details: { email: user.email, name: user.name },
    });

    res.json({ success: true, message: 'User deleted and related orders archived' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ success: false, message: 'Server error deleting user' });
  }
};
