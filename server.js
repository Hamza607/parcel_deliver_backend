const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const morgan = require('morgan');
const connectDB = require('./config/db');
const seedData = require('./utils/seed');

dotenv.config();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Database connection middleware for serverless requests
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Database connection error',
      error: err.message,
    });
  }
});

// Root & Health check routes
app.get('/', (req, res) => {
  res.json({ message: 'Parcel Delivery Backend API is running on Vercel!' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Mount Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/orders', require('./routes/orderRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes'));
app.use('/api/stats', require('./routes/statsRoutes'));

// 404 handler
app.use((req, res, next) => {
  res.status(404).json({ success: false, message: 'API route not found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

// Only listen when executed directly (local development)
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  connectDB().then(() => {
    seedData();
    app.listen(PORT, () => {
      console.log(`Parcel Delivery System Server running on port ${PORT}`);
    });
  });
}

// Export for Vercel Serverless Functions
module.exports = app;
