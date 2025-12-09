import { useState } from 'react';

export default function NAT() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const testNat = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('https://你的VPS域名或IP:5000/nat');
      const data = await res.json();
      setResult({
        success: true,
        nat_type: data.nat_type,
        public_ip: data.public_ip,
        public_port: data.public_port
      });
    } catch (e) {
      setResult({ success: false, message: '请求失败，请检查网络或防火墙' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>NAT 测试</h1>
      <button
        onClick={testNat}
        disabled={loading}
        style={{
          padding: '0.75rem 1.5rem',
          fontSize: '1rem',
          backgroundColor: '#4f46e5',
          color: '#fff',
          border: 'none',
          borderRadius: '0.5rem',
          cursor: loading ? 'not-allowed' : 'pointer',
          marginBottom: '1rem'
        }}
      >
        {loading ? '检测中...' : '点击检测我的 NAT 类型'}
      </button>

      {result && result.success && (
        <div style={{
          backgroundColor: '#f3f4f6',
          padding: '1rem',
          borderRadius: '0.5rem',
          whiteSpace: 'pre-wrap'
        }}>
          NAT 类型: {result.nat_type}
          <br />
          公网 IP: {result.public_ip}
          <br />
          端口: {result.public_port}
        </div>
      )}

      {result && !result.success && (
        <div style={{ color: 'red', marginTop: '1rem' }}>{result.message}</div>
      )}
    </div>
  );
}
