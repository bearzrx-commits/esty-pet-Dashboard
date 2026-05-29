const express = require('express');
const { v4: uuidv4 } = require('uuid');
const supabase = require('../supabase');
const db = require('../db');

const router = express.Router();

// 客户上传图片（无认证，使用 token 验证）
router.post('/upload', express.json({ limit: '20mb' }), async (req, res) => {
  try {
    const { token, images } = req.body;

    if (!token) return res.status(400).json({ error: '缺少上传令牌' });
    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: '请选择要上传的图片' });
    }

    // 验证 token
    const { data: tokenRecord } = await supabase
      .from('upload_tokens')
      .select('*')
      .eq('token', token)
      .single();

    if (!tokenRecord) return res.status(404).json({ error: '上传链接无效或已过期' });
    if (tokenRecord.used) return res.status(400).json({ error: '此上传链接已被使用' });
    if (new Date(tokenRecord.expires_at) < new Date()) {
      return res.status(400).json({ error: '上传链接已过期，请联系卖家' });
    }

    // 验证订单存在
    const { data: order } = await supabase
      .from('orders')
      .select('id, order_number, customers!orders_customer_id_fkey(name)')
      .eq('id', tokenRecord.order_id)
      .single();

    if (!order) return res.status(404).json({ error: '订单不存在' });

    // 保存图片
    const savedImages = [];
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const newImage = await db.insert('order_images', {
        id: 'img-' + uuidv4().slice(0, 8),
        order_id: tokenRecord.order_id,
        image_url: img.data, // Base64 data URI
        image_type: 'customer_upload',
        description: img.description || `客户上传图片 ${i + 1}`,
      });
      savedImages.push(newImage[0]);
    }

    // 标记 token 已使用
    await db.update('upload_tokens', tokenRecord.id, { used: true });

    // 记录活动日志
    await db.insert('activity_log', {
      id: 'act-' + uuidv4().slice(0, 8),
      order_id: tokenRecord.order_id,
      action: '客户上传图片',
      details: `客户上传了 ${images.length} 张定制图片`,
    });

    res.json({ success: true, message: `上传成功，共 ${savedImages.length} 张图片`, images: savedImages });
  } catch (err) {
    console.error('Customer upload error:', err);
    res.status(500).json({ error: '上传失败，请重试' });
  }
});

// 验证 token 并获取订单信息（客户上传页面加载时调用）
router.get('/info/:token', async (req, res) => {
  try {
    const { data: tokenRecord } = await supabase
      .from('upload_tokens')
      .select('*, orders!upload_tokens_order_id_fkey(order_number, customers!orders_customer_id_fkey(name))')
      .eq('token', req.params.token)
      .single();

    if (!tokenRecord) return res.status(404).json({ error: '上传链接无效' });
    if (tokenRecord.used) return res.json({ used: true, message: '此链接已被使用' });
    if (new Date(tokenRecord.expires_at) < new Date()) {
      return res.json({ expired: true, message: '上传链接已过期' });
    }

    res.json({
      valid: true,
      order_number: tokenRecord.orders?.order_number,
      customer_name: tokenRecord.orders?.customers?.name,
      created_at: tokenRecord.created_at,
      expires_at: tokenRecord.expires_at,
    });
  } catch (err) {
    console.error('Verify token error:', err);
    res.status(404).json({ error: '上传链接无效' });
  }
});

module.exports = router;
