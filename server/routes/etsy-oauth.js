/**
 * Etsy OAuth 2.0 认证路由
 *
 * 使用流程:
 * 1. 管理员访问 /api/etsy-oauth/authorize 获取授权链接
 * 2. 跳转到 Etsy 授权页面，登录并授权
 * 3. Etsy 回调到 /api/etsy-oauth/callback 完成令牌交换
 * 4. 之后可以通过 /api/etsy-oauth/send-message 发送消息
 */
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const etsyOAuth = require('../services/etsyOAuth');

const router = express.Router();

// 工具函数：从请求中获取当前部署的基础 URL（自动适配本地开发和 Vercel 生产环境）
function getBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${proto}://${host}`;
}

// ========== OAuth 流程 ==========

/**
 * 获取 Etsy OAuth 授权链接
 * 管理员点击后跳转到 Etsy 登录授权页面
 */
router.get('/authorize-url', authenticate, requireAdmin, async (req, res) => {
  try {
    if (!etsyOAuth.isConfigured()) {
      return res.status(400).json({
        error: 'Etsy Client ID 和 Client Secret 未配置',
        hint: '请在 .env 文件中设置 ETSY_CLIENT_ID 和 ETSY_CLIENT_SECRET',
      });
    }

    // 生成 state 用于 CSRF 防护
    const state = crypto.randomBytes(16).toString('hex');
    const redirectUri = etsyOAuth.getRedirectUri(getBaseUrl(req));
    const authUrl = etsyOAuth.getAuthorizationUrl(state, redirectUri);
    res.json({ url: authUrl, redirect_uri: redirectUri, state });
  } catch (err) {
    console.error('Etsy OAuth authorize error:', err);
    res.status(500).json({ error: '获取授权链接失败' });
  }
});

/**
 * Etsy OAuth 回调处理
 * 用户在 Etsy 完成授权后跳转回此地址
 * 前端应在 Settings 页面嵌入一个监听标签页或使用轮询检查状态
 */
