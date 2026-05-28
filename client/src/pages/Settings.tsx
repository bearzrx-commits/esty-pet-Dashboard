import React, { useEffect, useState } from 'react';
import { Card, Typography, Descriptions, Tag, Button, Modal, Form, Input, Select, message, Space, Table, Divider, Spin } from 'antd';
import { UserOutlined, PlusOutlined, ApiOutlined, SyncOutlined } from '@ant-design/icons';
import { authApi, etsyApi } from '../api';
import { useAuth } from '../context/AuthContext';

const { Title, Text } = Typography;

export default function Settings() {
  const { user, isAdmin } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [createModal, setCreateModal] = useState(false);
  const [form] = Form.useForm();
  const [etsyStatus, setEtsyStatus] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (isAdmin) { loadUsers(); checkEtsy(); }
  }, [isAdmin]);

  const loadUsers = async () => {
    setLoading(true);
    try { const data = await authApi.getUsers(); setUsers(data.users || []); }
    catch (err) { message.error('加载用户失败'); }
    finally { setLoading(false); }
  };

  const checkEtsy = async () => {
    try { const data = await etsyApi.testConnection(); setEtsyStatus(data); }
    catch (e) { setEtsyStatus({ connected: false, message: '无法连接 Etsy API' }); }
  };

  const handleCreateUser = async (values: any) => {
    try {
      await authApi.createUser(values);
      message.success('用户创建成功');
      setCreateModal(false);
      form.resetFields();
      loadUsers();
    } catch (err: any) { message.error(err.response?.data?.error || '创建失败'); }
  };

  const handleSyncEtsy = async () => {
    setSyncing(true);
    try {
      const data = await etsyApi.syncOrders();
      message.success(data.message || '同步完成');
      checkEtsy();
    } catch (err: any) { message.error(err.response?.data?.error || '同步失败'); }
    finally { setSyncing(false); }
  };

  const userColumns = [
    { title: '用户名', dataIndex: 'username', key: 'username' },
    { title: '姓名', dataIndex: 'name', key: 'name' },
    { title: '邮箱', dataIndex: 'email', key: 'email', render: (v: string) => v || '-' },
    { title: '角色', dataIndex: 'role', key: 'role', render: (r: string) => <Tag color={r === 'admin' ? 'blue' : 'green'}>{r === 'admin' ? '管理员' : '供应商'}</Tag> },
    { title: '状态', dataIndex: 'active', key: 'active', render: (a: number) => <Tag color={a ? 'green' : 'red'}>{a ? '启用' : '禁用'}</Tag> },
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at', render: (v: string) => v ? new Date(v).toLocaleDateString('zh-CN') : '-' },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 24 }}>系统设置</Title>

      {isAdmin && <>
        <Card title={<Space><UserOutlined />账号管理</Space>} style={{ marginBottom: 16 }}
          extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModal(true)}>创建账号</Button>}>
          <Table dataSource={users} columns={userColumns} rowKey="id" loading={loading} size="small" pagination={false} />
        </Card>

        <Card title={<Space><ApiOutlined />Etsy API 对接</Space>} style={{ marginBottom: 16 }}>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="连接状态">
              <Tag color={etsyStatus?.connected ? 'green' : 'orange'}>
                {etsyStatus?.connected ? '已连接' : '未连接'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="API 信息">{etsyStatus?.message || '检测中...'}</Descriptions.Item>
            {etsyStatus?.hint && <Descriptions.Item label="配置提示">{etsyStatus.hint}</Descriptions.Item>}
          </Descriptions>
          <Space style={{ marginTop: 16 }}>
            <Button onClick={checkEtsy}>测试连接</Button>
            <Button type="primary" icon={<SyncOutlined />} loading={syncing} onClick={handleSyncEtsy}>同步 Etsy 订单</Button>
          </Space>
          <div style={{ marginTop: 12, padding: 12, background: '#fffbe6', borderRadius: 6, fontSize: 12 }}>
            <Text type="warning">提示：请先在 .env 文件中配置 ETSY_API_KEY 和 ETSY_SHOP_ID。当前使用演示数据。</Text>
          </div>
        </Card>
      </>}

      <Card title="个人信息">
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label="用户名">{user?.username}</Descriptions.Item>
          <Descriptions.Item label="姓名">{user?.name}</Descriptions.Item>
          <Descriptions.Item label="角色"><Tag color={user?.role === 'admin' ? 'blue' : 'green'}>{user?.role === 'admin' ? '管理员' : '供应商'}</Tag></Descriptions.Item>
          <Descriptions.Item label="邮箱">{user?.email || '-'}</Descriptions.Item>
          <Descriptions.Item label="电话">{user?.phone || '-'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Modal title="创建账号" open={createModal} onCancel={() => setCreateModal(false)} footer={null} width={450}>
        <Form form={form} layout="vertical" onFinish={handleCreateUser}>
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }, { min: 6, message: '密码至少6位' }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="邮箱">
            <Input type="email" />
          </Form.Item>
          <Form.Item name="phone" label="电话">
            <Input />
          </Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true, message: '请选择角色' }]}>
            <Select options={[{ label: '管理员', value: 'admin' }, { label: '供应商', value: 'supplier' }]} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>创建</Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
