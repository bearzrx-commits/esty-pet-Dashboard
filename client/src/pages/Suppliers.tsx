import React, { useEffect, useState, useCallback } from 'react';
import { Table, Tag, Button, Space, Card, Modal, Form, Input, Select, message, Typography, Switch } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { authApi } from '../api';

const { Title } = Typography;

interface Supplier {
  id: string;
  username: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  role: string;
  active: number;
  created_at: string;
}

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [addModal, setAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const loadSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await authApi.getUsers();
      const users = Array.isArray(data) ? data : (data.users || []);
      setSuppliers(users.filter((u: Supplier) => u.role === 'supplier'));
    } catch (err) {
      message.error('加载供应商列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSuppliers(); }, [loadSuppliers]);

  const handleAdd = async (values: any) => {
    setSubmitting(true);
    try {
      await authApi.createUser({ ...values, role: 'supplier' });
      message.success('供应商创建成功');
      setAddModal(false);
      form.resetFields();
      loadSuppliers();
    } catch (err: any) {
      message.error(err.response?.data?.error || '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (record: Supplier, active: boolean) => {
    try {
      await authApi.updateUser(record.id, { active: active ? 1 : 0 });
      message.success(active ? '已启用' : '已禁用');
      loadSuppliers();
    } catch (err: any) {
      message.error(err.response?.data?.error || '操作失败');
    }
  };

  const columns = [
    { title: '用户名', dataIndex: 'username', key: 'username', width: 120 },
    { title: '姓名', dataIndex: 'name', key: 'name', width: 120 },
    { title: '邮箱', dataIndex: 'email', key: 'email', render: (v: string) => v || '-', width: 180 },
    { title: '电话', dataIndex: 'phone', key: 'phone', render: (v: string) => v || '-', width: 140 },
    { title: '公司', dataIndex: 'company', key: 'company', render: (v: string) => v || '-', width: 140 },
    {
      title: '状态', dataIndex: 'active', key: 'active', width: 100,
      render: (active: number, record: Supplier) => (
        <Switch checked={!!active} checkedChildren="启用" unCheckedChildren="禁用"
          onChange={(checked) => toggleActive(record, checked)} />
      ),
    },
    {
      title: '创建时间', dataIndex: 'created_at', key: 'created_at', width: 120,
      render: (v: string) => v ? new Date(v).toLocaleDateString('zh-CN') : '-',
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>供应商管理</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadSuppliers}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddModal(true)}>添加供应商</Button>
        </Space>
      </div>

      <Card bodyStyle={{ padding: 0 }}>
        <Table dataSource={suppliers} columns={columns} rowKey="id" loading={loading}
          size="middle" pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 个供应商` }}
          locale={{ emptyText: '暂无供应商，点击"添加供应商"创建' }} />
      </Card>

      <Modal title="添加供应商" open={addModal} onCancel={() => { setAddModal(false); form.resetFields(); }}
        footer={null} width={480} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={handleAdd} autoComplete="off">
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input placeholder="供应商登录账号" />
          </Form.Item>
          <Form.Item name="password" label="密码"
            rules={[{ required: true, message: '请输入密码' }, { min: 6, message: '密码至少6位' }]}>
            <Input.Password placeholder="至少6位密码" />
          </Form.Item>
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input placeholder="供应商姓名/称呼" />
          </Form.Item>
          <Form.Item name="email" label="邮箱">
            <Input type="email" placeholder="选填" />
          </Form.Item>
          <Form.Item name="phone" label="电话">
            <Input placeholder="选填" />
          </Form.Item>
          <Form.Item name="company" label="公司名称">
            <Input placeholder="选填" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={submitting}>创建供应商</Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
