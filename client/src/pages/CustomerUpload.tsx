import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Card, Typography, message, Spin, Upload, Space, Image, Progress, Result, Steps, Empty, Tag } from 'antd';
import { InboxOutlined, CheckCircleOutlined, UploadOutlined, ClockCircleOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;
const { Dragger } = Upload;

const UPLOAD_API = process.env.REACT_APP_API_URL || '/api';

export default function CustomerUpload() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [orderInfo, setOrderInfo] = useState<any>(null);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'verify' | 'upload' | 'done'>('verify');
  const [fileList, setFileList] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<any[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);

  useEffect(() => {
    if (!token) {
      setError('缺少上传令牌');
      setLoading(false);
      return;
    }
    verifyToken();
  }, [token]);

  const verifyToken = async () => {
    try {
      const res = await fetch(`${UPLOAD_API}/customer-upload/info/${token}`);
      const data = await res.json();
      if (!res.ok || data.error) { setError(data.error || '链接无效'); return; }
      if (data.used) { setError('此上传链接已被使用'); return; }
      if (data.expired) { setError('上传链接已过期，请联系卖家重新获取'); return; }
      setOrderInfo(data);
      setStep('upload');
    } catch (e) {
      setError('验证链接失败，请检查链接是否正确');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (info: any) => {
    let files = [...info.fileList];
    // 限制最多10张
    if (files.length > 10) {
      files = files.slice(0, 10);
      message.warning('最多上传 10 张图片');
    }
    setFileList(files);

    // 生成预览
    const urls: string[] = [];
    files.forEach(file => {
      if (file.originFileObj) {
        urls.push(URL.createObjectURL(file.originFileObj));
      }
    });
    setPreviewUrls(urls);
  };

  const handleUpload = async () => {
    if (fileList.length === 0) {
      message.warning('请先选择要上传的图片');
      return;
    }

    setUploading(true);
    try {
      // 将图片转为 Base64
      const images = await Promise.all(
        fileList.map(async (file, index) => {
          const base64 = await fileToBase64(file.originFileObj);
          return { data: base64, description: `定制图片 ${index + 1}` };
        })
      );

      const res = await fetch(`${UPLOAD_API}/customer-upload/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, images }),
      });

      const result = await res.json();
      if (!res.ok || result.error) {
        throw new Error(result.error || '上传失败');
      }

      setUploadedImages(result.images || []);
      setStep('done');
      message.success(result.message || '上传成功！');
    } catch (err: any) {
      message.error(err.message || '上传失败，请重试');
    } finally {
      setUploading(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
    });
  };

  const beforeUpload = (file: File) => {
    const isImage = file.type.startsWith('image/');
    if (!isImage) {
      message.error('只能上传图片文件');
      return Upload.LIST_IGNORE;
    }
    const isLt10M = file.size / 1024 / 1024 < 10;
    if (!isLt10M) {
      message.error('图片大小不能超过 10MB');
      return Upload.LIST_IGNORE;
    }
    return false; // 阻止自动上传
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#f5f5f5', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Spin size="large" tip="正在验证上传链接..." />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: '#f5f5f5', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <Card style={{ maxWidth: 500, width: '100%', textAlign: 'center' }}>
          <Result
            status="error"
            title="上传失败"
            subTitle={error}
            extra={<Button type="primary" onClick={() => window.location.href = '/'}>返回首页</Button>}
          />
        </Card>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', padding: '40px 16px' }}>
      <Card style={{ maxWidth: 700, margin: '0 auto' }}>
        {/* 头部 */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Title level={3} style={{ marginBottom: 8 }}>
            <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />
            上传定制图片
          </Title>
          {orderInfo && (
            <div style={{ color: '#666' }}>
              <Text>订单号：<Text strong>{orderInfo.order_number}</Text></Text>
              <br />
              <Text>客户：<Text strong>{orderInfo.customer_name}</Text></Text>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>
                链接有效期至：{new Date(orderInfo.expires_at).toLocaleDateString('zh-CN')}
              </Text>
            </div>
          )}
        </div>

        {/* 步骤指示 */}
        <Steps
          current={step === 'verify' ? 0 : step === 'upload' ? 0 : 1}
          size="small"
          style={{ marginBottom: 32 }}
          items={[
            { title: '选择并上传图片', description: '支持 JPG/PNG，最多10张' },
            { title: '上传完成', description: '等待卖家确认' },
          ]}
        />

        {step === 'upload' && (
          <>
            <Dragger
              multiple
              fileList={fileList}
              onChange={handleFileChange}
              beforeUpload={beforeUpload}
              listType="picture-card"
              accept="image/*"
              style={{ background: '#fafafa', border: '2px dashed #d9d9d9', borderRadius: 8 }}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">点击或拖拽图片到此区域上传</p>
              <p className="ant-upload-hint">
                支持 JPG、PNG、GIF 格式，每张不超过 10MB，最多 10 张
              </p>
            </Dragger>

            {fileList.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <Text strong>已选择 {fileList.length} 张图片：</Text>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                  {previewUrls.map((url, i) => (
                    <Image key={i} src={url} width={80} height={80} style={{ borderRadius: 6, objectFit: 'cover' }} />
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginTop: 24, textAlign: 'center' }}>
              <Button
                type="primary"
                size="large"
                icon={<UploadOutlined />}
                onClick={handleUpload}
                loading={uploading}
                disabled={fileList.length === 0}
                style={{ height: 44, padding: '0 40px', fontSize: 16 }}
              >
                {uploading ? '上传中...' : `提交 ${fileList.length} 张图片`}
              </Button>
              {uploading && (
                <div style={{ marginTop: 12 }}>
                  <Text type="secondary">正在上传，请耐心等待...</Text>
                </div>
              )}
            </div>
          </>
        )}

        {step === 'done' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <Result
              status="success"
              title="上传成功！"
              subTitle={`您已成功上传 ${uploadedImages.length} 张定制图片，卖家将尽快开始生产。`}
              extra={[
                <Typography.Text key="note" type="secondary">
                  如有问题请通过 Etsy 订单消息联系卖家
                </Typography.Text>,
              ]}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 16 }}>
              {uploadedImages.map((img: any, i: number) => (
                <Image
                  key={i}
                  src={img.image_url}
                  width={120}
                  style={{ borderRadius: 8, objectFit: 'cover' }}
                />
              ))}
            </div>
          </div>
        )}
      </Card>

      <div style={{ textAlign: 'center', marginTop: 16 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Powered by Etsy Admin Dashboard
        </Text>
      </div>
    </div>
  );
}
