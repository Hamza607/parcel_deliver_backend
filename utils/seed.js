const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/User');
const Order = require('../models/Order');
const Payment = require('../models/Payment');
const AuditLog = require('../models/AuditLog');

dotenv.config();

const seedData = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/parcel_delivery_db';
    await mongoose.connect(mongoUri);
    console.log('MongoDB connected for seeding...');

    // Check if admin already exists
    const adminExists = await User.findOne({ email: 'admin@parcel.com' });

    let adminUser = adminExists;
    if (!adminExists) {
      adminUser = await User.create({
        name: 'System Administrator',
        email: 'admin@parcel.com',
        password: 'admin123',
        phone: '+92 300 1234567',
        company: 'Parcel Delivery HQ',
        address: 'Main Blue Area, Islamabad',
        role: 'admin',
        status: 'active',
      });
      console.log('Default Admin created: admin@parcel.com / admin123');
    }

    // Check if demo user exists
    let demoUser = await User.findOne({ email: 'client@fastlogistics.com' });
    if (!demoUser) {
      demoUser = await User.create({
        name: 'Kamran Enterprises',
        email: 'client@fastlogistics.com',
        password: 'user123',
        phone: '+92 321 9876543',
        company: 'Kamran Enterprises Ltd',
        address: 'Shop 14, Hall Road, Lahore',
        role: 'user',
        status: 'active',
      });
      console.log('Demo User created: client@fastlogistics.com / user123');

      // Create sample demo orders
      const order1 = await Order.create({
        trackingId: 'PKG-20261019-A8F2K',
        userId: demoUser._id,
        sender: {
          name: 'Kamran Enterprises',
          phone: '+92 321 9876543',
          city: 'Lahore',
          address: 'Shop 14, Hall Road, Lahore',
        },
        receiver: {
          name: 'Ahmed Telecom',
          phone: '+92 333 4567890',
          city: 'Karachi',
          address: 'Plot 45, Saddar Mobile Market, Karachi',
        },
        pickupAddress: 'Shop 14, Hall Road, Lahore',
        deliveryAddress: 'Plot 45, Saddar Mobile Market, Karachi',
        parcelInfo: {
          category: 'Electronics',
          weight: 2.5,
          quantity: 3,
          description: 'Smartphone accessories & chargers box',
          specialInstructions: 'Handle with extreme care, fragile items',
        },
        deliveryCharge: 1200,
        codAmount: 18500,
        paymentType: 'Account Billed',
        status: 'In Transit',
        statusHistory: [
          { status: 'Pending', updatedBy: demoUser._id, note: 'Order booked', timestamp: new Date(Date.now() - 86400000 * 2) },
          { status: 'In Transit', updatedBy: adminUser._id, note: 'Dispatched via courier hub', timestamp: new Date(Date.now() - 86400000) },
        ],
      });

      const order2 = await Order.create({
        trackingId: 'PKG-20261019-M3X9P',
        userId: demoUser._id,
        sender: {
          name: 'Kamran Enterprises',
          phone: '+92 321 9876543',
          city: 'Lahore',
          address: 'Shop 14, Hall Road, Lahore',
        },
        receiver: {
          name: 'Zubair Cloth House',
          phone: '+92 345 1122334',
          city: 'Rawalpindi',
          address: 'Raja Bazaar, Rawalpindi',
        },
        pickupAddress: 'Shop 14, Hall Road, Lahore',
        deliveryAddress: 'Raja Bazaar, Rawalpindi',
        parcelInfo: {
          category: 'Apparel',
          weight: 4.0,
          quantity: 1,
          description: 'Textile fabrics sample bundles',
          specialInstructions: 'Deliver during shop business hours (11am - 8pm)',
        },
        deliveryCharge: 850,
        codAmount: 0,
        paymentType: 'Account Billed',
        status: 'Delivered',
        statusHistory: [
          { status: 'Pending', updatedBy: demoUser._id, note: 'Order placed', timestamp: new Date(Date.now() - 86400000 * 3) },
          { status: 'In Transit', updatedBy: adminUser._id, note: 'On route to Rawalpindi', timestamp: new Date(Date.now() - 86400000 * 2) },
          { status: 'Delivered', updatedBy: adminUser._id, note: 'Received by Zubair, signature confirmed', timestamp: new Date(Date.now() - 86400000) },
        ],
      });

      const order3 = await Order.create({
        trackingId: 'PKG-20261019-W9Q7L',
        userId: demoUser._id,
        sender: {
          name: 'Kamran Enterprises',
          phone: '+92 321 9876543',
          city: 'Lahore',
          address: 'Shop 14, Hall Road, Lahore',
        },
        receiver: {
          name: 'Mustafa Books',
          phone: '+92 312 9988776',
          city: 'Faisalabad',
          address: 'D-Ground, Faisalabad',
        },
        pickupAddress: 'Shop 14, Hall Road, Lahore',
        deliveryAddress: 'D-Ground, Faisalabad',
        parcelInfo: {
          category: 'Documents',
          weight: 0.8,
          quantity: 1,
          description: 'Business contracts and invoices',
          specialInstructions: 'Standard delivery',
        },
        deliveryCharge: 450,
        codAmount: 0,
        paymentType: 'Account Billed',
        status: 'Pending',
        statusHistory: [
          { status: 'Pending', updatedBy: demoUser._id, note: 'Order booked', timestamp: new Date() },
        ],
      });

      // Seed a recorded payment for user
      await Payment.create({
        userId: demoUser._id,
        orderId: order2._id,
        amount: 850,
        method: 'Bank Transfer',
        date: new Date(Date.now() - 86400000),
        reference: 'TXN-HBL-9812401',
        notes: 'Payment received for delivered parcel PKG-20261019-M3X9P',
        recordedBy: adminUser._id,
      });

      console.log('Sample orders and payment records seeded successfully!');
    }

    console.log('Seeding check completed successfully.');
  } catch (err) {
    console.error('Seeding error:', err);
  }
};

module.exports = seedData;

if (require.main === module) {
  seedData().then(() => {
    mongoose.connection.close();
    process.exit(0);
  });
}
