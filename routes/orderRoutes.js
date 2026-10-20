const express = require('express');
const router = express.Router();
const {
  createOrder,
  getAllOrders,
  getOrderById,
  updateOrder,
  deleteOrder,
  requestCompletion,
  verifyCompletion,
} = require('../controllers/orderController');
const { protect, adminOnly } = require('../middleware/auth');

router.use(protect);

router.route('/').post(createOrder).get(getAllOrders);
router.route('/:id').get(getOrderById).put(updateOrder).delete(deleteOrder);

// Dedicated completion workflow endpoints
router.put('/:id/request-completion', requestCompletion);
router.put('/:id/verify-completion', adminOnly, verifyCompletion);

module.exports = router;
