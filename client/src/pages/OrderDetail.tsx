import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Tag, Image, Table, Timeline, Button, Space, Spin, Typography, Divider, Steps, Select, Input, message, Modal, Empty } from 'antd';
import { ArrowLeftOutlined, CheckCircleOutlined, CarOutlined, UserOutlined, SendOutlined, CloudUploadOutlined, LinkOutlined, CopyOutlined } from '@ant-design/icons';
import { orderApi, authApi, supplierApi, logisticsApi, uploadApi } from '../api';
import { useAuth } from '../context/AuthContext';
import TrackingTimeline from '../components/TrackingTimeline';

const { Title, Text } = Typography;

const statusColors: Record<string, string> = { pending: 'orange', confirmed: 'blue', in_production: 'processing', completed: 'green', cancelled: 'default' };
const statusLabels: Record<string, string> = { pending: '待处理', confirmed: '已确认', in_production: '生产中', completed: '已完成', cancelled: '已取消' };
const logisticsStatusLabels: Record<string, string> = { pending: '待发货', ready: '已打包', picked_up: '已揽收', in_transit: '运输中', delivered: '已签收', exception: '异常' };

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [order, setOrder] = useState<any>(null);
  const [supplierOrders, setSupplierOrders] = useState<any[]>([]);
  const [logistics, setLogistics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [reassignModal, setReassignModal] = useState(false);
  const [logisticsModal, setLogisticsModal] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [logisticsForm, setLogisticsForm] = useState({ carrier: '', tracking_number: '', weight_kg: '' });
  const [trackingModal, setTrackingModal] = useState<any>(null);
  const [uploadImages, setUploadImages] = useState<any[]>([]);
  const [uploadLink, setUploadLink] = useState('');
  const [generatingLink, setGeneratingLink] = useState(false);

  useEffect(() => { loadOrder(); if (isAdmin) loadSuppliers(); }, [id]);

  const loadOrder = async () => {
    try {
      const data = await orderApi.getOrder(id!);
      setOrder(data.order);
      setSupplierOrders(data.supplierOrders || []);
      setLogistics(data.logistics || []);
      // 加载客户上传的图片
      try {
        const uploadData = await uploadApi.getOrderUploads(id!);
        setUploadImages(uploadData.images || []);
        const activeToken = (uploadData.tokens || []).find((t: any) => !t.used);
        if (activeToken) {
          const baseUrl = window.location.origin;
          setUploadLink(`${baseUrl}/upload?token=${activeToken.token}`);
        }
      } catch (e) { /* ignore */ }
    } catch (err) { message.error('加载订单失败'); }
    finally { setLoading(false); }
  };

  const handleGenerateLink = async () => {
    setGeneratingLink(true);
    try {
      const data = await uploadApi.generateToken(id!);
      setUploadLink(data.url);
      message.success('上传链接已生成');
    } catch (err: any) {
      message.error(err.response?.data?.error || '生成链接失败');
    } finally {
      setGeneratingLink(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(uploadLink);
    message.success('链接已复制到剪贴板');
  };

  const loadSuppliers = async () => {
    try {
      const data = await authApi.getUsers();
      setSuppliers(data.users?.filter((u: any) => u.role === 'supplier') || []);
    } catch (e) { /* ignore */ }
  };

  const handleReassign = async () => {
    try {
      await orderApi.reassignOrder(id!, { supplier_id: selectedSupplier, admin_notes: adminNotes });
      message.success('订单已重新分配');
      setReassignModal(false);
      loadOrder();
    } catch (err: any) { message.error(err.response?.data?.error || '操作失败'); }
  };

  const handleCreateLogistics = async () => {
    if (!logisticsForm.carrier) { message.warning('请输入物流商'); return; }
    try {
      await logisticsApi.create({ order_id: id!, ...logisticsForm, weight_kg: logisticsForm.weight_kg ? parseFloat(logisticsForm.weight_kg) : undefined });
      message.success('物流记录已创建');
      setLogisticsModal(false);
      setLogisticsForm({ carrier: '', tracking_number: '', weight_kg: '' });
      loadOrder();
    } catch (err: any) { message.error(err.response?.data?.error || '操作失败'); }
  };

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  if (!order) return <div>订单不存在</div>;

  const currentStep = { pending: 0, confirmed: 1, in_production: 2, completed: 3, cancelled: -1 }[order.status] || 0;

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/orders')} style={{ marginBottom: 16 }}>返回列表</Button>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Title level={4} style={{ margin: 0 }}>订单详情 — {order.etsy_order_id || order.id}</Title>
          <Space>
            {currentStep === 0 && isAdmin && (
              <Button type="primary" onClick={() => {
                setSelectedSupplier('');
                setAdminNotes('');
                const m = Modal.confirm({
                  title: '确认订单并分配供应商',
                  content: <div>
                    <Select style={{ width: '100%', marginTop: 8 }} placeholder="选择供应商"
                      value={selectedSupplier || undefined}
                      onChange={(v) => { setSelectedSupplier(v); m.update({ content: <div><Select style={{ width: '100%', marginTop: 8 }} placeholder="选择供应商" value={v || undefined} onChange={(vv) => { setSelectedSupplier(vv); }} options={suppliers.map((s: any) => ({ label: s.name, value: s.id }))} /><Input.TextArea style={{ marginTop: 12 }} rows={3} placeholder="备注（可选）" onChange={e => setAdminNotes(e.target.value)} /></div> }); }}
                      options={suppliers.map((s: any) => ({ label: s.name, value: s.id }))} />
                    <Input.TextArea style={{ marginTop: 12 }} rows={3} placeholder="备注（可选）" onChange={e => setAdminNotes(e.target.value)} />
                  </div>,
                  onOk: async () => {
                    if (!selectedSupplier) { message.warning('请选择供应商'); return false; }
                    try {
                      await orderApi.confirmOrder(id!, { supplier_id: selectedSupplier, admin_notes: adminNotes || undefined });
                      message.success('已确认分配');
                      loadOrder();
                    } catch (err: any) { message.error(err.response?.data?.error || '操作失败'); return false; }
                  },
                  okText: '确认分配'
                });
              }}>
                <CheckCircleOutlined /> 确认并分配
              </Button>
            )}
            {isAdmin && currentStep > 0 && (
              <Button onClick={() => setReassignModal(true)}><UserOutlined /> 重新分配</Button>
            )}
            {(currentStep >= 2) && isAdmin && (
              <Button type="primary" onClick={() => setLogisticsModal(true)}><CarOutlined /> 创建物流</Button>
            )}
            {isAdmin && (
              <Button onClick={handleGenerateLink} loading={generatingLink} icon={<CloudUploadOutlined />}>
                生成上传链接
              </Button>
            )}
          </Space>
        </div>

        <Steps current={currentStep} size="small" style={{ marginBottom: 24 }}
          items={[
            { title: '待处理', description: order.ordered_at ? new Date(order.ordered_at).toLocaleDateString() : '' },
            { title: '已确认', description: order.supplier_name || '' },
            { title: '生产中', description: '' },
            { title: '已完成', description: '' },
          ]}
        />

        <Divider orientation="left">客户信息</Divider>
        <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small" bordered>
          <Descriptions.Item label="客户姓名">{order.customer_name}</Descriptions.Item>
          <Descriptions.Item label="邮箱">{order.customer_email || '-'}</Descriptions.Item>
          <Descriptions.Item label="订单金额">${order.total_amount?.toFixed(2)} {order.currency || ''}</Descriptions.Item>
          <Descriptions.Item label="状态"><Tag color={statusColors[order.status]}>{statusLabels[order.status]}</Tag></Descriptions.Item>
          <Descriptions.Item label="供应商">{order.supplier_name || '未分配'}</Descriptions.Item>
          <Descriptions.Item label="下单时间">{order.ordered_at ? new Date(order.ordered_at).toLocaleString('zh-CN') : '-'}</Descriptions.Item>
          <Descriptions.Item label="收货地址" span={3}>{order.shipping_address || '-'}</Descriptions.Item>
          <Descriptions.Item label="管理员备注" span={3}>{order.admin_notes || '-'}</Descriptions.Item>
        </Descriptions>

        <Divider orientation="left">订购商品</Divider>
        <Table
          dataSource={order.items || []} rowKey={(_, i) => String(i)} pagination={false} size="small"
          columns={[
            { title: '商品名称', dataIndex: 'name', key: 'name' },
            { title: 'SKU', dataIndex: 'sku', key: 'sku', render: (v: string) => v || '-' },
            { title: '数量', dataIndex: 'quantity', key: 'quantity' },
            { title: '单价', key: 'price', render: (_: any, r: any) => `$${r.price?.toFixed(2)}` },
            { title: '小计', key: 'subtotal', render: (_: any, r: any) => `$${(r.price * r.quantity).toFixed(2)}` },
          ]}
        />

        <Divider orientation="left">客户上传的图片</Divider>
        {uploadImages.length > 0 && (
          <>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              <CloudUploadOutlined style={{ color: '#1677ff', marginRight: 4 }} />
              客户已上传 {uploadImages.length} 张定制图片
            </Text>
            <Image.PreviewGroup>
              <Space wrap size={12} style={{ marginBottom: 16 }}>
                {uploadImages.map((img: any, i: number) => (
                  <div key={i} style={{ textAlign: 'center' }}>
                    <Image src={img.image_url} width={180} height={180} style={{ borderRadius: 8, objectFit: 'cover', border: '2px solid #1677ff' }} fallback="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTgwIiBoZWlnaHQ9IjE4MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTgwIiBoZWlnaHQ9IjE4MCIgZmlsbD0iI2YwZjBmMCIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjY2NjIj5JbWFnZTwvdGV4dD48L3N2Zz4=" />
                    <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{img.description || ''}</div>
                  </div>
                ))}
              </Space>
            </Image.PreviewGroup>
          </>
        )}

        {/* 上传链接生成区 */}
        <Card size="small" style={{ background: '#f6ffed', border: '1px solid #b7eb8f', marginBottom: 16 }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text strong><CloudUploadOutlined /> 客户图片上传链接</Text>
            {uploadLink ? (
              <Space style={{ width: '100%' }}>
                <Input.Search
                  value={uploadLink}
                  readOnly
                  enterButton={<><CopyOutlined /> 复制</>}
                  onSearch={handleCopyLink}
                  style={{ flex: 1 }}
                />
                <Button icon={<LinkOutlined />} onClick={() => window.open(uploadLink, '_blank')}>打开</Button>
              </Space>
            ) : (
              <Button onClick={handleGenerateLink} loading={generatingLink}>
                生成上传链接
              </Button>
            )}
            <Text type="secondary" style={{ fontSize: 12 }}>
              将此链接发送给客户，客户打开后即可上传定制图片。链接有效期 7 天。
            </Text>
          </Space>
        </Card>

        {order.images && order.images.length > 0 ? (
          <Image.PreviewGroup>
            <Space wrap size={12}>
              {order.images.map((img: any, i: number) => (
                <div key={i} style={{ textAlign: 'center' }}>
                  <Image src={img.url || img.image_url} width={180} style={{ borderRadius: 8, objectFit: 'cover' }} fallback="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTgwIiBoZWlnaHQ9IjE4MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTgwIiBoZWlnaHQ9IjE4MCIgZmlsbD0iI2YwZjBmMCIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjY2NjIj5JbWFnZTwvdGV4dD48L3N2Zz4=" />
                  <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{img.description || img.image_type || ''}</div>
                </div>
              ))}
            </Space>
          </Image.PreviewGroup>
        ) : (
          uploadImages.length === 0 && <Empty description="暂无客户上传的图片。请先生成上传链接发送给客户。" />
        )}

        {supplierOrders.length > 0 && (
          <>
            <Divider orientation="left">供应商处理记录</Divider>
            <Timeline items={supplierOrders.map((so: any) => ({
              color: so.status === 'completed' ? 'green' : so.status === 'in_production' ? 'blue' : 'gray',
              children: (
                <div>
                  <Text strong>{so.supplier_name}</Text>
                  <Tag color={statusColors[so.status]} style={{ marginLeft: 8 }}>{statusLabels[so.status]}</Tag>
                  <div style={{ fontSize: 12, color: '#888' }}>{new Date(so.created_at).toLocaleString('zh-CN')}</div>
                  {so.supplier_notes && <div style={{ marginTop: 4 }}>备注：{so.supplier_notes}</div>}
                </div>
              )
            }))} />
          </>
        )}

        {logistics.length > 0 && (
          <>
            <Divider orientation="left">物流信息</Divider>
            {logistics.map((log: any) => (
              <Card key={log.id} size="small" style={{ marginBottom: 8 }}>
                <Descriptions column={{ xs: 1, sm: 2 }} size="small">
                  <Descriptions.Item label="物流商">{log.carrier}</Descriptions.Item>
                  <Descriptions.Item label="运单号">{log.tracking_number || '-'}</Descriptions.Item>
                  <Descriptions.Item label="状态"><Tag>{logisticsStatusLabels[log.status] || log.status}</Tag></Descriptions.Item>
                  <Descriptions.Item label="发货时间">{log.shipped_at ? new Date(log.shipped_at).toLocaleString('zh-CN') : '-'}</Descriptions.Item>
                </Descriptions>
                {log.tracking_number && (
                  <Button size="small" type="link" icon={<SendOutlined />}
                    onClick={() => setTrackingModal(log)} style={{ marginTop: 8 }}>
                    查看物流轨迹
                  </Button>
                )}
              </Card>
            ))}
          </>
        )}
      </Card>

      {/* 重新分配弹窗 */}
      <Modal title="重新分配供应商" open={reassignModal} onOk={handleReassign} onCancel={() => setReassignModal(false)} okText="确认分配" cancelText="取消">
        <Select style={{ width: '100%' }} placeholder="选择供应商" value={selectedSupplier || undefined} onChange={setSelectedSupplier}
          options={suppliers.filter((s: any) => s.id !== order.supplier_id).map((s: any) => ({ label: s.name, value: s.id }))} />
        <Input.TextArea style={{ marginTop: 12 }} rows={3} placeholder="备注" value={adminNotes} onChange={e => setAdminNotes(e.target.value)} />
      </Modal>

      {/* 创建物流弹窗 */}
      <Modal title="创建物流记录" open={logisticsModal} onOk={handleCreateLogistics} onCancel={() => setLogisticsModal(false)} okText="创建" cancelText="取消">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input placeholder="物流商（如：顺丰速运、DHL）" value={logisticsForm.carrier} onChange={e => setLogisticsForm(p => ({ ...p, carrier: e.target.value }))} />
          <Input placeholder="运单号" value={logisticsForm.tracking_number} onChange={e => setLogisticsForm(p => ({ ...p, tracking_number: e.target.value }))} />
          <Input placeholder="重量（kg，可选）" type="number" value={logisticsForm.weight_kg} onChange={e => setLogisticsForm(p => ({ ...p, weight_kg: e.target.value }))} />
        </div>
      </Modal>

      {/* 物流轨迹弹窗 */}
      {trackingModal && (
        <TrackingTimeline
          logisticsId={trackingModal.id}
          carrier={trackingModal.carrier}
          trackingNumber={trackingModal.tracking_number}
          visible={!!trackingModal}
          onClose={() => setTrackingModal(null)}
        />
      )}
    </div>
  );
}
