// pages/api/proxyNat.js
export default async function handler(req, res) {
  try {
    // 🔥 新增：获取客户端的真实 IP
    // Vercel 会把用户的真实 IP 放在请求头里
    let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    // 如果有多个代理，IP 可能会是逗号分隔的列表，取第一个
    if (clientIp && clientIp.includes(',')) {
        clientIp = clientIp.split(',')[0].trim();
    }

    // 🔴 请务必保留你之前填写正确的 VPS 地址
    const vpsApiUrl = 'http://YOUR_VPS_DOMAIN_OR_IP:5000/nat';

    // Vercel 服务器帮你去请求 HTTP 的 VPS
    const response = await fetch(vpsApiUrl, {
        // 🔥 新增：通过自定义请求头，把客户端的真实 IP 带给 VPS
        headers: {
            'X-Real-Client-IP': clientIp
        }
    });

    if (!response.ok) {
      throw new Error(`VPS error: ${response.status}`);
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    console.error("Proxy Error:", err.message);
    res.status(500).json({
      success: false,
      message: process.env.NODE_ENV === 'development' ? err.message : '无法连接到检测服务器'
    });
  }
}