router.get('/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.send(`
        <html><body style="font-family:sans-serif;padding:40px;text-align:center">
          <h2>Etsy 授权失败</h2>
          <p>用户取消了授权或发生错误: ${error}</p>
          <p><a href="/settings">返回设置页面</a></p>
        </body></html>
      `);
    }

    if (!code || !state) {
      return res.status(400).send(`
        <html><body style="font-family:sans-serif;padding:40px;text-align:center">
          <h2>Etsy 授权失败</h2>
          <p>缺少必要参数 (code 或 state)</p>
          <p><a href="/settings">返回设置页面</a></p>
        </body></html>
      `);
    }

    // 交换授权码为令牌（redirect_uri 必须与授权时的完全一致）
    const redirectUri = etsyOAuth.getRedirectUri(getBaseUrl(req));
    const tokenData = await etsyOAuth.exchangeCode(code, redirectUri);

    // 保存令牌
    await etsyOAuth.saveToken(tokenData);

    // 尝试获取店铺信息并存起来
    try {
      const accessToken = await etsyOAuth.getValidAccessToken();
      const userResponse = await require('axios').get('https://openapi.etsy.com/v3/application/users/me', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-api-key': etsyOAuth.getClientId(),
        },
      });
      const userId = userResponse.data?.user_id;
      console.log('[Etsy OAuth] 用户 ID:', userId);
    } catch (e) {
      console.warn('[Etsy OAuth] 获取用户信息失败（非关键错误）:', e.message);
    }

    // 返回成功页面（前端轮询检测到已连接）
    res.send(`
      <html><body style="font-family:sans-serif;padding:40px;text-align:center">
        <h2 style="color:#52c41a">✓ Etsy 授权成功！</h2>
        <p>现在可以发送消息给买家了。</p>
        <p>请关闭此页面，返回后台系统继续操作。</p>
        <script>
          // 尝试通知打开此页面的窗口
          if (window.opener) {
            window.opener.postMessage({ type: 'ETSY_OAUTH_SUCCESS' }, '*');
          }
          setTimeout(() => window.close(), 3000);
        </script>
      </body></html>
    `);
  } catch (err) {
    console.error('Etsy OAuth callback error:', err);
    res.status(500).send(`
      <html><body style="font-family:sans-serif;padding:40px;text-align:center">
        <h2>Etsy 授权失败</h2>
        <p>令牌交换失败: ${err.message}</p>
        <p><a href="/settings">返回设置页面重试</a></p>
      </body></html>
    `);
  }
});

// ========== 状态管理 ==========

/**
 * 检查 Etsy OAuth 连接状态
 */
router.get('/status', authenticate, requireAdmin, async (req, res) => {
  try {
    const status = await etsyOAuth.getStatus();
    res.json(status);
  } catch (err) {
    console.error('Etsy OAuth status error:', err);
    res.status(500).json({ error: '检查状态失败' });
  }
});

/**
 * 断开 Etsy OAuth 连接
 */
router.post('/disconnect', authenticate, requireAdmin, async (req, res) => {
  try {
    await etsyOAuth.disconnect();
    res.json({ success: true, message: '已断开 Etsy 连接' });
  } catch (err) {
    console.error('Etsy OAuth disconnect error:', err);
    res.status(500).json({ error: '断开连接失败' });
  }
});

// ========== 消息发送 ==========

/**
 * 发送 Etsy Conversations 消息给买家
 * Body: { orderId, recipientUserId, subject, message }
 *
 * 如果提供了 orderId，会自动将上传链接附加到消息中
 */
router.post('/send-message', authenticate, requireAdmin, async (req, res) => {
  try {
    const { orderId, recipientUserId, subject, message, shopId } = req.body;

    if (!recipientUserId || !subject || !message) {
      return res.status(400).json({ error: '缺少必要参数: recipientUserId, subject, message' });
    }

    const etsyShopId = shopId || process.env.ETSY_SHOP_ID;
    if (!etsyShopId) {
      return res.status(400).json({ error: 'Etsy Shop ID 未配置, 请在 .env 中设置 ETSY_SHOP_ID' });
    }

    const result = await etsyOAuth.sendConversationMessage(
      etsyShopId, recipientUserId, subject, message
    );

    // 记录日志
    if (orderId) {
      try {
        const { v4: uuidv4 } = require('uuid');
        await db.insert('activity_log', {
          id: 'act-' + uuidv4().slice(0, 8),
          order_id: orderId,
          action: 'Etsy 消息发送',
          details: `通过 Etsy Conversations 发送消息给买家 (conversation_id: ${result?.conversation_id || 'unknown'})`,
        });
      } catch (e) { /* ignore log error */ }
    }

    res.json({ success: true, message: '消息已发送', data: result });
  } catch (err) {
    console.error('Etsy send message error:', err);
    const errorMsg = err.response?.data?.message || err.message;
    res.status(500).json({ error: `发送消息失败: ${errorMsg}` });
  }
});

/**
 * 生成上传链接并通过 Etsy 消息发送给买家（一键操作）
 * Body: { orderId, recipientUserId }
 */
router.post('/send-upload-link', authenticate, requireAdmin, async (req, res) => {
  try {
    const { orderId, recipientUserId } = req.body;
    if (!orderId || !recipientUserId) {
      return res.status(400).json({ error: '缺少必要参数: orderId, recipientUserId' });
    }

    // 1. 获取订单信息
    const order = await db.queryOne('orders', { where: { id: orderId } });
    if (!order) return res.status(404).json({ error: '订单不存在' });

    // 2. 生成上传 token（或使用已有）
    const supabase = require('../supabase');
    const { v4: uuidv4 } = require('uuid');
    const crypto = require('crypto');

    let uploadToken, uploadUrl;
    const { data: existingToken } = await supabase
      .from('upload_tokens')
      .select('*')
      .eq('order_id', orderId)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1);

    if (existingToken && existingToken.length > 0) {
      uploadToken = existingToken[0].token;
    } else {
      const token = crypto.randomBytes(24).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      await db.insert('upload_tokens', {
        id: 'tok-' + uuidv4().slice(0, 8),
        order_id: orderId,
        token,
        expires_at: expiresAt,
      });
      uploadToken = token;
    }
    const baseUrl = process.env.UPLOAD_BASE_URL || getBaseUrl(req);
    uploadUrl = `${baseUrl}/upload?token=${uploadToken}`;

    // 3. 获取客户名称
    let customerName = '客户';
    if (order.customer_id) {
      const customer = await db.queryOne('customers', { where: { id: order.customer_id } });
      if (customer) customerName = customer.name || customerName;
    }

    // 4. 构造消息内容
    const subject = `关于订单 ${order.order_number} 的定制图片上传`;
    const message = `您好 ${customerName}，

感谢您在 Etsy 订购我们的定制产品。

请通过以下链接上传您需要定制的图片（款式、图案、文字等）：
${uploadUrl}

链接有效期 7 天，请尽快上传。
如有任何问题，请通过 Etsy 消息回复我们。

谢谢！
${process.env.SHOP_NAME || '店铺团队'}`;

    // 5. 发送 Etsy 消息
    const etsyShopId = process.env.ETSY_SHOP_ID;
    if (!etsyShopId) {
      return res.status(400).json({ error: 'Etsy Shop ID 未配置' });
    }

    const result = await etsyOAuth.sendConversationMessage(
      etsyShopId, recipientUserId, subject, message
    );

    // 6. 记录日志
    await db.insert('activity_log', {
      id: 'act-' + uuidv4().slice(0, 8),
      order_id: orderId,
      action: 'Etsy 消息发送-上传链接',
      details: `通过 Etsy Conversations 发送图片上传链接给买家 (conversation_id: ${result?.conversation_id || 'unknown'})`,
    });

    res.json({
      success: true,
      message: '上传链接已通过 Etsy 消息发送给客户',
      data: {
        conversation_id: result?.conversation_id,
        upload_url: uploadUrl,
        token: uploadToken,
      },
    });
  } catch (err) {
    console.error('Etsy send upload link error:', err);
    const errorMsg = err.response?.data?.message || err.message;
    res.status(500).json({ error: `发送失败: ${errorMsg}` });
  }
});

module.exports = router;
