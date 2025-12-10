import { useState, useEffect } from 'react';

export default function NATPage() {
  const [loading, setLoading] = useState(false);
  const [natInfo, setNatInfo] = useState(null);
  const [error, setError] = useState(null);

  // 使用 WebRTC + STUN 检测 NAT  
  const detectNAT = async () => {
    setLoading(true);
    setError(null);
    setNatInfo(null);

    try {
      const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      const channel = pc.createDataChannel("nat-check");

      const candidates = [];
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          candidates.push(e.candidate.candidate);
        }
      };

      await pc.createOffer().then(sdp => pc.setLocalDescription(sdp));

      await new Promise(resolve => {
        setTimeout(resolve, 2000);
      });

      pc.close();

      // 简单分析：根据候选地址判断 NAT 类型  
      // 这里只是示例逻辑 —— 实际你可以用更复杂算法判断
      const hasHost = candidates.some(c => c.includes(" typ host "));
      const hasSrflx = candidates.some(c => c.includes(" typ srflx "));
      const hasRelay = candidates.some(c => c.includes(" typ relay "));

      let natType = "Unknown";
      if (hasHost) natType = "Open / No NAT";
      else if (hasSrflx && !hasRelay) natType = "Full Cone / Restricted NAT";
      else if (hasRelay) natType = "Symmetric / Strict NAT";

      const publicCandidate = candidates.find(c => c.includes(" typ srflx ")) || candidates[0];

      let publicIP = "", publicPort = "";
      if (publicCandidate) {
        const m = publicCandidate.match(/([0-9]{1,3}(?:\\.[0-9]{1,3}){3})\\s?(?:.*\\sport\\s(\\d+))/);
        if (m) {
          publicIP = m[1];
          publicPort = m[2];
        }
      }

      setNatInfo({ natType, publicIP, publicPort, candidates });
    } catch (e) {
      console.error(e);
      setError("检测失败 — 浏览器或网络可能阻止 WebRTC");
    }

    setLoading(false);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #1e3a8a, #2563eb)', color: '#fff', padding: '2rem' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto', background: '#fff', color: '#111', borderRadius: '12px', padding: '2rem', boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>在线 NAT 检测器</h1>
        <p style={{ color: '#555', marginBottom: '1.5rem' }}>点击下方按钮，一键检测你的公网 IP 和 NAT 类型</p>

        <button onClick={detectNAT} disabled={loading}
          style={{
            padding: '0.75rem 2rem',
            fontSize: '1.125rem',
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            transition: 'background 0.3s',
            marginBottom: '1.5rem',
          }}
        >
          {loading ? '检测中...' : '开始检测 NAT'}
        </button>

        {loading && (
          <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
            <div style={{
              width: '40px', height: '40px',
              border: '4px solid #e5e7eb',
              borderTop: '4px solid #2563eb',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto',
            }} />
          </div>
        )}

        {natInfo && (
          <div style={{ background: '#f9fafb', padding: '1.5rem', borderRadius: '8px', color: '#111' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>检测结果</h2>
            <p><strong>NAT 类型：</strong> {natInfo.natType}</p>
            <p><strong>公网 IP：</strong> {natInfo.publicIP || '—'}</p>
            <p><strong>端口：</strong> {natInfo.publicPort || '—'}</p>
            <details style={{ marginTop: '1rem' }}>
              <summary>🔍 ICE 候选 (用于调试)</summary>
              <pre style={{ fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>{natInfo.candidates.join("\\n")}</pre>
            </details>
          </div>
        )}

        {error && (
          <div style={{ color: 'red', marginTop: '1rem' }}>{error}</div>
        )}

        <style jsx>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>

      <div style={{ maxWidth: '600px', margin: '2rem auto', background: '#fff', color: '#111', borderRadius: '12px', padding: '1.5rem' }}>
        <h2 style={{ fontSize: '1.75rem', marginBottom: '0.75rem' }}>NAT 类型说明</h2>
        <ul style={{ lineHeight: '1.6', color: '#333' }}>
          <li><strong>Open / No NAT：</strong> 设备直接拥有公网 IP，没有 NAT 转换。</li>
          <li><strong>Full Cone / Restricted NAT：</strong> 一般通过 STUN 能检测为非对称 NAT，支持多数 P2P 场景。</li>
          <li><strong>Symmetric / Strict NAT：</strong> 每次连接可能分配不同公网端口，P2P 穿透难度大，可能需要端口转发/中继。</li>
        </ul>
      </div>
    </div>
  );
}
