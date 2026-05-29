require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const supabase = require('./supabase');

const JWT_SECRET = process.env.JWT_SECRET || 'etsy-admin-secret-key-2026';

const db = require('./db');
const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// API 路由
app.use('/api/auth', require('./routes/auth'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/logistics', require('./routes/logistics'));
app.use('/api/tracking', require('./routes/tracking'));
app.use('/api/etsy', require('./routes/etsy'));
app.use('/api/etsy-oauth', require('./routes/etsy-oauth'));
app.use('/api/uploads', require('./routes/uploads'));
app.use('/api/customer-upload', require('./routes/customer-upload'));

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 仪表盘统计
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: '未授权' });
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    let isSupplier = false;
    const userQuery = await supabase.from('users').select('*').eq('id', decoded.id).eq('active', 1).single();
    if (!userQuery.data) return res.status(401).json({ error: '用户不存在' });
    const user = userQuery.data;
    if (user.role === 'supplier') isSupplier = true;

    // 统计
    let totalQ = supabase.from('orders').select('*', { count: 'exact', head: true });
    let pendingQ = supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'pending');
    let prodQ = supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'in_production');
    let compQ = supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'completed');

    if (isSupplier) {
      totalQ = totalQ.eq('supplier_id', user.id);
      pendingQ = pendingQ.eq('supplier_id', user.id);
      prodQ = prodQ.eq('supplier_id', user.id);
      compQ = compQ.eq('supplier_id', user.id);
    }

    const [totalOrders, pendingOrders, inProduction, completedOrders] = await Promise.all([
      totalQ, pendingQ, prodQ, compQ
    ]);

    // 供应商统计（仅管理员）
    let supplierStats = [];
    if (user.role === 'admin') {
      const { data: suppliers } = await supabase
        .from('users')
        .select('id, name')
        .eq('role', 'supplier')
        .eq('active', 1);

      if (suppliers) {
        for (const s of suppliers) {
          const { count: total } = await supabase
            .from('supplier_orders').select('*', { count: 'exact', head: true }).eq('supplier_id', s.id);
          const { count: completed } = await supabase
            .from('supplier_orders').select('*', { count: 'exact', head: true }).eq('supplier_id', s.id).eq('status', 'completed');
          supplierStats.push({ id: s.id, name: s.name, total_tasks: total || 0, completed_tasks: completed || 0 });
        }
      }
    }

    // 最近订单
    let recentQuery = supabase
      .from('orders')
      .select('id, order_number, status, item_name, total_amount, currency, created_at, users!orders_supplier_id_fkey(name)');
    if (isSupplier) recentQuery = recentQuery.eq('supplier_id', user.id);
    const { data: recentOrders } = await recentQuery.order('created_at', { ascending: false }).limit(10);

    // 计算总收入（已完成订单）
    let revenueQ = supabase.from('orders').select('total_amount').eq('status', 'completed');
    if (isSupplier) revenueQ = revenueQ.eq('supplier_id', user.id);
    const { data: completedRevenueData } = await revenueQ;
    const totalRevenue = (completedRevenueData || []).reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0);

    // 物流状态分布
    let shippingQ = supabase.from('logistics').select('status');
    if (isSupplier) {
      const { data: supplierOrderIds } = await supabase.from('supplier_orders').select('order_id').eq('supplier_id', user.id);
      const orderIds = (supplierOrderIds || []).map(s => s.order_id);
      if (orderIds.length > 0) shippingQ = shippingQ.in('order_id', orderIds);
      else shippingQ = null;
    }
    let shippingStatsData = [];
    if (shippingQ) {
      const { data: ssd } = await shippingQ;
      shippingStatsData = ssd || [];
    }
    const statusLabelMap = { pending: '待发货', picked_up: '已揽收', in_transit: '运输中', delivered: '已签收', exception: '异常' };
    const shippingStats = Object.entries(
      (shippingStatsData || []).reduce((acc, item) => {
        const label = statusLabelMap[item.status] || item.status;
        acc[label] = (acc[label] || 0) + 1;
        return acc;
      }, {})
    ).map(([status, cnt]) => ({ status, cnt }));

    res.json({
      stats: {
        totalOrders: totalOrders.count || 0,
        pendingOrders: pendingOrders.count || 0,
        inProduction: inProduction.count || 0,
        completedOrders: completedOrders.count || 0,
        totalRevenue,
      },
      supplierStats,
      shippingStats,
      recentOrders: (recentOrders || []).map(o => ({
        ...o,
        statusLabel: ({ pending: '待处理', confirmed: '已确认', in_production: '生产中', completed: '已完成', shipped: '已发货', cancelled: '已取消' })[o.status] || o.status,
        supplier_name: o.users?.name || ''
      })),
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// Vercel Serverless 导出
module.exports = app;

// 自动同步物流状态（每2小时执行一次）
async function autoSyncLogistics() {
  try {
    console.log('[自动同步] 开始检查运输中的物流...');
    const { data: inTransit } = await supabase
      .from('logistics')
      .select('*')
      .in('status', ['picked_up', 'in_transit'])
      .not('tracking_number', 'is', null)
      .not('tracking_number', 'eq', '');

    if (!inTransit || inTransit.length === 0) {
      console.log('[自动同步] 无运输中的物流记录');
      return;
    }

    const { queryTracking } = require('./services/trackingService');
    const STATE_MAP = { '0': 'in_transit', '1': 'picked_up', '3': 'delivered', '2': 'exception', '4': 'exception', '5': 'in_transit', '6': 'exception', '201': 'in_transit' };

    for (const item of inTransit) {
      try {
        const result = await queryTracking(item.carrier, item.tracking_number);
        if (!result.success) continue;
        const newStatus = STATE_MAP[String(result.state)] || item.status;
        if (newStatus !== item.status) {
          const updateData = { status: newStatus, updated_at: new Date().toISOString() };
          if (newStatus === 'delivered') updateData.actual_delivery = new Date().toISOString();
          await db.update('logistics', item.id, updateData);
          if (newStatus === 'delivered') {
            await db.update('orders', item.order_id, { status: 'shipped', updated_at: new Date().toISOString() });
          }
          console.log(`[自动同步] ${item.id}: ${item.status} → ${newStatus}`);
        }
      } catch (e) {
        console.error(`[自动同步] ${item.id} 同步失败:`, e.message);
      }
    }
  } catch (err) {
    console.error('[自动同步] 执行失败:', err.message);
  }
}

// 本地开发模式
if (!process.env.VERCEL) {
  // 启动定时同步（每2小时）
  try {
    const cron = require('node-cron');
    cron.schedule('0 */2 * * *', () => {
      autoSyncLogistics();
    });
    console.log('[自动同步] 定时任务已启动（每2小时）');
    // 启动时执行一次
    autoSyncLogistics();
  } catch (e) {
    console.log('[自动同步] node-cron 未安装，跳过定时任务。运行 npm install node-cron 安装');
  }

  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Etsy 后台管理系统已启动`);
    console.log(`API: http://localhost:${PORT}/api`);
  });
}
