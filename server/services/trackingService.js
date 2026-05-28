/**
 * 快递100 物流轨迹查询服务
 * 文档：https://www.kuaidi100.com/openapi/
 */
const crypto = require('crypto');
const axios = require('axios');

// 快递公司名称 → 快递100编码映射（常用）
const CARRIER_CODES = {
  '顺丰': 'shunfeng',
  '顺丰速运': 'shunfeng',
  '申通': 'shentong',
  '申通快递': 'shentong',
  '圆通': 'yuantong',
  '圆通速递': 'yuantong',
  '中通': 'zhongtong',
  '中通快递': 'zhongtong',
  '韵达': 'yunda',
  '韵达快递': 'yunda',
  '百世': 'baishi',
  '百世快递': 'baishi',
  '极兔': 'jtexpress',
  '极兔速递': 'jtexpress',
  '京东': 'jd',
  '京东物流': 'jd',
  '邮政': 'ems',
  'EMS': 'ems',
  '德邦': 'debang',
  '德邦物流': 'debang',
  'DHL': 'dhl',
  'FedEx': 'fedex',
  'fedex': 'fedex',
  'UPS': 'ups',
  'ups': 'ups',
  'TNT': 'tnt',
  '美国邮政': 'usps',
  'USPS': 'usps',
};

/**
 * 根据物流商名称获取快递100 编码
 */
function getCarrierCode(carrierName) {
  if (!carrierName) return '';
  const trimmed = carrierName.trim();
  // 精确匹配
  if (CARRIER_CODES[trimmed]) return CARRIER_CODES[trimmed];
  // 模糊匹配：遍历查找包含关系
  for (const [key, code] of Object.entries(CARRIER_CODES)) {
    if (trimmed.includes(key) || key.includes(trimmed)) return code;
  }
  return trimmed; // 未知则直接传原名
}

/**
 * 生成快递100 API 签名
 */
function generateSign(param, key) {
  const raw = param + key;
  return crypto.createHash('md5').update(raw).digest('hex').toUpperCase();
}

/**
 * 查询物流轨迹（快递100 即时查询接口）
 * @param {string} carrierName - 物流商名称（如 顺丰速运）
 * @param {string} trackingNumber - 运单号
 * @returns {Object} { success, state, stateLabel, data, message }
 */
async function queryTracking(carrierName, trackingNumber) {
  const com = getCarrierCode(carrierName);
  if (!com || !trackingNumber) {
    return { success: false, message: '物流商或运单号不能为空' };
  }

  const customer = process.env.KUAIDI100_CUSTOMER;
  const key = process.env.KUAIDI100_KEY;

  // 如果有 API 凭据，使用官方接口
  if (customer && key) {
    try {
      const param = JSON.stringify({ com, num: trackingNumber, phone: '' });
      const sign = generateSign(param, key);

      const { data: result } = await axios.post(
        'https://poll.kuaidi100.com/poll/query.do',
        `customer=${encodeURIComponent(customer)}&sign=${encodeURIComponent(sign)}&param=${encodeURIComponent(param)}`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
      );

      if (result.result) {
        return formatTrackingResult(result.result);
      } else if (result.data) {
        return formatTrackingResult(result);
      }
      return { success: false, message: result.message || '查询失败' };
    } catch (err) {
      console.error('Kuaidi100 API error:', err.message);
      return { success: false, message: '物流查询服务暂时不可用' };
    }
  }

  // 无 API 凭据时尝试公开接口（有限制，仅用于演示）
  try {
    const { data } = await axios.get(
      `https://www.kuaidi100.com/query?type=${com}&postid=${trackingNumber}&id=1&valicode=&temp=0.1`,
      { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    if (data.data && data.data.length > 0) {
      return formatTrackingResult({
        com: data.com,
        nu: data.nu,
        state: data.state,
        data: data.data,
        message: data.message,
      });
    }
    return { success: false, message: '未查询到物流信息' };
  } catch (err) {
    console.error('Public tracking query error:', err.message);
    return { success: false, message: '查询失败，请在 .env 中配置 KUAIDI100_CUSTOMER 和 KUAIDI100_KEY' };
  }
}

/**
 * 快递100 状态 → 内部物流状态映射
 */
const STATE_MAP = {
  '0': 'in_transit',   // 在途
  '1': 'picked_up',    // 揽收
  '2': 'exception',    // 疑难
  '3': 'delivered',    // 签收
  '4': 'exception',    // 退签
  '5': 'in_transit',   // 派件
  '6': 'exception',    // 退回
  '201': 'in_transit', // 到达派件城市
};

const STATE_LABELS = {
  '0': '运输中',
  '1': '已揽收',
  '2': '异常',
  '3': '已签收',
  '4': '已退签',
  '5': '派送中',
  '6': '退回中',
  '201': '到达派件城市',
};

function formatTrackingResult(result) {
  if (!result || !result.data) {
    return { success: false, message: '暂无物流轨迹' };
  }

  const tracks = result.data
    .map((item) => ({
      time: item.ftime || item.time,
      context: item.context,
      location: item.location || '',
    }))
    .sort((a, b) => new Date(b.time) - new Date(a.time)); // 最新的在前

  const state = String(result.state || '0');
  return {
    success: true,
    carrier: result.com,
    trackingNumber: result.nu,
    state: parseInt(result.state),
    stateLabel: STATE_LABELS[state] || '运输中',
    internalStatus: STATE_MAP[state] || 'in_transit',
    tracks,
    message: result.message || 'ok',
  };
}

module.exports = { queryTracking, getCarrierCode };
