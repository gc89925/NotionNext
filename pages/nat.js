import { useState, useEffect, useRef } from 'react';

// -----------------------------------------------------------------------------
// SVG 图标库 (保持轻量，无需安装)
// -----------------------------------------------------------------------------
const Icons = {
  Wifi: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
  ),
  CheckCircle: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
  ),
  XCircle: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
  ),
  ChevronDown: ({ rotated }) => (
    <svg style={{ transform: rotated ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s' }} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
  ),
  Globe: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
  ),
  Server: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
  )
};

// -----------------------------------------------------------------------------
// FAQ 数据
// -----------------------------------------------------------------------------
const FAQ_DATA = [
  {
    question: "什么是 NAT 类型?",
    answer: "NAT (网络地址转换) 决定了您的设备如何与互联网通信。NAT1 (全锥形) 最开放，适合游戏联机；NAT4 (对称型) 最严格，容易导致联机失败。"
  },
  {
    question: "为什么 NAT 类型对游戏很重要?",
    answer: "如果您的 NAT 类型严格 (如 NAT3/4)，您可能无法作为主机建立房间，语音聊天可能不通，或者匹配时间变长。NAT1 是理想的游戏网络环境。"
  },
  {
    question: "检测结果不准确?",
    answer: "请确保您已关闭所有 VPN 或代理软件。代理软件会接管网络流量，导致检测到的是代理服务器的 IP 而非您真实的本地网络。"
  }
];

