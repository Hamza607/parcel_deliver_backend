const express = require('express');
const router = express.Router();
const {
  recordPayment,
  getAllPayments,
  updatePayment,
  deletePayment,
  getUserPaymentSummary,
} = require('../controllers/paymentController');
const { protect, adminOnly } = require('../middleware/auth');

router.use(protect);

// User and Admin can access getAllPayments (controller scopes automatically)
router.get('/', getAllPayments);
router.get('/user/:id/summary', getUserPaymentSummary);

// Admin only actions
router.post('/', adminOnly, recordPayment);
router.route('/:id').put(adminOnly, updatePayment).delete(adminOnly, deletePayment);

module.exports = router;
