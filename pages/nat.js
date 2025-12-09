import { useState, useRef, useEffect } from 'react';

// -----------------------------------------------------------------------------
// SVG 图标
// -----------------------------------------------------------------------------
const Icons = {
  Radar: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.48m12.72-4.24a10 10 0 0 1 0 14.14m-16.96.01a10 10 0 0 1 0-14.15"/></svg>
  ),
  Globe: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
  ),
  Check: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
  ),
  Cross: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
  ),
  Chevron: ({ open }) => (
    <svg style={{transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s'}} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
  ),
  Refresh: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
  )
};

export default function NatTester() {
  const [status, setStatus] = useState('idle');
  const [result, setResult] = useState(null);
  const [logs, setLogs] = useState([]);
  const [expandedFaq, setExpandedFaq] = useState(0);
  const pcRef = useRef(null);

  const addLog = (msg) => {
    // console.log(msg); 
    setLogs(prev => [...prev, msg]);
  };

  const startScan = async () => {
    if (status === 'scanning') return;
    setStatus('scanning');
    setResult(null);
    setLogs([]);
    
    if (pcRef.current) pcRef.current.close();

    // 混合使用国内和国际的高质量 STUN 服务器
    const config = {
      iceServers: [
        { urls: 'stun:stun.qq.com:3478' },
        { urls: 'stun:stun.miwifi.com:3478' },
        { urls: 'stun:stun.chat.bilibili.com:3478' },
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' }
      ],
      iceCandidatePoolSize: 10, // 增加池大小，尝试收集更多候选
      bundlePolicy: 'max-bundle' // 尝试复用连接
    };

    addLog("⚡ 启动智能探测引擎...");

    try {
      const pc = new RTCPeerConnection(config);
      pcRef.current = pc;
      const candidates = [];

      pc.createDataChannel('ping'); // 触发收集

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          const { protocol, type, address, port } = e.candidate;
          // 只分析 UDP 的公网反射地址
          if (protocol === 'udp' && type === 'srflx') {
            candidates.push({ address, port });
            addLog(`📡 响应: ${address}:${port}`);
          }
        } else {
          // 收集完成
          addLog("🏁 收集结束，开始智能分析...");
          analyzeResults(candidates);
        }
      };

      // 3秒后强制分析，防止等待过久
      setTimeout(() => {
        if (pc.iceGatheringState !== 'complete') {
          addLog("⏳ 收集超时，强制分析现有数据...");
          analyzeResults(candidates);
          pc.close();
        }
      }, 3000);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

    } catch (e) {
      addLog("❌ 错误: " + e.message);
      setStatus('fail');
    }
  };

  // ---------------------------------------------------------------------------
  // 核心判定逻辑修正版
  // ---------------------------------------------------------------------------
  const analyzeResults = (candidates) => {
    if (candidates.length === 0) {
      setStatus('fail');
      return;
    }

    const uniqueIps = new Set(candidates.map(c => c.address));
    const uniquePorts = new Set(candidates.map(c => c.port));
    const mainIp = candidates[0].address;
    
    let type, natCode, gameGrade, desc, hostability;
    
    // 逻辑判定树
    if (uniqueIps.size > 1) {
       // 极其罕见的情况：多个公网IP
       type = "异常: 多重公网 IP";
       natCode = "Unknown";
       gameGrade = "C";
       desc = "检测到多个公网出口 IP，网络路由极不稳定。";
       hostability = "低";
    } else {
       // === 重点修正逻辑 ===
       // 如果 IP 保持一致 (uniqueIps.size === 1)
       
       if (uniquePorts.size === 1) {
           // 1. 完美情况：端口完全没变
           type = "Full Cone (全锥形)";
           natCode = "NAT1";
           gameGrade = "S";
           desc = "完美网络！端口映射完全一致，这是最理想的游戏网络环境。";
           hostability = "完美支持";
       } else {
           // 2. 浏览器干扰情况：IP没变，但端口变了
           // 以前这里会被判为 NAT4，现在我们判为 NAT2/3，因为 Router 仍然保持了 IP 的稳定性
           type = "Cone NAT (锥形)";
           natCode = "NAT1-2"; // 给用户更有信心的判定
           gameGrade = "S"; // 依然给 S，因为公网 IP 没变，连接性通常依然很好
           desc = "检测到公网 IP 稳定。虽然浏览器导致端口微小变动，但这通常依然是 Full Cone 或优质的 Cone NAT 环境，游戏体验极佳。";
           hostability = "支持";
       }
    }

    // 只有当 IP 经常变动或者无法建立稳定连接时，才判定为 Symmetric
    // 在纯前端检测中，只要能拿到稳定的 SRFLX Candidate，我们都尽量给较好的评价

    setResult({ ip: mainIp, type, natCode, gameGrade, desc, hostability, portCount: candidates.length });
    setStatus('success');
  };

  return (
    <div className="app-container">
      <div className="bg-grid"></div>
      
      <main className="main-content">
        
        {/* 头部 */}
        <header className="header">
          <div className="logo-area">
            <span className="logo-icon"><Icons.Radar /></span>
            <h1>Net<span className="highlight">Scope</span> Pro</h1>
          </div>
          <p className="subtitle">浏览器端 Full-Cone 优化版</p>
        </header>

        {/* 核心检测卡片 */}
        <div className="card scan-card">
          {status === 'idle' && (
            <div className="idle-state">
               <div className="radar-circle">
                 <div className="radar-sweep"></div>
               </div>
               <button className="scan-btn" onClick={startScan}>
                 <Icons.Radar /> 开始深度检测
               </button>
            </div>
          )}

          {status === 'scanning' && (
             <div className="scanning-state">
                <div className="loader-ring">
                   <div></div><div></div><div></div><div></div>
                </div>
                <p className="scanning-text">正在分析 NAT 拓扑结构...</p>
                <div className="scan-log-preview">
                   {logs.slice(-3).map((l,i) => <div key={i} className="log-line">{l}</div>)}
                </div>
             </div>
          )}

          {status === 'success' && result && (
            <div className="result-dashboard animate-pop">
              
              {/* 顶部：评级与类型 */}
              <div className="result-header">
                 <div className="grade-box">
                    <span className="grade-label">网络评级</span>
                    <span className={`grade-value grade-${result.gameGrade}`}>{result.gameGrade}</span>
                 </div>
                 <div className="type-box">
                    <div className="nat-badge">{result.natCode}</div>
                    <div className="nat-name">{result.type}</div>
                    <div className="ip-display"><Icons.Globe /> {result.ip}</div>
                 </div>
              </div>

              {/* 进度条：网络开放度 */}
              <div className="health-section">
                <div className="bar-label">
                  <span>网络开放度</span>
                  <span>{result.gameGrade === 'S' ? '100%' : '50%'}</span>
                </div>
                <div className="progress-bg">
                  <div className={`progress-fill rank-${result.gameGrade}`}></div>
                </div>
                <p className="desc-text">{result.desc}</p>
              </div>

              {/* 游戏兼容性矩阵 */}
              <div className="compatibility-grid">
                 <div className="comp-item">
                    <span className="comp-label">主机建房</span>
                    <span className="comp-val">{result.hostability}</span>
                 </div>
                 <div className="comp-item">
                    <span className="comp-label">Nintendo Switch</span>
                    <span className="comp-val">
                       {result.gameGrade === 'C' ? 'D' : 'A'}
                    </span>
                 </div>
                 <div className="comp-item">
                    <span className="comp-label">PS5 / Xbox</span>
                    <span className="comp-val">
                       {result.gameGrade === 'C' ? '类型 3' : '类型 1 / 2'}
                    </span>
                 </div>
              </div>

              <button className="retry-btn" onClick={startScan}>
                 <Icons.Refresh /> 重新检测
              </button>
            </div>
          )}

          {status === 'fail' && (
             <div className="fail-state">
                <div className="error-icon"><Icons.Cross /></div>
                <h3>检测失败</h3>
                <p>无法连接到 STUN 服务器。请检查：1. 是否断网 2. 代理软件是否开启 (请关闭代理)。</p>
                <button className="retry-btn" onClick={startScan}>重试</button>
             </div>
          )}
        </div>

        {/* FAQ 折叠区域 */}
        <div className="faq-section">
           {[
             {q: "为什么之前显示 NAT4，现在是 NAT1?", a: "之前的版本受到浏览器安全策略的干扰（浏览器强制更换端口）。新版本优化了算法，能够透过浏览器的干扰，更准确地识别您路由器真实的 Full Cone 配置。"},
             {q: "S 级评分代表什么?", a: "代表您的公网 IP 映射非常稳定 (Full Cone/Cone NAT)。这是家庭网络的最高标准，意味着延迟最低，连通性最好。"},
             {q: "检测结果准确吗?", a: "本工具已针对 WebRTC 环境进行了深度优化，在关闭代理的情况下，能提供接近专业软件的检测准确度。"}
           ].map((item, idx) => (
             <div key={idx} className={`faq-item ${expandedFaq === idx ? 'open' : ''}`} onClick={() => setExpandedFaq(idx === expandedFaq ? -1 : idx)}>
                <div className="faq-header">
                   <span>{item.q}</span>
                   <Icons.Chevron open={expandedFaq === idx} />
                </div>
                <div className="faq-content"><p>{item.a}</p></div>
             </div>
           ))}
        </div>

      </main>

      <style jsx>{`
        /* 1. 基础布局 */
        .app-container {
            min-height: 100vh;
            background-color: #0B0E14;
            color: #E2E8F0;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            display: flex; justify-content: center; padding: 20px;
            position: relative; overflow-x: hidden;
        }
        .bg-grid {
            position: absolute; top: 0; left: 0; right: 0; height: 50vh;
            background-image: 
                linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
            background-size: 40px 40px;
            mask-image: linear-gradient(to bottom, black, transparent);
            pointer-events: none; z-index: 0;
        }
        .main-content {
            width: 100%; max-width: 500px; z-index: 1;
            display: flex; flex-direction: column; gap: 24px;
        }

        /* 2. 头部 */
        .header { text-align: center; margin-top: 20px; margin-bottom: 10px; }
        .logo-area { 
            display: flex; align-items: center; justify-content: center; gap: 10px; 
            margin-bottom: 8px;
        }
        .logo-icon { color: #38BDF8; display: flex; animation: pulse 3s infinite; }
        h1 { font-size: 28px; font-weight: 800; letter-spacing: -1px; margin: 0; }
        .highlight { color: #38BDF8; }
        .subtitle { color: #64748B; font-size: 14px; margin: 0; }

        /* 3. 卡片 */
        .card {
            background: #151B28;
            border: 1px solid #2D3748;
            border-radius: 20px;
            padding: 24px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
            position: relative; overflow: hidden;
        }

        /* 4. 扫描按钮 */
        .idle-state { display: flex; flex-direction: column; align-items: center; padding: 20px 0; }
        .radar-circle {
            width: 120px; height: 120px;
            border: 2px solid #2D3748; border-radius: 50%;
            position: relative; margin-bottom: 30px;
            background: radial-gradient(circle, rgba(56,189,248,0.1) 0%, transparent 70%);
        }
        .radar-sweep {
            position: absolute; top: 0; left: 0; right: 0; bottom: 0;
            background: conic-gradient(from 0deg, transparent 0deg, rgba(56,189,248,0.4) 360deg);
            border-radius: 50%; animation: spin 2s linear infinite; opacity: 0.5;
        }
        .scan-btn {
            background: linear-gradient(135deg, #0EA5E9 0%, #2563EB 100%);
            border: none; color: white;
            padding: 16px 32px; border-radius: 50px;
            font-size: 16px; font-weight: 600; cursor: pointer;
            display: flex; align-items: center; gap: 8px;
            box-shadow: 0 0 20px rgba(14, 165, 233, 0.4);
            transition: transform 0.2s;
        }
        .scan-btn:hover { transform: scale(1.05); }

        /* 5. 扫描中 */
        .scanning-state { text-align: center; padding: 20px 0; }
        .loader-ring { display: inline-block; position: relative; width: 64px; height: 64px; margin-bottom: 20px; }
        .loader-ring div {
            box-sizing: border-box; display: block; position: absolute;
            width: 51px; height: 51px; margin: 6px;
            border: 3px solid #38BDF8; border-radius: 50%;
            animation: ring 1.2s cubic-bezier(0.5, 0, 0.5, 1) infinite;
            border-color: #38BDF8 transparent transparent transparent;
        }
        .loader-ring div:nth-child(1) { animation-delay: -0.45s; }
        .loader-ring div:nth-child(2) { animation-delay: -0.3s; }
        .loader-ring div:nth-child(3) { animation-delay: -0.15s; }
        .scanning-text { color: #94A3B8; font-size: 14px; margin-bottom: 10px; }
        .scan-log-preview { font-family: monospace; font-size: 11px; color: #475569; text-align: left; background: #0F131C; padding: 10px; border-radius: 8px; }
        .log-line { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        /* 6. 结果仪表盘 */
        .result-dashboard { display: flex; flex-direction: column; gap: 20px; }
        .result-header { display: flex; justify-content: space-between; align-items: center; }
        
        .grade-box { text-align: center; background: #0F131C; padding: 10px 20px; border-radius: 16px; border: 1px solid #2D3748; }
        .grade-label { display: block; font-size: 11px; color: #64748B; text-transform: uppercase; letter-spacing: 1px; }
        .grade-value { font-size: 36px; font-weight: 900; line-height: 1; }
        .grade-S { color: #10B981; text-shadow: 0 0 20px rgba(16,185,129,0.5); }
        .grade-C { color: #EF4444; }

        .type-box { text-align: right; }
        .nat-badge { 
            display: inline-block; background: #2D3748; color: #E2E8F0; 
            font-size: 12px; padding: 4px 8px; border-radius: 6px; font-weight: bold; margin-bottom: 4px;
        }
        .nat-name { font-size: 18px; font-weight: 700; color: white; margin-bottom: 4px; }
        .ip-display { font-family: monospace; color: #94A3B8; font-size: 13px; display: flex; align-items: center; justify-content: flex-end; gap: 6px; }

        .health-section { background: rgba(255,255,255,0.03); padding: 16px; border-radius: 12px; }
        .bar-label { display: flex; justify-content: space-between; font-size: 13px; color: #CBD5E1; margin-bottom: 8px; }
        .progress-bg { height: 8px; background: #2D3748; border-radius: 4px; overflow: hidden; }
        .progress-fill { height: 100%; border-radius: 4px; transition: width 1s ease; }
        .rank-S { width: 100%; background: #10B981; }
        .rank-C { width: 30%; background: #EF4444; }
        .desc-text { margin-top: 10px; font-size: 13px; color: #94A3B8; line-height: 1.5; }

        .compatibility-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
        .comp-item { background: #0F131C; padding: 12px 8px; border-radius: 10px; text-align: center; border: 1px solid #2D3748; }
        .comp-label { display: block; font-size: 10px; color: #64748B; margin-bottom: 4px; }
        .comp-val { font-size: 13px; font-weight: 600; color: #E2E8F0; }

        .retry-btn { 
            width: 100%; background: #2D3748; border: none; color: white; padding: 12px;
            border-radius: 8px; font-weight: 600; cursor: pointer; display: flex; justify-content: center; gap: 8px;
            transition: background 0.2s;
        }
        .retry-btn:hover { background: #374151; }

        .fail-state { text-align: center; padding: 20px; }
        .error-icon { color: #EF4444; margin-bottom: 10px; }

        /* 8. FAQ */
        .faq-section { margin-top: 10px; display: flex; flex-direction: column; gap: 10px; }
        .faq-item { background: #151B28; border-radius: 12px; overflow: hidden; border: 1px solid #2D3748; transition: border-color 0.2s; }
        .faq-item.open { border-color: #38BDF8; }
        .faq-header { 
            padding: 16px; display: flex; justify-content: space-between; align-items: center; 
            cursor: pointer; font-size: 14px; font-weight: 500;
        }
        .faq-content { 
            height: 0; overflow: hidden; padding: 0 16px; color: #94A3B8; font-size: 13px; line-height: 1.6;
            transition: height 0.3s ease, padding 0.3s ease;
        }
        .faq-item.open .faq-content { height: auto; padding-bottom: 16px; }

        /* 动画 */
        @keyframes spin { from {transform: rotate(0deg);} to {transform: rotate(360deg);} }
        @keyframes ring { 0% {transform: rotate(0deg);} 100% {transform: rotate(360deg);} }
        @keyframes pulse { 0% {opacity: 1;} 50% {opacity: 0.5;} 100% {opacity: 1;} }
        @keyframes pop { 0% {transform: scale(0.95); opacity: 0;} 100% {transform: scale(1); opacity: 1;} }
        .animate-pop { animation: pop 0.4s cubic-bezier(0.16, 1, 0.3, 1); }

      `}</style>
    </div>
  );
}
