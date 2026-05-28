import React, { useEffect, useState } from 'react';
import { Row, Col, Card, Statistic, Table, Tag, Spin, Typography, Progress, Space } from 'antd';
import {
  ShoppingCartOutlined, CheckCircleOutlined, InboxOutlined, DollarOutlined,
  RiseOutlined, CarOutlined, TeamOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { dashboardApi } from '../api';
import { useAuth } from '../context/AuthContext';

const { Title } = Typography;

const statusColors: Record<string, string> = {
  pending: 'orange', confirmed: 'blue', in_production: 'processing',
  completed: 'green', cancelled: 'default'
};
const statusLabels: Record<string, string> = {
  pending: '待处理', confirmed: '已确认', in_production: '生产中',
  completed: '已完成', cancelled: '已取消'
};

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  useEffect(() => {
    dashboardApi.getStats()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  if (!data) return <div>加载失败</div>;

  const { stats, supplierStats, shippingStats, recentOrders } = data;

  const orderColumns = [
    { title: '订单号', dataIndex: 'etsy_order_id', key: 'etsy_order_id', render: (v: string) => v || '-' },
    { title: '客户', dataIndex: 'customer_name', key: 'customer_name' },
    { title: '状态', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color={statusColors[s]}>{statusLabels[s] || s}</Tag> },
    { title: '金额', key: 'amount', render: (_: any, r: any) => `$${r.total_amount?.toFixed(2)} ${r.currency || ''}` },
    { title: '供应商', dataIndex: 'supplier_name', key: 'supplier_name', render: (v: string) => v || '-' },
    { title: '时间', dataIndex: 'ordered_at', key: 'ordered_at', render: (v: string) => v ? new Date(v).toLocaleDateString() : '-' },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 24 }}>仪表盘</Title>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate('/orders')}>
            <Statistic title="总订单" value={stats.totalOrders} prefix={<ShoppingCartOutlined />} suffix="单" />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate('/orders?status=pending')}>
            <Statistic title="待处理" value={stats.pendingOrders} valueStyle={{ color: '#faad14' }} prefix={<InboxOutlined />} suffix="单" />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate('/orders?status=in_production')}>
            <Statistic title="生产中" value={stats.inProduction} valueStyle={{ color: '#1677ff' }} prefix={<RiseOutlined />} suffix="单" />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="已完成收入" value={stats.totalRevenue?.toFixed(2) || 0} prefix={<DollarOutlined />} suffix="HKD" />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        {/* 供应商状态（管理员可见） */}
        {isAdmin && supplierStats?.length > 0 && (
          <Col xs={24} lg={12}>
            <Card title={<Space><TeamOutlined />供应商生产统计</Space>} size="small">
              {supplierStats.map((s: any) => (
                <div key={s.id} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span>{s.name}</span>
                    <span>{s.completed_tasks}/{s.total_tasks} 已完成</span>
                  </div>
                  <Progress
                    percent={s.total_tasks > 0 ? Math.round((s.completed_tasks / s.total_tasks) * 100) : 0}
                    size="small"
                    format={() => `${s.completed_tasks}/${s.total_tasks}`}
                  />
                </div>
              ))}
            </Card>
          </Col>
        )}

        {/* 物流统计 */}
        {isAdmin && shippingStats?.length > 0 && (
          <Col xs={24} lg={12}>
            <Card title={<Space><CarOutlined />物流状态分布</Space>} size="small">
              <Row gutter={16}>
                {shippingStats.map((s: any) => (
                  <Col span={8} key={s.status} style={{ marginBottom: 8 }}>
                    <Statistic title={s.status} value={s.cnt} suffix="单" valueStyle={{ fontSize: 20 }} />
                  </Col>
                ))}
              </Row>
            </Card>
          </Col>
        )}
      </Row>

      {/* 最近订单 */}
      <Card title="最近订单" style={{ marginTop: 16 }} size="small">
        <Table
          dataSource={recentOrders}
          columns={orderColumns}
          rowKey="id"
          pagination={false}
          size="small"
          onRow={(record) => ({ onClick: () => navigate(`/orders/${record.id}`), style: { cursor: 'pointer' } })}
        />
      </Card>
    </div>
  );
}
