// pages/api/proxyNat.js
export default async function handler(req, res) {
  try {
    // 🔴 请在这里填写你的 VPS 实际 HTTP 地址和端口
    const vpsApiUrl = 'http://nat.laogaofenxiang.com:5000/nat';

    // Vercel 服务器帮你去请求 HTTP 的 VPS
    const response = await fetch(vpsApiUrl);

    if (!response.ok) {
      throw new Error(`VPS error: ${response.status}`);
    }

    const data = await response.json();
    // 将 VPS 返回的数据原样返回给前端
    res.status(200).json(data);
  } catch (err) {
    console.error("Proxy Error:", err.message);
    // 如果连接不上 VPS，返回错误信息
    res.status(500).json({
      success: false,
      // 如果是开发环境，显示详细错误，生产环境显示通用错误
      message: process.env.NODE_ENV === 'development' ? err.message : '无法连接到检测服务器'
    });
  }
}
