import { useState } from 'react';

export default function NAT() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const testNat = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/proxyNat');
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

  const natColor = (type) => {
    switch(type.toLowerCase()) {
      case 'full cone': return '#10b981';
      case 'restricted cone': return '#f59e0b';
      case 'symmetric nat': return '#ef4444';
      default: return '#6b7280';
    }
  }

  const natIcon = (type) => {
    switch(type.toLowerCase()) {
      case 'full cone': return '✅';
      case 'restricted cone': return '⚠️';
      case 'symmetric nat': return '❌';
      default: return '❓';
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      background: 'linear-gradient(135deg, #667eea, #764ba2)',
      padding: '2rem'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '500px',
        backgroundColor: '#ffffff',
        borderRadius: '1rem',
        padding: '2rem',
        boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
        textAlign: 'center'
      }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '1rem', color: '#333' }}>NAT 类型测试</h1>
        <p style={{ color: '#555', marginBottom: '2rem' }}>点击下方按钮，即可检测你的 NAT 类型、公网 IP 及端口</p>

        <button
          onClick={testNat}
          disabled={loading}
          style={{
            padding: '0.75rem 2rem',
            fontSize: '1rem',
            backgroundColor: loading ? '#a5b4fc' : '#4f46e5',
            color: '#fff',
            border: 'none',
            borderRadius: '0.5rem',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontWeight: 'bold',
            boxShadow: '0 4px 10px rgba(0,0,0,0.2)',
            transition: 'all 0.3s ease',
            marginBottom: '2rem'
          }}
        >
          {loading ? '检测中...' : '点击检测我的 NAT 类型'}
        </button>

        {loading && (
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{
              width: '40px',
              height: '40px',
              border: '4px solid #e5e7eb',
              borderTop: '4px solid #4f46e5',
              borderRadius: '50%',
              margin: '0 auto',
              animation: 'spin 1s linear infinite'
            }} />
          </div>
        )}

        {result && result.success && (
          <div style={{
            backgroundColor: '#f3f4f6',
            padding: '1.5rem',
            borderRadius: '0.75rem',
            textAlign: 'left',
            color: '#111',
            boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
            animation: 'fadeIn 0.5s ease'
          }}>
            <div style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', fontSize: '1.2rem' }}>
              <span style={{
                color: natColor(result.nat_type),
                fontWeight: 'bold',
                fontSize: '1.5rem',
                marginRight: '0.5rem',
                animation: 'bounce 0.5s ease'
              }}>{natIcon(result.nat_type)}</span>
              NAT 类型: <span style={{ color: natColor(result.nat_type), fontWeight: 'bold', marginLeft: '0.25rem' }}>{result.nat_type}</span>
            </div>
            <div style={{ marginBottom: '0.5rem' }}>公网 IP: {result.public_ip}</div>
            <div>端口: {result.public_port}</div>
          </div>
        )}

        {result && !result.success && (
          <div style={{ color: 'red', marginTop: '1rem' }}>{result.message}</div>
        )}

        <style jsx>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }

          @keyframes bounce {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-5px); }
          }

          @keyframes fadeIn {
            0% { opacity: 0; transform: translateY(-10px); }
            100% { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    </div>
  );
}
