const express = require('express');
const { v4: uuidv4 } = require('uuid');
const supabase = require('../supabase');
const db = require('../db');
const { authenticate, requireSupplier } = require('../middleware/auth');

const router = express.Router();

// 获取供应商任务列表
router.get('/tasks', authenticate, requireSupplier, async (req, res) => {
  try {
    const supplierId = req.user.id;
    const { status } = req.query;

    let query = supabase
      .from('supplier_orders')
      .select('*, orders!supplier_orders_order_id_fkey(*, customers!orders_customer_id_fkey(name))')
      .eq('supplier_id', supplierId);

    if (status) query = query.eq('status', status);

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('Get tasks error:', err);
    res.status(500).json({ error: '获取任务列表失败' });
  }
});

// 接单
router.put('/tasks/:id/accept', authenticate, requireSupplier, async (req, res) => {
  try {
    const taskId = req.params.id;
    const supplierId = req.user.id;

    const { data: task, error: findError } = await supabase
      .from('supplier_orders')
      .select('*')
      .eq('id', taskId)
      .eq('supplier_id', supplierId)
      .single();

    if (findError || !task) return res.status(404).json({ error: '任务不存在' });

    await db.insert('activity_log', {
      id: 'act-' + uuidv4().slice(0, 8),
      order_id: task.order_id,
      user_id: supplierId,
      action: '供应商接单',
      details: `供应商 ${req.user.name} 已接单`,
    });

    await db.update('supplier_orders', taskId, { status: 'accepted', updated_at: new Date().toISOString() });
    await db.update('orders', task.order_id, { status: 'confirmed', updated_at: new Date().toISOString() });

    res.json({ success: true, message: '已接单' });
  } catch (err) {
    console.error('Accept task error:', err);
    res.status(500).json({ error: '接单失败' });
  }
});

// 开始生产
router.put('/tasks/:id/start-production', authenticate, requireSupplier, async (req, res) => {
  try {
    const taskId = req.params.id;
    const supplierId = req.user.id;

    const { data: task, error: findError } = await supabase
      .from('supplier_orders')
      .select('*')
      .eq('id', taskId)
      .eq('supplier_id', supplierId)
      .single();

    if (findError || !task) return res.status(404).json({ error: '任务不存在' });

    await db.insert('activity_log', {
      id: 'act-' + uuidv4().slice(0, 8),
      order_id: task.order_id,
      user_id: supplierId,
      action: '开始生产',
      details: `供应商 ${req.user.name} 开始生产`,
    });

    await db.update('supplier_orders', taskId, { status: 'in_production', updated_at: new Date().toISOString() });
    await db.update('orders', task.order_id, { status: 'in_production', updated_at: new Date().toISOString() });

    res.json({ success: true, message: '已开始生产' });
  } catch (err) {
    console.error('Start production error:', err);
    res.status(500).json({ error: '操作失败' });
  }
});

// 完成生产
router.put('/tasks/:id/complete', authenticate, requireSupplier, async (req, res) => {
  try {
    const taskId = req.params.id;
    const supplierId = req.user.id;
    const notes = req.body.notes || req.body.supplier_notes || '';

    const { data: task, error: findError } = await supabase
      .from('supplier_orders')
      .select('*')
      .eq('id', taskId)
      .eq('supplier_id', supplierId)
      .single();

    if (findError || !task) return res.status(404).json({ error: '任务不存在' });

    const now = new Date().toISOString();

    await db.insert('activity_log', {
      id: 'act-' + uuidv4().slice(0, 8),
      order_id: task.order_id,
      user_id: supplierId,
      action: '完成生产',
      details: `供应商 ${req.user.name} 已完成生产${notes ? '：' + notes : ''}`,
    });

    await db.update('supplier_orders', taskId, {
      status: 'completed',
      notes: notes || '',
      completed_at: now,
      updated_at: now,
    });
    await db.update('orders', task.order_id, { status: 'completed', updated_at: now });

    res.json({ success: true, message: '已标记为完成' });
  } catch (err) {
    console.error('Complete task error:', err);
    res.status(500).json({ error: '操作失败' });
  }
});

// 拒绝接单
router.put('/tasks/:id/reject', authenticate, requireSupplier, async (req, res) => {
  try {
    const taskId = req.params.id;
    const supplierId = req.user.id;
    const notes = req.body.notes || req.body.reason || '';

    const { data: task, error: findError } = await supabase
      .from('supplier_orders')
      .select('*')
      .eq('id', taskId)
      .eq('supplier_id', supplierId)
      .single();

    if (findError || !task) return res.status(404).json({ error: '任务不存在' });

    const now = new Date().toISOString();

    await db.insert('activity_log', {
      id: 'act-' + uuidv4().slice(0, 8),
      order_id: task.order_id,
      user_id: supplierId,
      action: '拒绝接单',
      details: `供应商 ${req.user.name} 拒绝接单${notes ? '：' + notes : ''}`,
    });

    await db.update('supplier_orders', taskId, {
      status: 'rejected',
      notes: notes || '',
      updated_at: now,
    });
    // 退回订单到待处理状态，清除供应商
    await db.update('orders', task.order_id, { status: 'pending', supplier_id: null, updated_at: now });

    res.json({ success: true, message: '已拒绝接单' });
  } catch (err) {
    console.error('Reject task error:', err);
    res.status(500).json({ error: '操作失败' });
  }
});

module.exports = router;
