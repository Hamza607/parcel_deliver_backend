const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
  {
    trackingId: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    sender: {
      name: { type: String, required: true },
      phone: { type: String, required: true },
      city: { type: String, default: '' },
      address: { type: String, default: '' },
    },
    receiver: {
      name: { type: String, required: true },
      phone: { type: String, required: true },
      city: { type: String, default: '' },
      address: { type: String, required: true },
    },
    pickupAddress: {
      type: String,
      required: true,
    },
    deliveryAddress: {
      type: String,
      required: true,
    },
    parcelInfo: {
      category: {
        type: String,
        default: 'Standard Parcel',
      },
      weight: {
        type: Number,
        default: 1.0,
      },
      quantity: {
        type: Number,
        default: 1,
      },
      description: {
        type: String,
        required: true,
      },
      specialInstructions: {
        type: String,
        default: '',
      },
    },
    deliveryCharge: {
      type: Number,
      required: [true, 'Please specify delivery charges in PKR'],
      min: [0, 'Delivery charges cannot be negative'],
    },
    codAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    paymentType: {
      type: String,
      enum: ['Account Billed', 'Cash on Delivery', 'Prepaid'],
      default: 'Account Billed',
    },
    status: {
      type: String,
      enum: ['Pending', 'Confirmed', 'In Transit', 'Completion Requested', 'Delivered', 'Cancelled'],
      default: 'Pending',
      index: true,
    },
    statusHistory: [
      {
        status: { type: String, required: true },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        note: { type: String, default: '' },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Pre-validate or helper to auto-generate tracking ID if not provided
orderSchema.pre('validate', function () {
  if (!this.trackingId) {
    const randomHex = Math.random().toString(36).substring(2, 7).toUpperCase();
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    this.trackingId = `PKG-${dateStr}-${randomHex}`;
  }
});

module.exports = mongoose.model('Order', orderSchema);
