/**
 * Etsy OAuth 2.0 认证服务
 *
 * 使用前需要在 https://developers.etsy.com/ 注册应用:
 * 1. 创建应用获取 Client ID (Keystring) 和 Client Secret (Shared Secret)
 * 2. 在应用设置中添加 Redirect URI，例如:
 *    - 开发环境: http://localhost:3001/api/etsy-oauth/callback
 *    - 生产环境: https://你的域名.com/api/etsy-oauth/callback
 * 3. 在 .env 中配置 ETSY_CLIENT_ID, ETSY_CLIENT_SECRET, ETSY_OAUTH_REDIRECT_URI
 * 4. 第一次使用时，管理员在 Settings 页面点击"连接 Etsy 账号"完成授权
 */
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const supabase = require('../supabase');

class EtsyOAuthService {
  getClientId() {
    return process.env.ETSY_CLIENT_ID || '';
  }

  getClientSecret() {
    return process.env.ETSY_CLIENT_SECRET || '';
  }

  /**
   * 获取回调地址，优先从参数获取（动态），其次读取 .env 配置（手动覆盖）
   * @param {string} [baseUrl] - 可选，从请求动态计算的基础地址
   * @returns {string}
   */
  getRedirectUri(baseUrl) {
    // 如果传入了动态 baseUrl，则使用它拼接回调路径
    if (baseUrl) {
      return `${baseUrl.replace(/\/+$/, '')}/api/etsy-oauth/callback`;
    }
    // 否则回退到 .env 配置或默认值
    return process.env.ETSY_OAUTH_REDIRECT_URI ||
      `http://localhost:3001/api/etsy-oauth/callback`;
  }

  isConfigured() {
    return !!(this.getClientId() && this.getClientSecret());
  }

  /**
   * 生成 Etsy OAuth 授权链接
   * @param {string} state - 防 CSRF 随机字符串
   * @param {string} [redirectUri] - 可选，动态回调地址
   * @returns {string} 授权 URL
   */
  getAuthorizationUrl(state, redirectUri) {
    const params = new URLSearchParams({
      client_id: this.getClientId(),
      redirect_uri: redirectUri || this.getRedirectUri(),
      response_type: 'code',
      scope: 'transactions_r listings_r shops_r profile_r email_r conversations_w',
      state,
    });
    return `https://www.etsy.com/oauth/connect?${params.toString()}`;
  }

