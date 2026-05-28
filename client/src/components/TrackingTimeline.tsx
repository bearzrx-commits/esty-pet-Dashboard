import React, { useEffect, useState } from 'react';
import { Modal, Timeline, Tag, Spin, Empty, Button, message, Typography, Space, Descriptions } from 'antd';
import { CarOutlined, ReloadOutlined, CheckCircleOutlined, ClockCircleOutlined, ExclamationCircleOutlined, SendOutlined } from '@ant-design/icons';
import { logisticsApi } from '../api';

const { Text, Title } = Typography;

interface TrackEvent {
  time: string;
  context: string;
  location: string;
}

interface TrackingResult {
  success: boolean;
  carrier?: string;
  trackingNumber?: string;
  state?: number;
  stateLabel?: string;
  internalStatus?: string;
  tracks: TrackEvent[];
  message?: string;
}

interface Props {
  logisticsId: string;
  carrier: string;
  trackingNumber: string;
  visible: boolean;
  onClose: () => void;
}

const stateIcons: Record<string, React.ReactNode> = {
  '3': <CheckCircleOutlined style={{ color: '#52c41a' }} />,     // 签收
  '1': <SendOutlined style={{ color: '#1890ff' }} />,           // 揽收
  '5': <CarOutlined style={{ color: '#722ed1' }} />,             // 派送
  '0': <CarOutlined style={{ color: '#1890ff' }} />,             // 在途
  '2': <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />, // 异常
  '4': <ExclamationCircleOutlined style={{ color: '#faad14' }} />, // 退签
  '6': <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />, // 退回
};

const stateColors: Record<string, string> = {
  '3': 'green',
  '1': 'blue',
  '5': 'purple',
  '0': 'blue',
  '2': 'red',
  '4': 'orange',
  '6': 'red',
  '201': 'blue',
};

export default function TrackingTimeline({ logisticsId, carrier, trackingNumber, visible, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [tracking, setTracking] = useState<TrackingResult | null>(null);
  const [syncing, setSyncing] = useState(false);

  const fetchTracking = async () => {
    setLoading(true);
    try {
      const data = await logisticsApi.queryTracking(logisticsId);
      setTracking(data);
    } catch (err: any) {
      message.error(err.response?.data?.error || '查询物流轨迹失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const data = await logisticsApi.syncTracking(logisticsId);
      if (data.success) {
        if (data.updated) {
          message.success(`物流状态已自动更新：${({ pending: '待发货', picked_up: '已揽收', in_transit: '运输中', delivered: '已签收', exception: '异常' })[data.currentStatus] || data.currentStatus}`);
        } else {
          message.info('物流状态无变化');
        }
        // 刷新轨迹数据
        await fetchTracking();
      } else {
        message.warning(data.message || '同步失败');
      }
    } catch (err: any) {
      message.error(err.response?.data?.error || '同步失败');
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (visible && logisticsId) {
      fetchTracking();
    }
  }, [visible, logisticsId]);

  return (
    <Modal
      title={
        <Space>
          <CarOutlined />
          <span>物流轨迹</span>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      footer={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchTracking} loading={loading}>
            刷新轨迹
          </Button>
          <Button type="primary" icon={<ReloadOutlined />} onClick={handleSync} loading={syncing}>
            同步状态
          </Button>
        </Space>
      }
      width={600}
      destroyOnClose
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16, color: '#999' }}>正在查询轨迹...</div>
        </div>
      ) : tracking?.success && tracking.tracks?.length > 0 ? (
        <div>
          {/* 物流概要 */}
          <Descriptions size="small" column={2} bordered style={{ marginBottom: 16 }}>
            <Descriptions.Item label="物流商">{carrier}</Descriptions.Item>
            <Descriptions.Item label="运单号">{trackingNumber}</Descriptions.Item>
            <Descriptions.Item label="当前状态">
              <Tag color={stateColors[String(tracking.state)] || 'default'}>
                {tracking.stateLabel || '运输中'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="轨迹数量">{tracking.tracks.length} 条</Descriptions.Item>
          </Descriptions>

          {/* 轨迹时间线 */}
          <div style={{ maxHeight: 400, overflowY: 'auto', padding: '0 8px' }}>
            <Timeline
              items={tracking.tracks.map((event, index) => ({
                dot: index === 0 ? (stateIcons[String(tracking.state)] || <ClockCircleOutlined />) : undefined,
                color: index === 0 ? (stateColors[String(tracking.state)] || 'blue') : 'gray',
                children: (
                  <div>
                    <Text strong style={{ fontSize: 13 }}>{event.context}</Text>
                    <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
                      {event.time}
                      {event.location ? ` · ${event.location}` : ''}
                    </div>
                  </div>
                ),
              }))}
            />
          </div>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Empty description={
            <div>
              <div>暂无物流轨迹信息</div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {tracking?.message || '请确认运单号是否正确，或稍后重试'}
              </Text>
            </div>
          } />
        </div>
      )}
    </Modal>
  );
}
