const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const supabase = require('../supabase');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// 物流状态标签
const LOGISTICS_STATUS_LABELS = {
  pending: '待发货',
  picked_up: '已揽收',
  in_transit: '运输中',
  delivered: '已签收',
  failed: '配送失败',
};

// 获取物流列表
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, page = 1, pageSize = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    let query = supabase
      .from('logistics')
      .select('*, orders!logistics_order_id_fkey(order_number, item_name)', { count: 'exact' });

    if (status) query = query.eq('status', status);

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(pageSize) - 1);

    if (error) throw error;

    res.json({
      list: data || [],
      total: count || 0,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
    });
  } catch (err) {
    console.error('Get logistics error:', err);
    res.status(500).json({ error: '获取物流列表失败' });
  }
});

// 创建物流记录
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { order_id, tracking_number, carrier, shipping_method, notes } = req.body;
    if (!order_id) return res.status(400).json({ error: '请选择订单' });

    const newLogistics = await db.insert('logistics', {
      id: 'log-' + uuidv4().slice(0, 8),
      order_id,
      tracking_number: tracking_number || '',
      carrier: carrier || '',
      shipping_method: shipping_method || '',
      notes: notes || '',
      status: 'pending',
    });

    await db.insert('activity_log', {
      id: 'act-' + uuidv4().slice(0, 8),
      order_id,
      user_id: req.user.id,
      action: '创建物流',
      details: `创建物流记录，承运商：${carrier}，运单号：${tracking_number}`,
    });

    // 更新订单状态为已发货
    await db.update('orders', order_id, { status: 'shipped', updated_at: new Date().toISOString() });

    res.json(newLogistics[0]);
  } catch (err) {
    console.error('Create logistics error:', err);
    res.status(500).json({ error: '创建物流记录失败' });
  }
});

// 更新物流状态
router.put('/:id/status', authenticate, async (req, res) => {
  try {
    const { status, tracking_number, carrier, notes } = req.body;
    const updateData = { updated_at: new Date().toISOString() };

    if (status) updateData.status = status;
    if (tracking_number !== undefined) updateData.tracking_number = tracking_number;
    if (carrier !== undefined) updateData.carrier = carrier;
    if (notes !== undefined) updateData.notes = notes;
    if (status === 'delivered') updateData.actual_delivery = new Date().toISOString();

    await db.update('logistics', req.params.id, updateData);

    if (status) {
      const { data: logItem } = await supabase.from('logistics').select('*').eq('id', req.params.id).single();
      if (logItem) {
        await db.insert('activity_log', {
          id: 'act-' + uuidv4().slice(0, 8),
          order_id: logItem.order_id,
          user_id: req.user.id,
          action: '物流状态更新',
          details: `物流状态变更为 ${LOGISTICS_STATUS_LABELS[status] || status}`,
        });

        if (status === 'delivered') {
          await db.update('orders', logItem.order_id, { status: 'shipped', updated_at: new Date().toISOString() });
        }
      }
    }

    res.json({ success: true, message: '物流状态已更新' });
  } catch (err) {
    console.error('Update logistics error:', err);
    res.status(500).json({ error: '更新物流状态失败' });
  }
});

// 按订单查询物流
router.get('/order/:orderId', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('logistics')
      .select('*')
      .eq('order_id', req.params.orderId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: '查询物流信息失败' });
  }
});

module.exports = router;
