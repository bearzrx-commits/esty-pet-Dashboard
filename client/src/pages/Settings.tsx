import React, { useEffect, useState } from 'react';
import { Card, Typography, Descriptions, Tag, Button, Modal, Form, Input, Select, message, Space, Table, Divider, Spin, Tabs } from 'antd';
import { UserOutlined, PlusOutlined, ApiOutlined, SyncOutlined, LockOutlined, EditOutlined, SendOutlined } from '@ant-design/icons';
import { authApi, etsyApi, etsyOAuthApi } from '../api';
import { useAuth } from '../context/AuthContext';

const { Title, Text } = Typography;

export default function Settings() {
  const { user, isAdmin, setUser } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [createModal, setCreateModal] = useState(false);
  const [form] = Form.useForm();
  const [etsyStatus, setEtsyStatus] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const [oauthStatus, setOAuthStatus] = useState<any>(null);
  const [oauthLoading, setOAuthLoading] = useState(false);
  const [autoSendEnabled, setAutoSendEnabled] = useState(false);

  // 修改密码
  const [passwordModal, setPasswordModal] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordForm] = Form.useForm();

  // 编辑个人信息
  const [profileModal, setProfileModal] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileForm] = Form.useForm();

  useEffect(() => {
    if (isAdmin) { loadUsers(); checkEtsy(); checkOAuth(); }
  }, [isAdmin]);

  // 监听 OAuth 回调的消息（从弹出窗口发来的 postMessage）
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'ETSY_OAUTH_SUCCESS') {
        message.success('Etsy 授权成功！');
        checkOAuth();
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

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
      const data = await etsyApi.syncOrders(autoSendEnabled);
      const extraMsg = autoSendEnabled ? '（已自动发送上传链接给新客户）' : '';
      message.success(data.message + extraMsg || '同步完成' + extraMsg);
      checkEtsy();
    } catch (err: any) { message.error(err.response?.data?.error || '同步失败'); }
    finally { setSyncing(false); }
  };

  const checkOAuth = async () => {
    try {
      const status = await etsyOAuthApi.getStatus();
      setOAuthStatus(status);
    } catch (e) {
      setOAuthStatus({ connected: false, message: '检查失败' });
    }
  };

  const handleConnectEtsy = async () => {
    setOAuthLoading(true);
    try {
      const data = await etsyOAuthApi.getAuthorizeUrl();
      // 弹出新窗口进行 Etsy 授权
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      window.open(
        data.url,
        'etsy-oauth',
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
      );
    } catch (err: any) {
      message.error(err.response?.data?.error || err.message || '获取授权链接失败');
    } finally {
      setOAuthLoading(false);
    }
  };

  const handleDisconnectEtsy = async () => {
    Modal.confirm({
      title: '断开 Etsy 连接',
      content: '断开后需要通过 Etsy 消息发送功能将无法使用。确定要断开吗？',
      okText: '确认断开',
      cancelText: '取消',
      onOk: async () => {
        try {
          await etsyOAuthApi.disconnect();
          message.success('已断开 Etsy 连接');
          checkOAuth();
        } catch (err: any) {
          message.error(err.response?.data?.error || '断开失败');
        }
      },
    });
  };

  const handleSyncAndSend = async () => {
    setSyncing(true);
    try {
      const data = await etsyApi.syncOrders(true);
      message.success(data.message || '同步完成（已自动发送上传链接）');
      checkEtsy();
    } catch (err: any) {
      message.error(err.response?.data?.error || '同步失败');
    } finally {
      setSyncing(false);
    }
  };

  const handleChangePassword = async (values: any) => {
    setPasswordLoading(true);
    try {
      await authApi.changePassword(values.oldPassword, values.newPassword);
      message.success('密码修改成功');
      setPasswordModal(false);
      passwordForm.resetFields();
    } catch (err: any) { message.error(err.response?.data?.error || '修改失败'); }
    finally { setPasswordLoading(false); }
  };

  const handleOpenProfileEdit = () => {
    profileForm.setFieldsValue({
      name: user?.name || '',
      email: user?.email || '',
      phone: user?.phone || '',
    });
    setProfileModal(true);
  };

  const handleUpdateProfile = async (values: any) => {
    setProfileLoading(true);
    try {
      const updated = await authApi.updateProfile(values);
      setUser(updated);
      message.success('个人信息已更新');
      setProfileModal(false);
    } catch (err: any) { message.error(err.response?.data?.error || '更新失败'); }
    finally { setProfileLoading(false); }
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
          {/* API Key 连接状态 */}
          <Descriptions column={1} size="small" bordered style={{ marginBottom: 16 }}>
            <Descriptions.Item label="API 连接状态">
              <Tag color={etsyStatus?.connected ? 'green' : 'orange'}>
                {etsyStatus?.connected ? '已连接' : '未连接'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="API 信息">{etsyStatus?.message || '检测中...'}</Descriptions.Item>
            {etsyStatus?.hint && <Descriptions.Item label="配置提示">{etsyStatus.hint}</Descriptions.Item>}
          </Descriptions>
          <Space style={{ marginBottom: 12 }}>
            <Button onClick={checkEtsy}>测试连接</Button>
            <Button type="primary" icon={<SyncOutlined />} loading={syncing} onClick={handleSyncEtsy}>
              同步 Etsy 订单
            </Button>
            <Button
              type="primary"
              icon={<SyncOutlined />}
              loading={syncing}
              onClick={handleSyncAndSend}
              disabled={!oauthStatus?.connected}
              style={{ background: '#d48806', borderColor: '#d48806' }}
            >
              同步 + 自动发送上传链接
            </Button>
          </Space>
          <div style={{ marginBottom: 12 }}>
            <label style={{ cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={autoSendEnabled}
                onChange={(e) => setAutoSendEnabled(e.target.checked)}
                style={{ marginRight: 8 }}
              />
              <Text type="secondary">同步时自动发送上传链接给新客户（需要先连接 Etsy 账号）</Text>
            </label>
          </div>

          <Divider orientation="left" plain style={{ fontSize: 13 }}>Etsy 消息发送（OAuth 2.0）</Divider>

          {/* OAuth 连接状态 */}
          <Descriptions column={1} size="small" bordered style={{ marginBottom: 12 }}>
            <Descriptions.Item label="消息发送状态">
              {oauthStatus?.connected ? (
                <Tag color="green">已授权</Tag>
              ) : oauthStatus?.configured ? (
                <Tag color="orange">未授权</Tag>
              ) : (
                <Tag color="red">未配置</Tag>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="状态信息">{oauthStatus?.message || '检测中...'}</Descriptions.Item>
          </Descriptions>
          <Space>
            {oauthStatus?.connected ? (
              <>
                <Button type="primary" icon={<SendOutlined />} onClick={handleConnectEtsy}>
                  重新授权
                </Button>
                <Button danger icon={<ApiOutlined />} onClick={handleDisconnectEtsy}>
                  断开连接
                </Button>
              </>
            ) : (
              <Button
                type="primary"
                icon={<SendOutlined />}
                loading={oauthLoading}
                onClick={handleConnectEtsy}
                disabled={!oauthStatus?.configured}
              >
                连接 Etsy 账号
              </Button>
            )}
            <Button onClick={checkOAuth}>刷新状态</Button>
          </Space>

          <div style={{ marginTop: 12, padding: 12, background: '#f6f8fa', borderRadius: 6, fontSize: 12, lineHeight: 1.8 }}>
            <Text type="secondary">
              <strong>配置指南：</strong><br />
              1. 前往 <a href="https://developers.etsy.com/" target="_blank" rel="noopener noreferrer">Etsy Developers</a> 注册应用<br />
              2. 获取 Client ID (Keystring) 和 Client Secret (Shared Secret)<br />
              3. 在应用设置中添加回调地址：<code>{process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://localhost:3001'}/api/etsy-oauth/callback</code><br />
              4. 在 <code>.env</code> 文件中配置 <code>ETSY_CLIENT_ID</code> 和 <code>ETSY_CLIENT_SECRET</code><br />
              5. 回到此页面点击"连接 Etsy 账号"完成授权<br />
              6. 授权后即可在订单详情页一键发送上传链接给客户
            </Text>
          </div>

          <div style={{ marginTop: 12, padding: 12, background: '#fffbe6', borderRadius: 6, fontSize: 12 }}>
            <Text type="warning">提示：请先在 .env 文件中配置 ETSY_API_KEY 和 ETSY_SHOP_ID。当前使用演示数据。</Text>
          </div>
        </Card>
      </>}

      <Card title="个人信息"
        extra={<Space><Button icon={<EditOutlined />} onClick={handleOpenProfileEdit}>编辑信息</Button><Button icon={<LockOutlined />} onClick={() => setPasswordModal(true)}>修改密码</Button></Space>}>
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label="用户名">{user?.username}</Descriptions.Item>
          <Descriptions.Item label="姓名">{user?.name}</Descriptions.Item>
          <Descriptions.Item label="角色"><Tag color={user?.role === 'admin' ? 'blue' : 'green'}>{user?.role === 'admin' ? '管理员' : '供应商'}</Tag></Descriptions.Item>
          <Descriptions.Item label="邮箱">{user?.email || '-'}</Descriptions.Item>
          <Descriptions.Item label="电话">{user?.phone || '-'}</Descriptions.Item>
        </Descriptions>
      </Card>

      {/* 创建账号 */}
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

      {/* 修改密码 */}
      <Modal title={<Space><LockOutlined />修改密码</Space>} open={passwordModal} onCancel={() => { setPasswordModal(false); passwordForm.resetFields(); }} footer={null} width={400}>
        <Form form={passwordForm} layout="vertical" onFinish={handleChangePassword}>
          <Form.Item name="oldPassword" label="原密码" rules={[{ required: true, message: '请输入原密码' }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="newPassword" label="新密码" rules={[
            { required: true, message: '请输入新密码' },
            { min: 6, message: '密码至少6位' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('oldPassword') !== value) return Promise.resolve();
                return Promise.reject(new Error('新密码不能与原密码相同'));
              },
            }),
          ]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="confirmPassword" label="确认新密码" dependencies={['newPassword']} rules={[
            { required: true, message: '请确认新密码' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                return Promise.reject(new Error('两次输入的密码不一致'));
              },
            }),
          ]}>
            <Input.Password />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={passwordLoading}>确认修改</Button>
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑个人信息 */}
      <Modal title={<Space><EditOutlined />编辑个人信息</Space>} open={profileModal} onCancel={() => setProfileModal(false)} footer={null} width={450}>
        <Form form={profileForm} layout="vertical" onFinish={handleUpdateProfile}>
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="邮箱">
            <Input type="email" />
          </Form.Item>
          <Form.Item name="phone" label="电话">
            <Input />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={profileLoading}>保存修改</Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
