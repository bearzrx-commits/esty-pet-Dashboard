import React, { useEffect, useState } from 'react';
import { Table, Tag, Button, Space, Select, Input, Card, Modal, message, Typography, Image, Badge, Descriptions, Divider, Empty } from 'antd';
import { SearchOutlined, ReloadOutlined, CheckCircleOutlined, EyeOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { orderApi, authApi } from '../api';
import { useAuth } from '../context/AuthContext';

const { Title, Text } = Typography;

const statusColors: Record<string, string> = { pending: 'orange', confirmed: 'blue', in_production: 'processing', completed: 'green', cancelled: 'default' };
const statusLabels: Record<string, string> = { pending: '待处理', confirmed: '已确认', in_production: '生产中', completed: '已完成', cancelled: '已取消' };

export default function Orders() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pageSize: 20 });
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [searchText, setSearchText] = useState('');
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [confirmModal, setConfirmModal] = useState<any>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<string>('');
  const [adminNotes, setAdminNotes] = useState('');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAdmin } = useAuth();

  useEffect(() => {
    const statusParam = searchParams.get('status');
    if (statusParam) setStatusFilter(statusParam);
  }, [searchParams]);

  useEffect(() => {
    loadOrders();
    if (isAdmin) loadSuppliers();
  }, [statusFilter, pagination.page]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const data = await orderApi.getOrders({ status: statusFilter, search: searchText || undefined, page: pagination.page, pageSize: pagination.pageSize });
      setOrders(data.orders || []);
      setPagination(prev => ({ ...prev, total: data.pagination?.total || 0 }));
    } catch (err) { message.error('加载订单失败'); }
    finally { setLoading(false); }
  };

  const loadSuppliers = async () => {
    try {
      const data = await authApi.getUsers();
      setSuppliers(data.users?.filter((u: any) => u.role === 'supplier') || []);
    } catch (e) { /* ignore */ }
  };

  const handleConfirm = async () => {
    if (!selectedSupplier) { message.warning('请选择供应商'); return; }
    try {
      await orderApi.confirmOrder(confirmModal.id, { supplier_id: selectedSupplier, admin_notes: adminNotes || undefined });
      message.success('订单已确认并分配给供应商');
      setConfirmModal(null);
      setSelectedSupplier('');
      setAdminNotes('');
      loadOrders();
    } catch (err: any) { message.error(err.response?.data?.error || '操作失败'); }
  };

  const columns = [
    { title: '订单号', dataIndex: 'etsy_order_id', key: 'etsy_order_id', render: (v: string) => v || '-', width: 140 },
    { title: '客户', dataIndex: 'customer_name', key: 'customer_name', width: 130 },
    { title: '商品数', key: 'items', render: (_: any, r: any) => (r.items || []).length, width: 80 },
    {
      title: '图片', key: 'images', width: 100,
      render: (_: any, r: any) => {
        const imgs = r.images || [];
        if (imgs.length === 0) return <Text type="secondary">无</Text>;
        return (
          <Image.PreviewGroup>
            <Space size={4} wrap>
              {imgs.slice(0, 3).map((img: any, i: number) => (
                <Image key={i} src={img.url || img.image_url} width={36} height={36} style={{ borderRadius: 4, objectFit: 'cover' }}
                  preview={{ mask: null }} fallback="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzYiIGhlaWdodD0iMzYiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjM2IiBoZWlnaHQ9IjM2IiBmaWxsPSIjZjBmMGYwIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGRvbWluYW50LWJhc2VsaW5lPSJtaWRkbGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiNjY2MiPk5vIEltZzwvdGV4dD48L3N2Zz4=" />
              ))}
              {imgs.length > 3 && <Text type="secondary">+{imgs.length - 3}</Text>}
            </Space>
          </Image.PreviewGroup>
        );
      }
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 100,
      render: (s: string) => <Tag color={statusColors[s]}>{statusLabels[s] || s}</Tag>
    },
    {
      title: '金额', key: 'amount', width: 120,
      render: (_: any, r: any) => <Text>${r.total_amount?.toFixed(2)} {r.currency || ''}</Text>
    },
    { title: '供应商', dataIndex: 'supplier_name', key: 'supplier_name', render: (v: string) => v || '-', width: 130 },
    {
      title: '时间', dataIndex: 'ordered_at', key: 'ordered_at', width: 110,
      render: (v: string) => v ? new Date(v).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) : '-'
    },
    {
      title: '操作', key: 'action', width: 160, fixed: 'right' as const,
      render: (_: any, record: any) => (
        <Space>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => navigate(`/orders/${record.id}`)}>详情</Button>
          {isAdmin && record.status === 'pending' && (
            <Button type="primary" size="small" icon={<CheckCircleOutlined />} onClick={() => setConfirmModal(record)}>确认分配</Button>
          )}
        </Space>
      )
    },
  ];

  const confirmContent = confirmModal && (
    <div>
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label="订单号">{confirmModal.etsy_order_id || confirmModal.id}</Descriptions.Item>
        <Descriptions.Item label="客户">{confirmModal.customer_name}</Descriptions.Item>
        <Descriptions.Item label="金额">${confirmModal.total_amount?.toFixed(2)}</Descriptions.Item>
        <Descriptions.Item label="商品">
          {(confirmModal.items || []).map((item: any, i: number) => (
            <div key={i}>{item.name} × {item.quantity} — ${item.price}</div>
          ))}
        </Descriptions.Item>
      </Descriptions>
      <Divider />
      <div style={{ marginTop: 16 }}>
        <Text strong>选择供应商：</Text>
        <Select
          style={{ width: '100%', marginTop: 8 }} placeholder="请选择供应商"
          value={selectedSupplier || undefined} onChange={setSelectedSupplier}
          options={suppliers.map((s: any) => ({ label: `${s.name} (${s.email || ''})`, value: s.id }))}
        />
      </div>
      <div style={{ marginTop: 12 }}>
        <Text>管理员备注：</Text>
        <Input.TextArea style={{ marginTop: 8 }} rows={3} value={adminNotes} onChange={e => setAdminNotes(e.target.value)} placeholder="备注信息（如生产要求、注意事项等）" />
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>订单管理</Title>
        <Space>
          <Input placeholder="搜索客户/订单号" prefix={<SearchOutlined />} value={searchText}
            onChange={e => setSearchText(e.target.value)} onPressEnter={() => { setPagination(prev => ({ ...prev, page: 1 })); loadOrders(); }}
            style={{ width: 220 }} allowClear />
          <Select placeholder="状态筛选" allowClear style={{ width: 120 }}
            value={statusFilter} onChange={v => { setStatusFilter(v); setPagination(prev => ({ ...prev, page: 1 })); }}
            options={Object.entries(statusLabels).map(([k, v]) => ({ label: v, value: k }))} />
          <Button icon={<ReloadOutlined />} onClick={() => { setPagination(prev => ({ ...prev, page: 1 })); loadOrders(); }}>刷新</Button>
        </Space>
      </div>

      <Card bodyStyle={{ padding: 0 }}>
        <Table
          dataSource={orders} columns={columns} rowKey="id" loading={loading} size="middle"
          scroll={{ x: 1100 }}
          pagination={{
            current: pagination.page, pageSize: pagination.pageSize, total: pagination.total,
            showSizeChanger: true, showTotal: (t) => `共 ${t} 单`,
            onChange: (p, ps) => setPagination(prev => ({ ...prev, page: p, pageSize: ps }))
          }}
          locale={{ emptyText: <Empty description="暂无订单" /> }}
        />
      </Card>

      <Modal title="确认订单并分配供应商" open={!!confirmModal} onOk={handleConfirm} onCancel={() => setConfirmModal(null)}
        okText="确认分配" cancelText="取消" width={580}>
        {confirmContent}
      </Modal>
    </div>
  );
}
