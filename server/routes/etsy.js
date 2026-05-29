const express = require('express');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const db = require('../db');
const supabase = require('../supabase');
const { authenticate, requireAdmin } = require('../middleware/auth');
const etsyOAuth = require('../services/etsyOAuth');

const router = express.Router();

// 工具函数：从请求中获取当前部署的基础 URL
function getBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${proto}://${host}`;
}

// 测试 Etsy API 连接
router.get('/test-connection', authenticate, requireAdmin, async (req, res) => {
  try {
    const apiKey = process.env.ETSY_API_KEY;
    if (!apiKey) {
      return res.json({ connected: false, message: 'Etsy API 密钥未配置。请设置 ETSY_API_KEY' });
    }
    const axios = require('axios');
    const response = await axios.get('https://openapi.etsy.com/v3/application/openapi-ping', {
      headers: { 'x-api-key': apiKey }
    });
    res.json({ connected: true, data: response.data });
  } catch (err) {
    res.json({ connected: false, message: `连接失败: ${err.message}` });
  }
});

// 从 Etsy 同步订单（支持自动发送上传链接）
router.post('/sync-orders', authenticate, requireAdmin, async (req, res) => {
  try {
    const apiKey = process.env.ETSY_API_KEY;
    const shopId = process.env.ETSY_SHOP_ID;
    const autoSend = req.query.auto_send === 'true' || req.body?.auto_send === true;

    if (!apiKey || !shopId) {
      return res.json({
        success: true,
        message: '未配置 Etsy API，模拟同步完成',
        orders: [{
          order_number: 'SYNC-' + Date.now(),
          item_name: '从 Etsy 同步的样品订单',
          quantity: 1,
          total_amount: 29.99,
        }]
      });
    }

    const axios = require('axios');
    const response = await axios.get(
      `https://openapi.etsy.com/v3/application/shops/${shopId}/receipts`,
      { headers: { 'x-api-key': apiKey }, params: { limit: 25 } }
    );

    const receipts = response.data?.results || [];
    const syncedOrders = [];

    // 如果启用自动发送，检查 OAuth 是否可用
    if (autoSend) {
      const oauthStatus = await etsyOAuth.getStatus();
      if (!oauthStatus.connected) {
        return res.status(400).json({
          error: '自动发送需要先连接 Etsy OAuth',
          hint: '请先在系统设置 -> Etsy 中点击"连接 Etsy 账号"完成授权',
        });
      }
    }

    for (const receipt of receipts) {
      const orderNumber = `ETSY-${receipt.receipt_id}`;
      const existing = await db.queryOne('orders', { where: { order_number: orderNumber } });
      if (existing) continue;

      // 创建或查找客户
      let customerId = 'c-' + uuidv4().slice(0, 8);
      const buyerUserId = receipt.buyer?.user_id;
      if (buyerUserId) {
        const existingCustomer = await db.queryOne('customers', {
          where: { etsy_user_id: String(buyerUserId) }
        });
        if (existingCustomer) {
          customerId = existingCustomer.id;
        } else {
          await db.insert('customers', {
            id: customerId,
            etsy_user_id: String(buyerUserId),
            name: receipt.name || 'Etsy Customer',
            email: receipt.buyer?.email || '',
          });
        }
      }

      const transaction = receipt.transactions?.[0];
      const newOrderId = 'ord-' + uuidv4().slice(0, 8);
      const newOrder = await db.insert('orders', {
        id: newOrderId,
        etsy_order_id: String(receipt.receipt_id),
        customer_id: customerId,
        order_number: orderNumber,
        item_name: transaction?.title || 'Etsy 商品',
        quantity: transaction?.quantity || 1,
        total_amount: parseFloat(receipt.total_price?.amount || 0),
        currency: receipt.total_price?.currency_code || 'USD',
        shipping_address: [
          receipt.shipping_address?.address_line_1,
          receipt.shipping_address?.city,
          receipt.shipping_address?.state,
          receipt.shipping_address?.zip
        ].filter(Boolean).join(', '),
        status: 'pending',
        etsy_data: receipt,
      });

      const savedOrder = newOrder[0];

      // 自动发送上传链接（如果启用）
      if (autoSend && buyerUserId) {
        try {
          // 生成上传 token
          const token = crypto.randomBytes(24).toString('hex');
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
          await db.insert('upload_tokens', {
            id: 'tok-' + uuidv4().slice(0, 8),
            order_id: newOrderId,
            token,
            expires_at: expiresAt,
          });

          const baseUrl = process.env.UPLOAD_BASE_URL || getBaseUrl(req);
          const uploadUrl = `${baseUrl}/upload?token=${token}`;
          const customerName = receipt.name || '客户';
          const subject = `关于订单 ${orderNumber} 的定制图片上传`;
          const message = `您好 ${customerName}，

感谢您在 Etsy 订购我们的定制产品。

请通过以下链接上传您需要定制的图片（款式、图案、文字等）：
${uploadUrl}

链接有效期 7 天，请尽快上传。
如有任何问题，请通过 Etsy 消息回复我们。

谢谢！
${process.env.SHOP_NAME || '店铺团队'}`;

          await etsyOAuth.sendConversationMessage(shopId, buyerUserId, subject, message);
          console.log(`[自动发送] 订单 ${orderNumber}: 上传链接已发送给买家 ${buyerUserId}`);
        } catch (sendErr) {
          console.error(`[自动发送] 订单 ${orderNumber}: 发送失败`, sendErr.message);
        }
      }

      syncedOrders.push(savedOrder);
    }

    res.json({
      success: true,
      message: `同步完成，新增 ${syncedOrders.length} 个订单${autoSend ? '（已自动发送上传链接）' : ''}`,
      orders: syncedOrders,
    });
  } catch (err) {
    console.error('Sync orders error:', err);
    res.status(500).json({ error: `同步订单失败: ${err.message}` });
  }
});

module.exports = router;
