// pages/nat.js
import { useState, useEffect, useRef } from 'react';

// -----------------------------------------------------------------------------
// 内嵌 SVG 图标组件 (无需安装依赖，直接可用)
// -----------------------------------------------------------------------------
const Icons = {
  Copy: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
  ),
  Check: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
  ),
  Cross: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
  ),
  Wifi: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"></path><path d="M1.42 9a16 16 0 0 1 21.16 0"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line></svg>
  ),
  Game: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"></rect><path d="M6 12h4"></path><path d="M8 10v4"></path><line x1="15" y1="13" x2="15.01" y2="13"></line><line x1="18" y1="11" x2="18.01" y2="11"></line></svg>
  ),
  Zap: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
  )
};

export default function NatTester() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [copyFeedback, setCopyFeedback] = useState(null);
  const peerConnectionRef = useRef(null);

  // 核心检测逻辑
  const startTest = async () => {
    if (loading) return;
    setLoading(true);
    setResult(null);

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
      const candidates = [];

      pc.onicecandidate = (e) => {
        if (!e.candidate) {
          analyze(candidates, publicIp);
          return;
        }
        const { candidate, type, protocol, address } = e.candidate;
        if (protocol === 'udp') {
            candidates.push(e.candidate);
            if (type === 'srflx' && !publicIp) publicIp = address;
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      setTimeout(() => {
        if (peerConnectionRef.current && peerConnectionRef.current.iceConnectionState !== 'closed') {
           if (!result) analyze(candidates, publicIp);
        }
      }, 5000);

    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const analyze = (candidates, ip) => {
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
        if (ports.size > 1) {
            type = "NAT4: 对称型 (Symmetric)";
            status = "fail";
            score = 30;
        } else {
            type = "NAT1-3: 锥形 (Cone)";
            status = "success";
            score = 90;
        }
    } else {
        type = "无法连接 STUN (请关闭代理)";
    }

    setResult({ type, ip: ip || "未知", status, score });
    setLoading(false);
  };

  const copyToClipboard = (text, type) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopyFeedback(type);
      setTimeout(() => setCopyFeedback(null), 2000);
    });
  };

  return (
    <div className="page-container">
      {/* 头部区域 */}
      <div className="header-section">
        <h1 className="main-title">NAT 类型检测工具</h1>
        <p className="sub-title">点击下方按钮开始检测您的网络配置，免费的游戏和网络NAT类型测试工具。</p>
      </div>

      {/* 核心操作区 */}
      <div className="action-section">
        <button 
          onClick={startTest} 
          disabled={loading} 
          className={`start-btn ${loading ? 'loading' : ''}`}
        >
          <Icons.Wifi />
          <span>{loading ? '正在检测中...' : '开始检测'}</span>
        </button>
      </div>

      {/* 结果展示卡片 - 仅在有结果时显示 */}
      {result && (
        <div className="result-card fade-in">
          {/* 基础信息 */}
          <div className="info-group">
            <div className="info-label">NAT 类型</div>
            <div className="info-row">
              <span className={`info-value ${result.status === 'success' ? 'text-green' : 'text-red'}`}>
                {result.type}
              </span>
              <button className="icon-btn" onClick={() => copyToClipboard(result.type, 'type')}>
                 {copyFeedback === 'type' ? <Icons.Check /> : <Icons.Copy />}
              </button>
            </div>
          </div>

          <div className="info-group">
            <div className="info-label">公网 IP</div>
            <div className="info-row">
              <span className="info-value text-blue">{result.ip}</span>
              <button className="icon-btn" onClick={() => copyToClipboard(result.ip, 'ip')}>
                {copyFeedback === 'ip' ? <Icons.Check /> : <Icons.Copy />}
              </button>
            </div>
          </div>

          <div className="divider"></div>

          {/* 网络开放度 */}
          <div className="score-section">
            <div className="score-header">
               <span><Icons.Zap /> 网络开放度</span>
               <span className={result.status === 'success' ? 'text-green' : 'text-red'}>{result.score}%</span>
            </div>
            <div className="progress-bg">
               <div className="progress-bar" style={{width: `${result.score}%`, background: result.status === 'success' ? '#10b981' : '#ef4444'}}></div>
            </div>
            <p className="score-desc">
              {result.status === 'success' 
                ? '锥形 NAT 提供优秀的连接性，支持所有类型的网络应用和游戏功能。' 
                : '对称型 NAT 限制较多，可能导致 P2P 联机困难或游戏匹配时间变长。'}
            </p>
          </div>

          <div className="divider"></div>

          {/* 功能支持列表 */}
          <div className="feature-grid">
             <div className="feature-item">
               <span className="icon-wrap">{result.status === 'success' ? <Icons.Check /> : <Icons.Cross />}</span>
               <span>P2P 连接</span>
             </div>
             <div className="feature-item">
               <span className="icon-wrap">{result.status === 'success' ? <Icons.Check /> : <Icons.Cross />}</span>
               <span>主机房间</span>
             </div>
             <div className="feature-item">
               <span className="icon-wrap"><Icons.Check /></span>
               <span>语音聊天</span>
             </div>
             <div className="feature-item">
               <span className="icon-wrap"><Icons.Check /></span>
               <span>直播推流</span>
             </div>
          </div>

          <div className="divider"></div>

          {/* 主机兼容性 */}
          <div className="console-section">
             <div className="console-header"><Icons.Game /> 游戏主机兼容性</div>
             <div className="console-grid">
               <div className="console-item">
                 <span>Xbox</span>
                 <span className={`status-badge ${result.status === 'success' ? 'bg-green' : 'bg-red'}`}>
                    {result.status === 'success' ? '优秀' : '受限'}
                 </span>
               </div>
               <div className="console-item">
                 <span>PS5</span>
                 <span className={`status-badge ${result.status === 'success' ? 'bg-green' : 'bg-red'}`}>
                    {result.status === 'success' ? '优秀' : '受限'}
                 </span>
               </div>
             </div>
          </div>
        </div>
      )}

      {/* 常见问题区域 */}
      <div className="faq-section">
         <h2 className="faq-title">常见问题</h2>
         
         <div className="faq-card">
            <h3>什么是 NAT 类型?</h3>
            <p>NAT (网络地址转换) 描述了路由器如何转换私有地址以及外部网络对您的可达性。标准分类包括：</p>
            <ul>
               <li><strong>开放网络 (无NAT):</strong> 直接公网IP。</li>
               <li><strong>全锥型 (Full Cone):</strong> 一对一映射，任何外部主机都能访问映射端口。</li>
               <li><strong>IP限制型 (Restricted Cone):</strong> 仅允许您发送过数据的IP回传数据。</li>
               <li><strong>对称型 (Symmetric NAT):</strong> 针对不同目的地址生成不同映射，最不利于P2P。</li>
            </ul>
         </div>

         <div className="faq-card">
            <h3>标准 NAT 与 PS5 的 NAT Type 如何对应?</h3>
            <p>两者并非严格一一映射，但通常可参考：</p>
            <ul>
               <li>开放网络/全锥型 → 常对应 PS5 NAT Type 1 (开放)。</li>
               <li>IP限制/端口限制 → 在 UPnP 有效时多表现为 Type 2 (中等)。</li>
               <li>对称型或 CGNAT → 常表现为 Type 3 (严格)。</li>
            </ul>
         </div>

         <div className="faq-card">
            <h3>如何改善 NAT 类型?</h3>
            <ol>
               <li>启用路由器的 UPnP 功能 (最推荐)。</li>
               <li>配置端口转发 (Port Forwarding)。</li>
               <li>将设备设置为 DMZ 主机 (注意安全风险)。</li>
               <li>联系网络服务提供商申请公网 IP。</li>
            </ol>
         </div>
      </div>

      <style jsx>{`
        /* 全局容器：深色背景 */
        .page-container {
          min-height: 100vh;
          background: #1f2937; /* 深灰蓝背景 */
          color: #e5e7eb;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 2rem 1rem;
        }

        /* 头部 */
        .header-section { text-align: center; margin-bottom: 2rem; max-width: 600px; }
        .main-title { 
            font-size: 2rem; 
            font-weight: 800; 
            margin-bottom: 0.5rem;
            background: linear-gradient(to right, #818cf8, #c084fc);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .sub-title { color: #9ca3af; font-size: 0.95rem; line-height: 1.5; }

        /* 按钮区域 */
        .action-section { margin-bottom: 2rem; width: 100%; max-width: 400px; }
        .start-btn {
            width: 100%;
            background: linear-gradient(135deg, #3b82f6, #8b5cf6);
            border: none;
            padding: 1rem;
            border-radius: 12px;
            color: white;
            font-size: 1.1rem;
            font-weight: bold;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            box-shadow: 0 4px 15px rgba(59, 130, 246, 0.4);
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .start-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(59, 130, 246, 0.6); }
        .start-btn:active { transform: translateY(0); }
        .start-btn:disabled { opacity: 0.7; cursor: wait; }
        
        /* 结果卡片 (核心美化部分) */
        .result-card {
            background: #111827; /* 更深的卡片背景 */
            border: 1px solid #374151;
            border-radius: 16px;
            padding: 1.5rem;
            width: 100%;
            max-width: 450px;
            box-shadow: 0 10px 40px -10px rgba(0,0,0,0.5);
            margin-bottom: 3rem;
        }
        .fade-in { animation: fadeIn 0.5s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

        .info-group { margin-bottom: 1rem; }
        .info-label { color: #10b981; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.3rem; }
        .info-row { display: flex; justify-content: space-between; align-items: center; }
        .info-value { font-size: 1.25rem; font-weight: bold; font-family: monospace; }
        .text-green { color: #d1fae5; text-shadow: 0 0 10px rgba(16, 185, 129, 0.3); }
        .text-red { color: #fecaca; text-shadow: 0 0 10px rgba(239, 68, 68, 0.3); }
        .text-blue { color: #bfdbfe; }
        
        .icon-btn { background: rgba(255,255,255,0.05); border: none; color: #9ca3af; padding: 6px; border-radius: 6px; cursor: pointer; transition: background 0.2s; }
        .icon-btn:hover { background: rgba(255,255,255,0.1); color: white; }

        .divider { height: 1px; background: #374151; margin: 1.2rem 0; }

        /* 网络开放度进度条 */
        .score-header { display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-weight: 600; color: #e5e7eb; display: flex; align-items: center; gap: 8px;}
        .progress-bg { height: 8px; background: #374151; border-radius: 4px; overflow: hidden; margin-bottom: 0.5rem; }
        .progress-bar { height: 100%; transition: width 1s ease-out; }
        .score-desc { font-size: 0.8rem; color: #6b7280; line-height: 1.4; }

        /* 功能网格 */
        .feature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        .feature-item { display: flex; align-items: center; gap: 8px; font-size: 0.9rem; color: #d1d5db; }
        .icon-wrap { display: flex; align-items: center; }

        /* 主机兼容性 */
        .console-header { margin-bottom: 1rem; font-weight: 600; display: flex; align-items: center; gap: 8px; }
        .console-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        .console-item { 
            background: #1f2937; padding: 0.75rem; border-radius: 8px; 
            display: flex; justify-content: space-between; align-items: center;
        }
        .status-badge { font-size: 0.75rem; padding: 2px 8px; border-radius: 10px; font-weight: bold; }
        .bg-green { background: rgba(16, 185, 129, 0.2); color: #34d399; }
        .bg-red { background: rgba(239, 68, 68, 0.2); color: #f87171; }

        /* 常见问题区 */
        .faq-section { width: 100%; max-width: 600px; }
        .faq-title { text-align: center; color: #818cf8; margin-bottom: 1.5rem; font-size: 1.2rem; border-bottom: 2px solid #818cf8; display: inline-block; padding-bottom: 5px; position: relative; left: 50%; transform: translateX(-50%); }
        .faq-card {
            background: #374151;
            border-radius: 12px;
            padding: 1.25rem;
            margin-bottom: 1rem;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .faq-card h3 { margin: 0 0 0.5rem; color: #e5e7eb; font-size: 1rem; }
        .faq-card p { font-size: 0.85rem; color: #9ca3af; margin: 0 0 0.5rem; line-height: 1.6; }
        .faq-card ul, .faq-card ol { margin: 0; padding-left: 1.2rem; color: #9ca3af; font-size: 0.85rem; }
        .faq-card li { margin-bottom: 0.3rem; }
      `}</style>
    </div>
  );
}
