/**
 * 数据库兼容层 - 使用 Supabase 替代 SQLite
 * 保持与原有代码相同的 API 接口
 */
const supabase = require('./supabase');

/** 查询多条记录 */
async function queryAll(table, options = {}) {
  let query = supabase.from(table).select(options.select || '*');

  if (options.where) {
    for (const [col, val] of Object.entries(options.where)) {
      if (val === null) query = query.is(col, null);
      else query = query.eq(col, val);
    }
  }
  if (options.orderBy) {
    query = query.order(options.orderBy.col, { ascending: options.orderBy.asc !== false });
  }
  if (options.limit) query = query.limit(options.limit);
  if (options.offset) query = query.range(options.offset, options.offset + (options.limit || 100) - 1);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/** 查询单条记录 */
async function queryOne(table, options = {}) {
  const records = await queryAll(table, { ...options, limit: 1 });
  return records[0] || null;
}

/** 插入记录 */
async function insert(table, record) {
  const { data, error } = await supabase.from(table).insert(record).select();
  if (error) throw error;
  return data;
}

/** 更新记录 */
async function update(table, id, record, idField = 'id') {
  const { data, error } = await supabase.from(table).update(record).eq(idField, id).select();
  if (error) throw error;
  return data;
}

/** 删除记录 */
async function remove(table, id, idField = 'id') {
  const { data, error } = await supabase.from(table).delete().eq(idField, id).select();
  if (error) throw error;
  return data;
}

/** 执行原始 SQL（用于复杂查询） */
async function rawQuery(sql, params = []) {
  // Supabase 不支持原始 SQL（需要 rpc），这里用查询构建器
  // 如果复杂查询太多建议创建 PostgreSQL 视图或函数
  const { data, error } = await supabase.rpc('exec_sql', { query: sql, params });
  if (error) throw error;
  return data;
}

/** 获取供应商仪表盘统计 */
async function getSupplierStats(supplierId) {
  const { count: total } = await supabase.from('supplier_orders').select('*', { count: 'exact', head: true }).eq('supplier_id', supplierId);
  const { count: accepted } = await supabase.from('supplier_orders').select('*', { count: 'exact', head: true }).eq('supplier_id', supplierId).eq('status', 'accepted');
  const { count: inProduction } = await supabase.from('supplier_orders').select('*', { count: 'exact', head: true }).eq('supplier_id', supplierId).eq('status', 'in_production');
  const { count: completed } = await supabase.from('supplier_orders').select('*', { count: 'exact', head: true }).eq('supplier_id', supplierId).eq('status', 'completed');
  return { total: total || 0, accepted: accepted || 0, inProduction: inProduction || 0, completed: completed || 0 };
}

/** 获取仪表盘统计 */
async function getDashboardStats() {
  const { count: totalOrders } = await supabase.from('orders').select('*', { count: 'exact', head: true });
  const { count: pendingOrders } = await supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'pending');
  const { count: completedOrders } = await supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'completed');
  const { count: totalSuppliers } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'supplier').eq('active', 1);
  return { totalOrders, pendingOrders, completedOrders, totalSuppliers };
}

/** 获取最近活动 */
async function getRecentActivities(limit = 10) {
  const { data, error } = await supabase
    .from('activity_log')
    .select('*, users!activity_log_user_id_fkey(name)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

module.exports = {
  queryAll,
  queryOne,
  insert,
  update,
  remove,
  rawQuery,
  getSupplierStats,
  getDashboardStats,
  getRecentActivities,
};
