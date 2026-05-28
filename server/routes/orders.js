const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const supabase = require('../supabase');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

const ORDER_STATUS_LABELS = {
  pending: '待处理',
  confirmed: '已确认',
  in_production: '生产中',
  completed: '已完成',
  shipped: '已发货',
  cancelled: '已取消',
};

// 获取订单列表
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, supplier_id, search, page = 1, pageSize = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    let query = supabase
      .from('orders')
      .select('*, customers!orders_customer_id_fkey(name, email), users!orders_supplier_id_fkey(name)', { count: 'exact' });

    if (status) query = query.eq('status', status);
    if (supplier_id) query = query.eq('supplier_id', supplier_id);
    if (search) {
      query = query.or(`order_number.ilike.%${search}%,item_name.ilike.%${search}%`);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(pageSize) - 1);

    if (error) throw error;

    res.json({
      orders: data || [],
      total: count || 0,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
    });
  } catch (err) {
    console.error('Get orders error:', err);
    res.status(500).json({ error: '获取订单列表失败' });
  }
});

// 获取订单详情
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { data: order, error } = await supabase
      .from('orders')
      .select('*, customers!orders_customer_id_fkey(*), users!orders_supplier_id_fkey(*)')
      .eq('id', req.params.id)
      .single();

    if (error || !order) {
      return res.status(404).json({ error: '订单不存在' });
    }

    // 获取图片
    const { data: images } = await supabase
      .from('order_images')
      .select('*')
      .eq('order_id', req.params.id);

    // 获取供应商记录
    const { data: supplierOrders } = await supabase
      .from('supplier_orders')
      .select('*, users!supplier_orders_supplier_id_fkey(name, company)')
      .eq('order_id', req.params.id)
      .order('created_at', { ascending: true });

    // 获取物流
    const { data: logistics } = await supabase
      .from('logistics')
      .select('*')
      .eq('order_id', req.params.id)
      .order('created_at', { ascending: false });

    // 获取活动日志
    const { data: activities } = await supabase
      .from('activity_log')
      .select('*, users!activity_log_user_id_fkey(name)')
      .eq('order_id', req.params.id)
      .order('created_at', { ascending: false });

    res.json({ ...order, images, supplierOrders, logistics, activities, statusLabel: ORDER_STATUS_LABELS[order.status] });
  } catch (err) {
    console.error('Get order detail error:', err);
    res.status(500).json({ error: '获取订单详情失败' });
  }
});

// 确认订单并分配供应商
router.put('/:id/confirm', authenticate, requireAdmin, async (req, res) => {
  try {
    const { supplier_id } = req.body;
    if (!supplier_id) return res.status(400).json({ error: '请选择供应商' });

    const order = await db.queryOne('orders', { where: { id: req.params.id } });
    if (!order) return res.status(404).json({ error: '订单不存在' });

    await db.update('orders', req.params.id, {
      status: 'confirmed',
      supplier_id,
      updated_at: new Date().toISOString(),
    });

    await db.insert('supplier_orders', {
      id: 'so-' + uuidv4().slice(0, 8),
      order_id: req.params.id,
      supplier_id,
      status: 'assigned',
    });

    await db.insert('activity_log', {
      id: 'act-' + uuidv4().slice(0, 8),
      order_id: req.params.id,
      user_id: req.user.id,
      action: '订单确认并分配',
      details: `分配给供应商 ${supplier_id}`,
    });

    res.json({ success: true, message: '订单已确认并分配' });
  } catch (err) {
    console.error('Confirm order error:', err);
    res.status(500).json({ error: '确认订单失败' });
  }
});

// 重新分配供应商
router.put('/:id/reassign', authenticate, requireAdmin, async (req, res) => {
  try {
    const { supplier_id } = req.body;
    if (!supplier_id) return res.status(400).json({ error: '请选择供应商' });

    await db.update('orders', req.params.id, {
      supplier_id,
      status: 'confirmed',
      updated_at: new Date().toISOString(),
    });

    await db.insert('supplier_orders', {
      id: 'so-' + uuidv4().slice(0, 8),
      order_id: req.params.id,
      supplier_id,
      status: 'assigned',
    });

    await db.insert('activity_log', {
      id: 'act-' + uuidv4().slice(0, 8),
      order_id: req.params.id,
      user_id: req.user.id,
      action: '重新分配供应商',
      details: `重新分配给供应商 ${supplier_id}`,
    });

    res.json({ success: true, message: '供应商已重新分配' });
  } catch (err) {
    console.error('Reassign order error:', err);
    res.status(500).json({ error: '重新分配失败' });
  }
});

// 创建订单
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { order_number, customer_id, item_name, quantity, total_amount, notes } = req.body;
    if (!order_number || !customer_id || !item_name) {
      return res.status(400).json({ error: '请填写必要信息' });
    }

    const newOrder = await db.insert('orders', {
      id: 'ord-' + uuidv4().slice(0, 8),
      order_number,
      customer_id,
      item_name,
      quantity: quantity || 1,
      total_amount: total_amount || 0,
      notes: notes || '',
      status: 'pending',
    });

    res.json(newOrder[0]);
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ error: '创建订单失败' });
  }
});

module.exports = router;
