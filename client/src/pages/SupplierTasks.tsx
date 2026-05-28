import React, { useEffect, useState } from 'react';
import { Table, Tag, Button, Space, Card, Modal, Input, message, Typography, Image, Descriptions, Divider, Empty, Select, Row, Col, Statistic } from 'antd';
import { CheckCircleOutlined, PlayCircleOutlined, CloseCircleOutlined, ToolOutlined, EyeOutlined } from '@ant-design/icons';
import { supplierApi } from '../api';

const { Title, Text } = Typography;
const statusColors: Record<string, string> = { pending: 'orange', confirmed: 'blue', in_production: 'processing', completed: 'green', rejected: 'red' };
const statusLabels: Record<string, string> = { pending: '待处理', confirmed: '已确认', in_production: '生产中', completed: '已完成', rejected: '已拒绝' };

export default function SupplierTasks() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [pagination, setPagination] = useState({ total: 0, page: 1, pageSize: 20 });
  const [detailModal, setDetailModal] = useState<any>(null);
  const [completeModal, setCompleteModal] = useState<any>(null);
  const [supplierNotes, setSupplierNotes] = useState('');
  const [rejectModal, setRejectModal] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState('');

  const loadTasks = async () => {
    setLoading(true);
    try {
      const data = await supplierApi.getTasks({ status: statusFilter, page: pagination.page, pageSize: pagination.pageSize });
      setTasks(data.tasks || []);
      setPagination(prev => ({ ...prev, total: data.pagination?.total || 0 }));
    } catch (err) { message.error('加载任务失败'); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadTasks(); }, [statusFilter, pagination.page]);

  const handleAccept = async (id: string) => {
    try { await supplierApi.acceptTask(id); message.success('已成功接单'); loadTasks(); }
    catch (err: any) { message.error(err.response?.data?.error || '操作失败'); }
  };

  const handleStartProduction = async (id: string) => {
    try { await supplierApi.startProduction(id); message.success('已开始生产'); loadTasks(); }
    catch (err: any) { message.error(err.response?.data?.error || '操作失败'); }
  };

  const handleComplete = async () => {
    try {
      await supplierApi.completeTask(completeModal.id, supplierNotes || undefined);
      message.success('生产已完成');
      setCompleteModal(null); setSupplierNotes('');
      loadTasks();
    } catch (err: any) { message.error(err.response?.data?.error || '操作失败'); }
  };

  const handleReject = async () => {
    try {
      await supplierApi.rejectTask(rejectModal.id, rejectReason || undefined);
      message.success('已拒绝接单');
      setRejectModal(null); setRejectReason('');
      loadTasks();
    } catch (err: any) { message.error(err.response?.data?.error || '操作失败'); }
  };

  const stats = { total: tasks.length, pending: tasks.filter(t => t.status === 'pending').length, inProduction: tasks.filter(t => t.status === 'in_production').length, completed: tasks.filter(t => t.status === 'completed').length };
  const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  const columns = [
    { title: '订单号', dataIndex: 'etsy_order_id', key: 'etsy_order_id', render: (v: string) => v || '-', width: 140 },
    { title: '客户', dataIndex: 'customer_name', key: 'customer_name', width: 120 },
    { title: '商品', key: 'items', render: (_: any, r: any) => (r.items || []).map((i: any) => i.name).join(' / ') || '-', ellipsis: true },
    { title: '图片', key: 'images', render: (_: any, r: any) => { const imgs = r.images || []; if (!imgs.length) return <Text type="secondary">无</Text>; return <Image.PreviewGroup><Space size={4}>{imgs.slice(0, 3).map((img: any, i: number) => <Image key={i} src={img.url || img.image_url} width={36} height={36} style={{ borderRadius: 4, objectFit: 'cover' }} preview={{ mask: null }} />)}</Space></Image.PreviewGroup>; }, width: 120 },
    { title: '金额', key: 'amount', render: (_: any, r: any) => `$${r.total_amount?.toFixed(2)}`, width: 100 },
    { title: '状态', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color={statusColors[s]}>{statusLabels[s] || s}</Tag>, width: 100 },
    { title: '备注', dataIndex: 'admin_notes', key: 'admin_notes', render: (v: string) => v || '-', width: 150 },
    {
      title: '操作', key: 'action', width: 240, fixed: 'right' as const,
      render: (_: any, record: any) => (
        <Space>
          <Button size="small" onClick={() => setDetailModal(record)}>详情</Button>
          {record.status === 'pending' && <><Button type="primary" size="small" icon={<CheckCircleOutlined />} onClick={() => handleAccept(record.id)}>接单</Button><Button danger size="small" icon={<CloseCircleOutlined />} onClick={() => setRejectModal(record)}>拒绝</Button></>}
          {record.status === 'confirmed' && <Button type="primary" size="small" icon={<PlayCircleOutlined />} onClick={() => handleStartProduction(record.id)}>开始生产</Button>}
          {record.status === 'in_production' && <Button type="primary" size="small" icon={<ToolOutlined />} onClick={() => setCompleteModal(record)}>完成生产</Button>}
        </Space>
      )
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>我的任务</Title>
        <Space>
          <Select placeholder="状态筛选" allowClear style={{ width: 120 }} value={statusFilter}
            onChange={v => { setStatusFilter(v); setPagination(p => ({ ...p, page: 1 })); }}
            options={Object.entries(statusLabels).map(([k, v]) => ({ label: v, value: k }))} />
          <Button onClick={() => { setPagination(p => ({ ...p, page: 1 })); loadTasks(); }}>刷新</Button>
        </Space>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card size="small"><Statistic title="总任务" value={stats.total} suffix="单" /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="待处理" value={stats.pending} valueStyle={{ color: '#faad14' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="生产中" value={stats.inProduction} valueStyle={{ color: '#1677ff' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="完成率" value={completionRate} suffix="%" valueStyle={{ color: '#52c41a' }} /></Card></Col>
      </Row>

      <Card bodyStyle={{ padding: 0 }}>
        <Table dataSource={tasks} columns={columns} rowKey="id" loading={loading} size="middle" scroll={{ x: 1100 }}
          pagination={{ current: pagination.page, pageSize: pagination.pageSize, total: pagination.total, showSizeChanger: true, showTotal: (t) => `共 ${t} 单`, onChange: (p, ps) => setPagination(prev => ({ ...prev, page: p, pageSize: ps })) }}
          locale={{ emptyText: <Empty description="暂无任务" /> }} />
      </Card>

      <Modal title="任务详情" open={!!detailModal} onCancel={() => setDetailModal(null)} footer={null} width={600}>
        {detailModal && <div>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="订单号">{detailModal.etsy_order_id || '-'}</Descriptions.Item>
            <Descriptions.Item label="客户">{detailModal.customer_name}</Descriptions.Item>
            <Descriptions.Item label="金额">${detailModal.total_amount?.toFixed(2)} {detailModal.currency || ''}</Descriptions.Item>
            <Descriptions.Item label="状态"><Tag color={statusColors[detailModal.status]}>{statusLabels[detailModal.status]}</Tag></Descriptions.Item>
            <Descriptions.Item label="下单时间">{detailModal.ordered_at ? new Date(detailModal.ordered_at).toLocaleString('zh-CN') : '-'}</Descriptions.Item>
            <Descriptions.Item label="收货地址">{detailModal.shipping_address || '-'}</Descriptions.Item>
            <Descriptions.Item label="管理员备注">{detailModal.admin_notes || '无'}</Descriptions.Item>
          </Descriptions>
          <Divider />
          <Text strong>商品明细：</Text>
          {(detailModal.items || []).map((item: any, i: number) => <div key={i} style={{ marginTop: 8 }}>{item.name} × {item.quantity} — ${item.price?.toFixed(2)}</div>)}
          {(detailModal.images || []).length > 0 && <>
            <Divider /><Text strong>图片：</Text>
            <Image.PreviewGroup><Space wrap style={{ marginTop: 8 }}>{(detailModal.images || []).map((img: any, i: number) => <Image key={i} src={img.url || img.image_url} width={150} style={{ borderRadius: 8, objectFit: 'cover' }} />)}</Space></Image.PreviewGroup>
          </>}
        </div>}
      </Modal>

      <Modal title="完成生产" open={!!completeModal} onOk={handleComplete} onCancel={() => { setCompleteModal(null); setSupplierNotes(''); }} okText="确认完成" cancelText="取消">
        <Text>确认该订单已生产完成？请填写生产备注（可选）：</Text>
        <Input.TextArea style={{ marginTop: 12 }} rows={3} value={supplierNotes} onChange={e => setSupplierNotes(e.target.value)} placeholder="生产备注（如：已完成质检、包装等）" />
      </Modal>

      <Modal title="拒绝接单" open={!!rejectModal} onOk={handleReject} onCancel={() => { setRejectModal(null); setRejectReason(''); }} okText="确认拒绝" cancelText="取消" okButtonProps={{ danger: true }}>
        <Text>请填写拒绝原因：</Text>
        <Input.TextArea style={{ marginTop: 12 }} rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="拒绝原因（如：产能不足、材料缺货等）" />
      </Modal>
    </div>
  );
}
