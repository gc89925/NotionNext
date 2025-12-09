import { useState } from 'react';

export default function NAT() {
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);

  const testNat = async () => {
    setLoading(true);
    setResult('检测中...');
    try {
      // 替换成你 VPS 的公网 IP 和端口
      const res = await fetch('http://nat.laogaofenxiang.com:5000/nat');
      const data = await res.json();
      setResult(`NAT 类型: ${data.nat_type}\n公网 IP: ${data.public_ip}\n端口: ${data.public_port}`);
    } catch (e) {
      setResult('请求失败，请检查网络或防火墙');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>NAT 测试</h1>
      <button 
        onClick={testNat} 
        style={{ padding: '0.5rem 1rem', marginBottom: '1rem', cursor: 'pointer' }}
        disabled={loading}
      >
        {loading ? '检测中...' : '点击检测我的 NAT 类型'}
      </button>
      <pre style={{ backgroundColor: '#f0f0f0', padding: '1rem', borderRadius: '0.5rem' }}>
        {result}
      </pre>
    </div>
  );
}
