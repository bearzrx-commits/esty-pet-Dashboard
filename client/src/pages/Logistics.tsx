import React, { useEffect, useState } from 'react';
import { Table, Tag, Button, Space, Card, Modal, Input, Select, message, Typography, Descriptions, Empty, Row, Col, Statistic } from 'antd';
import { CarOutlined, PlusOutlined, ReloadOutlined, EyeOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { logisticsApi, orderApi } from '../api';
import { useAuth } from '../context/AuthContext';

const { Title, Text } = Typography;
const statusLabels: Record<string, string> = { pending: '待发货', ready: '已打包', picked_up: '已揽收', in_transit: '运输中', delivered: '已签收', exception: '异常' };
const statusColors: Record<string, string> = { pending: 'default', ready: 'blue', picked_up: 'processing', in_transit: 'geekblue', delivered: 'green', exception: 'red' };

export default function Logistics() {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pageSize: 20 });
  const [createModal, setCreateModal] = useState(false);
  const [statusModal, setStatusModal] = useState<any>(null);
  const [newLogistics, setNewLogistics] = useState({ order_id: '', carrier: '', tracking_number: '', weight_kg: '' });
  const [statusUpdate, setStatusUpdate] = useState({ status: '', tracking_number: '' });
  const [allOrders, setAllOrders] = useState<any[]>([]);
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const loadRecords = async () => {
    setLoading(true);
    try {
      const data = await logisticsApi.getList({ page: pagination.page, pageSize: pagination.pageSize });
      setRecords(data.logistics || []);
      setPagination(prev => ({ ...prev, total: data.pagination?.total || 0 }));
    } catch (err) { message.error('加载物流信息失败'); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadRecords(); }, [pagination.page]);
  useEffect(() => { if (createModal) { orderApi.getOrders({ status: 'completed', pageSize: 100 }).then(d => setAllOrders(d.orders || [])).catch(() => {}); } }, [createModal]);

  const handleCreate = async () => {
    if (!newLogistics.order_id || !newLogistics.carrier) { message.warning('请填写必要信息'); return; }
    try {
      await logisticsApi.create({ ...newLogistics, weight_kg: newLogistics.weight_kg ? parseFloat(newLogistics.weight_kg) : undefined });
      message.success('物流记录创建成功');
      setCreateModal(false);
      setNewLogistics({ order_id: '', carrier: '', tracking_number: '', weight_kg: '' });
      loadRecords();
    } catch (err: any) { message.error(err.response?.data?.error || '操作失败'); }
  };

  const handleUpdateStatus = async () => {
    try {
      await logisticsApi.updateStatus(statusModal.id, { status: statusUpdate.status, tracking_number: statusUpdate.tracking_number || undefined });
      message.success('物流状态已更新');
      setStatusModal(null);
      setStatusUpdate({ status: '', tracking_number: '' });
      loadRecords();
    } catch (err: any) { message.error(err.response?.data?.error || '操作失败'); }
  };

  const columns = [
    { title: '物流单号', dataIndex: 'id', key: 'id', render: (v: string) => v.slice(-8), width: 100 },
    { title: '订单号', dataIndex: 'etsy_order_id', key: 'etsy_order_id', render: (v: string) => v || '-', width: 130 },
    { title: '客户', dataIndex: 'customer_name', key: 'customer_name', width: 120 },
    { title: '物流商', dataIndex: 'carrier', key: 'carrier', width: 120 },
    { title: '运单号', dataIndex: 'tracking_number', key: 'tracking_number', render: (v: string) => v || '-', width: 140 },
    { title: '状态', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color={statusColors[s]}>{statusLabels[s] || s}</Tag>, width: 100 },
    { title: '发货时间', dataIndex: 'shipped_at', key: 'shipped_at', render: (v: string) => v ? new Date(v).toLocaleDateString('zh-CN') : '-', width: 100 },
    {
      title: '操作', key: 'action', width: 160,
      render: (_: any, record: any) => (
        <Space>
          <Button size="small" onClick={() => navigate(`/orders/${record.order_id}`)}><EyeOutlined /> 查看订单</Button>
          {isAdmin && <Button size="small" onClick={() => { setStatusModal(record); setStatusUpdate({ status: record.status, tracking_number: record.tracking_number || '' }); }}>更新状态</Button>}
        </Space>
      )
    },
  ];

  const statusOptions = Object.entries(statusLabels).map(([k, v]) => ({ label: v, value: k }));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>物流管理</Title>
        <Space>
          {isAdmin && <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModal(true)}>创建物流</Button>}
          <Button icon={<ReloadOutlined />} onClick={() => { setPagination(p => ({ ...p, page: 1 })); loadRecords(); }}>刷新</Button>
        </Space>
      </div>

      <Card bodyStyle={{ padding: 0 }}>
        <Table dataSource={records} columns={columns} rowKey="id" loading={loading} size="middle" scroll={{ x: 900 }}
          pagination={{ current: pagination.page, pageSize: pagination.pageSize, total: pagination.total, showSizeChanger: true, showTotal: (t) => `共 ${t} 条`, onChange: (p, ps) => setPagination(prev => ({ ...prev, page: p, pageSize: ps })) }}
          locale={{ emptyText: <Empty description="暂无物流记录" /> }} />
      </Card>

      <Modal title="创建物流记录" open={createModal} onOk={handleCreate} onCancel={() => setCreateModal(false)} okText="创建" cancelText="取消" width={500}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><Text>选择已完成订单：</Text>
            <Select showSearch style={{ width: '100%', marginTop: 4 }} placeholder="搜索并选择订单"
              value={newLogistics.order_id || undefined}
              onChange={v => setNewLogistics(p => ({ ...p, order_id: v }))}
              filterOption={(input, option) => (option?.label as string || '').toLowerCase().includes(input.toLowerCase())}
              options={allOrders.map((o: any) => ({ label: `${o.etsy_order_id || o.id} - ${o.customer_name}`, value: o.id }))} />
          </div>
          <Input placeholder="物流商（如：顺丰速运、DHL、FedEx）" value={newLogistics.carrier} onChange={e => setNewLogistics(p => ({ ...p, carrier: e.target.value }))} />
          <Input placeholder="运单号" value={newLogistics.tracking_number} onChange={e => setNewLogistics(p => ({ ...p, tracking_number: e.target.value }))} />
          <Input placeholder="重量（kg，可选）" type="number" value={newLogistics.weight_kg} onChange={e => setNewLogistics(p => ({ ...p, weight_kg: e.target.value }))} />
        </div>
      </Modal>

      <Modal title="更新物流状态" open={!!statusModal} onOk={handleUpdateStatus} onCancel={() => setStatusModal(null)} okText="更新" cancelText="取消">
        {statusModal && <div>
          <Descriptions column={1} size="small" bordered style={{ marginBottom: 16 }}>
            <Descriptions.Item label="物流商">{statusModal.carrier}</Descriptions.Item>
            <Descriptions.Item label="当前运单号">{statusModal.tracking_number || '-'}</Descriptions.Item>
            <Descriptions.Item label="当前状态"><Tag color={statusColors[statusModal.status]}>{statusLabels[statusModal.status]}</Tag></Descriptions.Item>
          </Descriptions>
          <Text strong>更新为：</Text>
          <Select style={{ width: '100%', marginTop: 8 }} value={statusUpdate.status} onChange={v => setStatusUpdate(p => ({ ...p, status: v }))} options={statusOptions} />
          <Input placeholder="运单号（可选，填写或修改）" style={{ marginTop: 12 }} value={statusUpdate.tracking_number} onChange={e => setStatusUpdate(p => ({ ...p, tracking_number: e.target.value }))} />
        </div>}
      </Modal>
    </div>
  );
}