  /**
   * 用授权码交换访问令牌
   * @param {string} code - 授权码
   * @param {string} [redirectUri] - 可选，回调地址（必须与授权请求一致）
   * @returns {Promise<object>} { access_token, refresh_token, expires_in, token_type }
   */
  async exchangeCode(code, redirectUri) {
    const credentials = Buffer.from(`${this.getClientId()}:${this.getClientSecret()}`).toString('base64');
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.getClientId(),
      redirect_uri: redirectUri || this.getRedirectUri(),
      code,
    });
    const response = await axios.post('https://api.etsy.com/v3/public/oauth/token',
      params.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentials}`,
        },
      }
    );
    return response.data;
  }

  /**
   * 刷新访问令牌
   * @param {string} refreshToken
   * @returns {Promise<object>} { access_token, refresh_token?, expires_in, token_type }
   */
  async refreshAccessToken(refreshToken) {
    const credentials = Buffer.from(`${this.getClientId()}:${this.getClientSecret()}`).toString('base64');
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.getClientId(),
      refresh_token: refreshToken,
    });
    const response = await axios.post('https://api.etsy.com/v3/public/oauth/token',
      params.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentials}`,
        },
      }
    );
    return response.data;
  }

  /**
   * 获取存储的令牌（最新一条）
   * @returns {Promise<object|null>}
   */
  async getStoredToken() {
    const { data } = await supabase
      .from('etsy_oauth_tokens')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);
    const records = data || [];
    return records[0] || null;
  }

  /**
   * 保存 OAuth 令牌到数据库
   * @param {object} tokenData
   */
  async saveToken(tokenData) {
    const existing = await this.getStoredToken();
    const payload = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString(),
      token_type: tokenData.token_type || 'Bearer',
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      // 保留旧的 refresh_token 如果新的没有提供
      if (!payload.refresh_token && existing.refresh_token) {
        payload.refresh_token = existing.refresh_token;
      }
      const { error } = await supabase
        .from('etsy_oauth_tokens')
        .update(payload)
        .eq('id', existing.id);
      if (error) throw error;
      return { ...existing, ...payload };
    } else {
      const newRecord = {
        id: 'ea-' + uuidv4().slice(0, 8),
        ...payload,
        created_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from('etsy_oauth_tokens')
        .insert(newRecord);
      if (error) throw error;
      return newRecord;
    }
  }

  /**
   * 获取有效的访问令牌（自动处理过期刷新）
   * @returns {Promise<string|null>}
   */
  async getValidAccessToken() {
    const token = await this.getStoredToken();
    if (!token) return null;

    // 检查是否过期（提前5分钟刷新）
    const fiveMinFromNow = new Date(Date.now() + 5 * 60 * 1000);
    if (new Date(token.expires_at) <= fiveMinFromNow) {
      try {
        console.log('[Etsy OAuth] 令牌过期，尝试刷新...');
        const refreshed = await this.refreshAccessToken(token.refresh_token);
        await this.saveToken(refreshed);
        console.log('[Etsy OAuth] 令牌刷新成功');
        return refreshed.access_token;
      } catch (err) {
        console.error('[Etsy OAuth] 令牌刷新失败:', err.message);
        return null;
      }
    }
    return token.access_token;
  }

  /**
   * 删除存储的所有令牌（断开连接）
   */
  async disconnect() {
    const { error } = await supabase
      .from('etsy_oauth_tokens')
      .delete()
      .neq('id', 'none'); // 删除所有
    if (error) throw error;
  }

  /**
   * 检查 OAuth 状态
   * @returns {Promise<object>}
   */
  async getStatus() {
    if (!this.isConfigured()) {
      return { connected: false, configured: false, message: '未配置 Etsy Client ID / Secret，请在 .env 中设置' };
    }
    const token = await this.getStoredToken();
    if (!token) {
      return { connected: false, configured: true, message: '已配置但尚未授权，请点击连接按钮完成授权' };
    }
    const expired = new Date(token.expires_at) <= new Date();
    return {
      connected: !expired,
      configured: true,
      has_token: true,
      message: expired ? '令牌已过期，需要重新授权' : '已连接 Etsy 账号',
    };
  }

  /**
   * 从 Etsy API 获取店铺信息（使用 OAuth 令牌获取当前用户店铺）
   * @returns {Promise<object>}
   */
  async getUserShop() {
    const accessToken = await this.getValidAccessToken();
    if (!accessToken) throw new Error('未授权 Etsy');

    // 先获取用户信息
    const userResponse = await axios.get('https://openapi.etsy.com/v3/application/users/me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'x-api-key': this.getClientId(),
      },
    });
    const userId = userResponse.data?.user_id;

    // 获取店铺信息
    const shopResponse = await axios.get(`https://openapi.etsy.com/v3/application/users/${userId}/shops`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'x-api-key': this.getClientId(),
      },
    });
    const shops = shopResponse.data?.results || [];
    return shops[0] || null;
  }

  /**
   * 通过 Etsy Conversations API 发送消息给买家
   * @param {number|string} shopId - Etsy 店铺 ID
   * @param {number|string} recipientUserId - 买家用户 ID（Etsy user_id）
   * @param {string} subject - 消息主题
   * @param {string} message - 消息内容（纯文本）
   * @returns {Promise<object>} 发送结果
   */
  async sendConversationMessage(shopId, recipientUserId, subject, message) {
    const accessToken = await this.getValidAccessToken();
    if (!accessToken) {
      throw new Error('Etsy OAuth 未授权，请先在系统设置中连接 Etsy 账号');
    }

    const response = await axios.post(
      `https://openapi.etsy.com/v3/application/shops/${shopId}/conversations`,
      {
        recipient_user_id: Number(recipientUserId),
        subject: subject.substring(0, 200),
        message,
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-api-key': this.getClientId(),
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data;
  }
}

module.exports = new EtsyOAuthService();
