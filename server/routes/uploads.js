const express = require('express');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const supabase = require('../supabase');
const db = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// ========== 管理员接口 ==========

// 生成客户图片上传链接
router.post('/token/:orderId', authenticate, requireAdmin, async (req, res) => {
  try {
    const order = await db.queryOne('orders', { where: { id: req.params.orderId } });
    if (!order) return res.status(404).json({ error: '订单不存在' });

    // 检查是否已有可用 token
    const existing = await supabase
      .from('upload_tokens')
      .select('*')
      .eq('order_id', req.params.orderId)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (existing.data) {
      return res.json({ token: existing.data.token, url: `/upload?token=${existing.data.token}` });
    }

    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7天有效

    await db.insert('upload_tokens', {
      id: 'tok-' + uuidv4().slice(0, 8),
      order_id: req.params.orderId,
      token,
      expires_at: expiresAt,
    });

    const baseUrl = process.env.UPLOAD_BASE_URL || `${req.protocol}://${req.get('host')}`;
    res.json({ token, url: `${baseUrl}/upload?token=${token}`, expires_at: expiresAt });
  } catch (err) {
    console.error('Generate upload token error:', err);
    res.status(500).json({ error: '生成上传链接失败' });
  }
});

// 获取订单的上传列表（包含 token 状态）
router.get('/order/:orderId', authenticate, async (req, res) => {
  try {
    const { data: images } = await supabase
      .from('order_images')
      .select('*')
      .eq('order_id', req.params.orderId)
      .eq('image_type', 'customer_upload')
      .order('created_at', { ascending: false });

    const { data: tokens } = await supabase
      .from('upload_tokens')
      .select('*')
      .eq('order_id', req.params.orderId)
      .order('created_at', { ascending: false });

    res.json({ images: images || [], tokens: tokens || [] });
  } catch (err) {
    console.error('Get order uploads error:', err);
    res.status(500).json({ error: '获取上传记录失败' });
  }
});

// 更新图片备注
router.put('/images/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { description } = req.body;
    const updated = await db.update('order_images', req.params.id, { description: description || '' });
    res.json(updated[0]);
  } catch (err) {
    res.status(500).json({ error: '更新失败' });
  }
});

module.exports = router;
