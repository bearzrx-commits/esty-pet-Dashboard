/**
 * 物流轨迹查询路由
 */
const express = require('express');
const supabase = require('../supabase');
const db = require('../db');
const { v4: uuidv4 } = require('uuid');
const { authenticate } = require('../middleware/auth');
const { queryTracking } = require('../services/trackingService');

const router = express.Router();

// 快递100 状态 → 系统内部物流状态映射
const STATE_TO_INTERNAL = {
  '0': 'in_transit',
  '1': 'picked_up',
  '2': 'exception',
  '3': 'delivered',
  '4': 'exception',
  '5': 'in_transit',
  '6': 'exception',
  '201': 'in_transit',
};

/**
 * 查询单个物流记录的轨迹
 * GET /api/tracking/:logisticsId
 */
router.get('/:logisticsId', authenticate, async (req, res) => {
  try {
    const { data: logistics } = await supabase
      .from('logistics')
      .select('*')
      .eq('id', req.params.logisticsId)
      .single();

    if (!logistics) {
      return res.status(404).json({ error: '物流记录不存在' });
    }

    const result = await queryTracking(logistics.carrier, logistics.tracking_number);
    res.json(result);
  } catch (err) {
    console.error('Query tracking error:', err);
    res.status(500).json({ error: '查询物流轨迹失败' });
  }
});

/**
 * 查询并自动更新物流状态
 * POST /api/tracking/sync/:logisticsId
 */
router.post('/sync/:logisticsId', authenticate, async (req, res) => {
  try {
    const { data: logistics } = await supabase
      .from('logistics')
      .select('*')
      .eq('id', req.params.logisticsId)
      .single();

    if (!logistics) {
      return res.status(404).json({ error: '物流记录不存在' });
    }

    if (!logistics.tracking_number) {
      return res.status(400).json({ error: '该物流记录暂无运单号，无法同步' });
    }

    const result = await queryTracking(logistics.carrier, logistics.tracking_number);
    if (!result.success) {
      return res.json({ success: false, message: result.message });
    }

    // 如果 API 返回的状态与当前不同，自动更新
    const newStatus = STATE_TO_INTERNAL[String(result.state)] || logistics.status;
    if (newStatus !== logistics.status) {
      const updateData = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      };
      if (newStatus === 'delivered') {
        updateData.actual_delivery = new Date().toISOString();
      }
      await db.update('logistics', req.params.logisticsId, updateData);

      // 记录活动日志
      await db.insert('activity_log', {
        id: 'act-' + uuidv4().slice(0, 8),
        order_id: logistics.order_id,
        user_id: req.user.id,
        action: '物流状态自动同步',
        details: `物流状态自动更新为 ${({ pending: '待发货', picked_up: '已揽收', in_transit: '运输中', delivered: '已签收', exception: '异常' })[newStatus] || newStatus}（快递100）`,
      });

      // 签收时更新订单状态为已发货
      if (newStatus === 'delivered') {
        await db.update('orders', logistics.order_id, { status: 'shipped', updated_at: new Date().toISOString() });
      }
    }

    res.json({
      success: true,
      previousStatus: logistics.status,
      currentStatus: newStatus,
      updated: newStatus !== logistics.status,
      tracks: result.tracks,
    });
  } catch (err) {
    console.error('Sync tracking error:', err);
    res.status(500).json({ error: '同步物流状态失败' });
  }
});

module.exports = router;
