const express = require('express');
const router = express.Router();
const {
  createUser,
  getAllUsers,
  getUserById,
  updateUser,
  resetUserPassword,
  deleteUser,
} = require('../controllers/userController');
const { protect, adminOnly } = require('../middleware/auth');

router.use(protect);
router.use(adminOnly);

router.route('/').post(createUser).get(getAllUsers);
router.route('/:id').get(getUserById).put(updateUser).delete(deleteUser);
router.put('/:id/reset-password', resetUserPassword);

module.exports = router;
