const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

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

// 从 Etsy 同步订单
router.post('/sync-orders', authenticate, requireAdmin, async (req, res) => {
  try {
    const apiKey = process.env.ETSY_API_KEY;
    const shopId = process.env.ETSY_SHOP_ID;

    if (!apiKey || !shopId) {
      // 无配置时返回示例
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

    for (const receipt of receipts) {
      const orderNumber = `ETSY-${receipt.receipt_id}`;
      const existing = await db.queryOne('orders', { where: { order_number: orderNumber } });
      if (existing) continue;

      // 创建或查找客户
      let customerId = 'c-' + uuidv4().slice(0, 8);
      if (receipt.buyer?.user_id) {
        const existingCustomer = await db.queryOne('customers', {
          where: { etsy_user_id: String(receipt.buyer.user_id) }
        });
        if (existingCustomer) {
          customerId = existingCustomer.id;
        } else {
          await db.insert('customers', {
            id: customerId,
            etsy_user_id: String(receipt.buyer.user_id),
            name: receipt.name || 'Etsy Customer',
            email: receipt.buyer?.email || '',
          });
        }
      }

      const transaction = receipt.transactions?.[0];
      const newOrder = await db.insert('orders', {
        id: 'ord-' + uuidv4().slice(0, 8),
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

      syncedOrders.push(newOrder[0]);
    }

    res.json({ success: true, message: `同步完成，新增 ${syncedOrders.length} 个订单`, orders: syncedOrders });
  } catch (err) {
    console.error('Sync orders error:', err);
    res.status(500).json({ error: `同步订单失败: ${err.message}` });
  }
});

module.exports = router;
