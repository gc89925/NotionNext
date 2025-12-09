// pages/nat.js
import { useState } from 'react';

export default function NAT() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const testNat = async () => {
    setLoading(true);
    setResult(null);
    setErrorMsg('');

    try {
      // 请求我们自己的代理 API
      const res = await fetch('/api/proxyNat');
      const data = await res.json();

      if (res.status !== 200) {
        throw new Error(data.message || '请求失败');
      }

      // 假设你的 VPS 返回的格式包含 results 数组
      // 需要根据你实际 VPS 返回的 JSON 结构进行微调
      let natType = data.nat_type || '未知';
      let publicIp = '未知';
      let publicPort = '未知';

      // 尝试解析 results 数组 (例如 ["本地端口:公网IP:公网端口"])
      if (data.results && data.results.length > 0) {
        const parts = data.results[0].split(':');
        if (parts.length >= 2) publicIp = parts[1];
        if (parts.length >= 3) publicPort = parts[2];
      }
      // 如果 VPS 直接返回了 public_ip 字段，则优先使用
      if (data.public_ip) publicIp = data.public_ip;
      if (data.public_port) publicPort = data.public_port;

      setResult({ natType, publicIp, publicPort });

    } catch (e) {
      setErrorMsg(e.message || '检测失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  }

  // 根据 NAT 类型返回简单的颜色标记
  const getColor = (type) => {
    const t = type?.toLowerCase() || '';
    if (t.includes('full')) return 'green';
    if (t.includes('restricted')) return 'orange';
    if (t.includes('symmetric')) return 'red';
    return 'gray';
  }

  return (
    <div className="container">
      <div className="card">
        <h1>NAT 类型检测</h1>
        <p style={{ color: '#666', marginBottom: '20px' }}>点击按钮远程检测您的网络环境</p>

        <button onClick={testNat} disabled={loading} className="btn">
          {loading ? '正在检测中...' : '开始检测'}
        </button>

        {errorMsg && (
          <div style={{ color: 'red', marginTop: '20px', padding: '10px', background: '#ffe6e6', borderRadius: '5px' }}>
            {errorMsg}
          </div>
        )}

        {result && (
          <div className="result-box">
            <div className="result-item">
              <span className="label">NAT 类型:</span>
              <span style={{ fontWeight: 'bold', color: getColor(result.natType), fontSize: '1.2em' }}>
                {result.natType}
              </span>
            </div>
            <div className="result-item">
              <span className="label">公网 IP:</span>
              <span>{result.publicIp}</span>
            </div>
            <div className="result-item">
              <span className="label">测试端口:</span>
              <span>{result.publicPort}</span>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .container {
          display: flex; justify-content: center; align-items: center;
          min-height: 100vh; padding: 20px; background: #f0f2f5;
          font-family: sans-serif;
        }
        .card {
          background: white; padding: 30px; border-radius: 10px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          width: 100%; max-width: 400px; text-align: center;
        }
        h1 { margin: 0 0 10px 0; font-size: 1.5em; }
        .btn {
          width: 100%; padding: 12px; border: none; border-radius: 5px;
          background: #0070f3; color: white; font-size: 1em; cursor: pointer;
          transition: background 0.2s;
        }
        .btn:hover:not(:disabled) { background: #005bb5; }
        .btn:disabled { background: #ccc; cursor: not-allowed; }
        .result-box {
          margin-top: 25px; text-align: left; background: #fafafa;
          padding: 15px; border-radius: 8px; border: 1px solid #eaeaea;
        }
        .result-item {
          display: flex; justify-content: space-between; align-items: center;
          margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #eee;
        }
        .result-item:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
        .label { color: #555; font-size: 0.9em; }
      `}</style>
    </div>
  );
}