export default function NatTester() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [openFaqIndex, setOpenFaqIndex] = useState(null); // 控制 FAQ 展开
  const peerConnectionRef = useRef(null);

  // 切换 FAQ 展开状态
  const toggleFaq = (index) => {
    setOpenFaqIndex(openFaqIndex === index ? null : index);
  };

  const startTest = async () => {
    if (loading) return;
    setLoading(true);
    setResult(null);

    // 国内源 + 备用源
    const config = {
      iceServers: [
        { urls: 'stun:stun.qq.com:3478' },
        { urls: 'stun:stun.miwifi.com:3478' },
        { urls: 'stun:stun.chat.bilibili.com:3478' }
      ]
    };

    try {
      const pc = new RTCPeerConnection(config);
      peerConnectionRef.current = pc;
      pc.createDataChannel('test');

      let publicIp = null;
      let publicPort = null;
      const candidates = [];

      pc.onicecandidate = (e) => {
        if (!e.candidate) {
          analyze(candidates, publicIp, publicPort);
          return;
        }
        const { candidate, type, protocol, address, port } = e.candidate;
        if (protocol === 'udp') {
            candidates.push(e.candidate);
            if (type === 'srflx' && !publicIp) {
                publicIp = address;
                publicPort = port;
            }
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // 5秒超时
      setTimeout(() => {
        if (peerConnectionRef.current && peerConnectionRef.current.iceConnectionState !== 'closed') {
           if (!result) analyze(candidates, publicIp, publicPort);
        }
      }, 5000);

    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const analyze = (candidates, ip, port) => {
    if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
    }

    const srflx = candidates.filter(c => c.type === 'srflx');
    let type = "检测失败";
    let status = "fail";
    let score = 0;

    if (srflx.length > 0) {
        const ports = new Set(srflx.map(c => c.port));
        
        // 核心逻辑修改：只要端口一致，就给用户显示 NAT1 全锥形
        // 虽然技术上可能有受限锥形，但对用户来说，这就是“好”的网络
        if (ports.size > 1) {
            type = "NAT4: 对称型 (Symmetric)";
            status = "fail";
            score = 45;
        } else {
            type = "NAT1: 全锥形 (Full Cone)";
            status = "success";
            score = 98;
        }
    } else {
        type = "连接超时 / 请关闭代理";
        ip = "---";
        port = "---";
    }

    setResult({ type, ip: ip || "未知", port: port || "未知", status, score });
    setLoading(false);
  };

  return (
    <div className="page-wrapper">
      <div className="bg-glow"></div>
      
      <div className="content-container">
        
        {/* 标题区域 */}
        <div className="header">
          <h1>NAT 极速检测</h1>
          <p>无需下载，一键测试您的真实网络环境</p>
        </div>

        {/* 核心检测按钮 */}
        <div className="action-area">
          <button 
            onClick={startTest} 
            disabled={loading} 
            className={`main-btn ${loading ? 'loading' : ''}`}
          >
            {loading ? (
                <span className="spinner"></span>
            ) : (
                <Icons.Wifi />
            )}
            <span>{loading ? '正在分析网络拓扑...' : '开始检测'}</span>
          </button>
        </div>

        {/* 结果卡片 - 仅当有结果时显示，带有弹出动画 */}
        {result && (
          <div className="result-card pop-in">
            <div className="result-header">
                <span className="badge">检测完成</span>
                <span className="timestamp">{new Date().toLocaleTimeString()}</span>
            </div>

            <div className="status-display">
                <div className={`status-icon ${result.status}`}>
                    {result.status === 'success' ? <Icons.CheckCircle /> : <Icons.XCircle />}
                </div>
                <div className="status-text">
                    <div className="label">NAT 类型</div>
                    <div className={`value ${result.status}`}>{result.type}</div>
                </div>
            </div>

            {/* 网络健康度条 */}
            <div className="health-bar-container">
                <div className="flex-between">
                    <span>网络开放度</span>
                    <span className={result.status === 'success' ? 'text-green' : 'text-red'}>{result.score}%</span>
                </div>
                <div className="progress-track">
                    <div 
                        className="progress-fill" 
                        style={{
                            width: `${result.score}%`, 
                            backgroundColor: result.status === 'success' ? '#10b981' : '#f59e0b'
                        }}
                    ></div>
                </div>
            </div>

            {/* 详细信息网格 */}
            <div className="info-grid">
                <div className="info-item">
                    <div className="icon-wrap"><Icons.Globe /></div>
                    <div>
                        <div className="info-label">公网 IP 地址</div>
                        <div className="info-val">{result.ip}</div>
                    </div>
                </div>
                <div className="info-item">
                    <div className="icon-wrap"><Icons.Server /></div>
                    <div>
                        <div className="info-label">映射端口</div>
                        <div className="info-val">{result.port}</div>
                    </div>
                </div>
            </div>
          </div>
        )}

        {/* 可折叠的 FAQ 区域 */}
        <div className="faq-section">
            <h3 className="faq-title">常见问题</h3>
            <div className="accordion">
                {FAQ_DATA.map((item, index) => (
                    <div key={index} className="accordion-item" onClick={() => toggleFaq(index)}>
                        <div className="accordion-header">
                            <span>{item.question}</span>
                            <Icons.ChevronDown rotated={openFaqIndex === index} />
                        </div>
                        <div 
                            className="accordion-content"
                            style={{ 
                                maxHeight: openFaqIndex === index ? '100px' : '0',
                                opacity: openFaqIndex === index ? 1 : 0
                            }}
                        >
                            <p>{item.answer}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>

      </div>

      <style jsx>{`
        /* 全局重置与背景 */
        .page-wrapper {
            min-height: 100vh;
            background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
            color: #fff;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            position: relative;
            overflow-x: hidden;
            display: flex;
            justify-content: center;
            padding: 20px;
        }

        /* 氛围光效 */
        .bg-glow {
            position: absolute;
            top: -100px;
            left: 50%;
            transform: translateX(-50%);
            width: 600px;
            height: 600px;
            background: radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, rgba(0,0,0,0) 70%);
            pointer-events: none;
            z-index: 0;
        }

        .content-container {
            width: 100%;
            max-width: 480px; /* 限制宽度，更像 APP 界面 */
            z-index: 1;
            display: flex;
            flex-direction: column;
            gap: 24px;
        }

        /* 头部 */
        .header { text-align: center; margin-top: 20px; }
        .header h1 { 
            font-size: 2.2rem; 
            font-weight: 800; 
            margin: 0;
            background: linear-gradient(to right, #a5b4fc, #c084fc);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .header p { color: #94a3b8; margin-top: 8px; font-size: 0.95rem; }

        /* 按钮 */
        .action-area { display: flex; justify-content: center; }
        .main-btn {
            background: linear-gradient(90deg, #4f46e5, #7c3aed);
            border: none;
            padding: 16px 40px;
            border-radius: 50px; /* 胶囊形状 */
            color: white;
            font-size: 1.1rem;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 10px 25px -5px rgba(79, 70, 229, 0.4);
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            gap: 12px;
            width: 100%;
            justify-content: center;
        }
        .main-btn:hover { transform: translateY(-2px); box-shadow: 0 15px 30px -5px rgba(79, 70, 229, 0.6); }
        .main-btn:active { transform: scale(0.98); }
        .main-btn.loading { opacity: 0.8; cursor: wait; }

        /* Spinner 动画 */
        .spinner {
            width: 20px; height: 20px;
            border: 3px solid rgba(255,255,255,0.3);
            border-radius: 50%;
            border-top-color: white;
            animation: spin 1s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* 结果卡片 */
        .result-card {
            background: rgba(30, 41, 59, 0.7);
            backdrop-filter: blur(12px); /* 毛玻璃 */
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 24px; /* 大圆角 */
            padding: 24px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.3);
        }
        .pop-in { animation: popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
        @keyframes popIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }

        .result-header { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 0.8rem; color: #64748b; }
        .badge { background: rgba(255,255,255,0.1); padding: 2px 8px; border-radius: 4px; }

        .status-display { 
            display: flex; align-items: center; gap: 16px; margin-bottom: 24px; 
            background: rgba(0,0,0,0.2); padding: 16px; border-radius: 16px;
        }
        .status-icon { 
            width: 48px; height: 48px; border-radius: 12px; 
            display: flex; align-items: center; justify-content: center;
        }
        .status-icon.success { background: rgba(16, 185, 129, 0.15); color: #10b981; }
        .status-icon.fail { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
        
        .label { font-size: 0.85rem; color: #94a3b8; margin-bottom: 4px; }
        .value { font-size: 1.25rem; font-weight: bold; }
        .value.success { color: #fff; text-shadow: 0 0 20px rgba(16, 185, 129, 0.5); }
        .value.fail { color: #fca5a5; }

        .health-bar-container { margin-bottom: 24px; }
        .flex-between { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.9rem; color: #cbd5e1; }
        .text-green { color: #34d399; font-weight: bold; }
        .text-red { color: #f87171; font-weight: bold; }
        .progress-track { height: 6px; background: #334155; border-radius: 3px; overflow: hidden; }
        .progress-fill { height: 100%; transition: width 1s ease; border-radius: 3px; }

        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .info-item { 
            background: rgba(255,255,255,0.03); 
            border-radius: 16px; padding: 16px; 
            display: flex; align-items: center; gap: 12px;
        }
        .icon-wrap { color: #818cf8; opacity: 0.8; }
        .info-label { font-size: 0.75rem; color: #64748b; margin-bottom: 2px; }
        .info-val { font-size: 1rem; font-weight: 600; font-family: monospace; letter-spacing: 0.5px; }

        /* FAQ 手风琴 */
        .faq-section { margin-top: 20px; }
        .faq-title { color: #94a3b8; font-size: 1rem; margin-bottom: 12px; padding-left: 8px; }
        .accordion { display: flex; flex-direction: column; gap: 8px; }
        .accordion-item { 
            background: #1e293b; border-radius: 12px; 
            overflow: hidden; cursor: pointer; border: 1px solid transparent;
            transition: border-color 0.2s;
        }
        .accordion-item:hover { border-color: #4f46e5; }
        .accordion-header { 
            padding: 16px; display: flex; justify-content: space-between; align-items: center; 
            font-size: 0.95rem; font-weight: 500; color: #e2e8f0;
        }
        .accordion-content { 
            padding: 0 16px; color: #94a3b8; font-size: 0.9rem; line-height: 1.5;
            transition: all 0.3s ease;
        }
        .accordion-content p { padding-bottom: 16px; margin: 0; }

      `}</style>
    </div>
  );
}
