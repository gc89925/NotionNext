import { useState, useRef, useEffect } from 'react';

// -----------------------------------------------------------------------------
// SVG 图标
// -----------------------------------------------------------------------------
const Icons = {
  Radar: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.48m12.72-4.24a10 10 0 0 1 0 14.14m-16.96.01a10 10 0 0 1 0-14.15"/></svg>,
  Globe: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  Check: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Cross: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Chevron: ({ open }) => <svg style={{transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s'}} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>,
  Refresh: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
};

export default function NatTester() {
  const [status, setStatus] = useState('idle');
  const [result, setResult] = useState(null);
  const [logs, setLogs] = useState([]);
  const [expandedFaq, setExpandedFaq] = useState(0);
  const pcRef = useRef(null);

  const addLog = (msg) => {
    setLogs(prev => [...prev, msg]);
  };

  const startScan = async () => {
    if (status === 'scanning') return;
    setStatus('scanning');
    setResult(null);
    setLogs([]);
    
    if (pcRef.current) pcRef.current.close();

    addLog("⚡ 启动 V8.0 单链路多源检测 (Strict Mode)...");

    try {
      // 策略改变：在一个 PC 中放入多个 STUN 服务器
      // 目的：诱导浏览器使用同一个本地端口去连接不同的服务器
      // 只有这样，我们才能真正看出路由器的端口映射策略
      const config = {
        iceServers: [
            { urls: 'stun:stun.qq.com:3478' },
            { urls: 'stun:stun.miwifi.com:3478' },
            { urls: 'stun:stun.chat.bilibili.com:3478' },
            { urls: 'stun:stun.l.google.com:19302' }, 
            { urls: 'stun:stun.cloudflare.com:3478' }
        ],
        iceCandidatePoolSize: 0, // 禁用预收集，强制实时探测
        bundlePolicy: 'max-bundle'
      };

      const pc = new RTCPeerConnection(config);
      pcRef.current = pc;
      
      const candidates = []; // 存储所有发现的公网映射

      pc.createDataChannel('ping'); // 触发 ICE 收集

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          const { protocol, type, address, port } = e.candidate;
          // 仅记录 UDP 的公网反射 (srflx)
          if (protocol === 'udp' && type === 'srflx') {
            // 去重：因为可能会收到重复的 candidate
            const exists = candidates.some(c => c.address === address && c.port === port);
            if (!exists) {
                candidates.push({ address, port });
                addLog(`📡 [STUN反馈] IP: ${address} | 端口: ${port}`);
            }
          }
        } else {
          addLog("🏁 浏览器 ICE 收集结束，开始严厉判定...");
          analyzeResults(candidates);
        }
      };

      // 4秒超时强制判定
      setTimeout(() => {
        if (pc.iceGatheringState !== 'complete') {
          addLog("⏳ 收集超时，基于现有数据判定...");
          analyzeResults(candidates);
          pc.close();
        }
      }, 4000);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

    } catch (e) {
      addLog("❌ 错误: " + e.message);
      setStatus('fail');
    }
  };

  // ---------------------------------------------------------------------------
  // 核心判定逻辑 V8.0 (严厉版)
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
    
    // 1. IP 稳定性检查
    if (uniqueIps.size > 1) {
       type = "异常: 多重公网 IP";
       natCode = "Bad";
       gameGrade = "C";
       desc = "检测到出口 IP 不一致，网络路由极不稳定。";
       hostability = "低";
    } else {
       // 2. 端口一致性检查 (这是判断 Cone vs Symmetric 的金标准)
       
       if (uniquePorts.size === 1) {
           // === 情况 A: 连接多个服务器，端口完全没变 ===
           // 只有路由器是 Full Cone 且浏览器复用了连接时才会发生
           type = "Cone NAT (锥形)";
           natCode = "NAT1/2"; 
           gameGrade = "S";
           desc = "优质网络！端口映射保持一致。这通常代表 Full Cone 或受限较小的 Cone NAT。";
           hostability = "完美支持";
       } else {
           // === 情况 B: 端口变了 ===
           // 在这个版本中，我们不再帮用户找借口。
           // 如果你关了 FullCone，路由器变成了 Symmetric，这里端口一定会变，我们直接报 NAT4。
           // 虽然浏览器随机化也可能导致变动，但为了“准”，我们宁可误报为严厉，也不能把坏报成好。
           type = "Symmetric NAT (对称型)";
           natCode = "NAT4";
           gameGrade = "C"; 
           desc = "检测到端口映射变化。对于不同目标服务器，您的网络使用了不同的映射端口。这是严格的 NAT 类型。";
           hostability = "不支持";
       }
    }

    // 补充说明：前端无法区分 NAT1 (Full) 和 NAT2 (Restricted)，统称为 Cone NAT
    if (natCode === 'NAT1/2') {
        type = "Cone NAT (兼容 NAT1)";
    }

    setResult({ ip: mainIp, type, natCode, gameGrade, desc, hostability, portCount: uniquePorts.size });
    setStatus('success');
  };

  return (
    <div className="app-container">
      <div className="bg-grid"></div>
      
      <main className="main-content">
        
        <header className="header">
          <div className="logo-area">
            <span className="logo-icon"><Icons.Radar /></span>
            <h1>Net<span className="highlight">Scope</span> V8</h1>
          </div>
          <p className="subtitle">单链路多源检测 - 严厉模式</p>
        </header>

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
                <p className="scanning-text">正在向 5 个全球节点发送探测包...</p>
                <div className="scan-log-preview">
                   {logs.slice(-3).map((l,i) => <div key={i} className="log-line">{l}</div>)}
                </div>
             </div>
          )}

          {status === 'success' && result && (
            <div className="result-dashboard animate-pop">
              
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

              <div className="health-section">
                <div className="bar-label">
                  <span>网络开放度</span>
                  <span>{result.gameGrade === 'S' ? '95%' : '20%'}</span>
                </div>
                <div className="progress-bg">
                  <div className={`progress-fill rank-${result.gameGrade}`}></div>
                </div>
                <p className="desc-text">{result.desc}</p>
              </div>

              <div className="compatibility-grid">
                 <div className="comp-item">
                    <span className="comp-label">主机建房</span>
                    <span className="comp-val">{result.hostability}</span>
                 </div>
                 <div className="comp-item">
                    <span className="comp-label">Nintendo Switch</span>
                    <span className="comp-val">
                       {result.gameGrade === 'S' ? 'A' : 'D'}
                    </span>
                 </div>
                 <div className="comp-item">
                    <span className="comp-label">PS5 / Xbox</span>
                    <span className="comp-val">
                       {result.gameGrade === 'S' ? 'Type 1/2' : 'Type 3'}
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
                <p>无法连接 STUN 服务器。请检查是否已关闭代理软件。</p>
                <button className="retry-btn" onClick={startScan}>重试</button>
             </div>
          )}
        </div>

        {/* 游戏体验预测卡片 */}
        {status === 'success' && result && (
          <div className="card game-card animate-slide-up">
             <h3><Icons.Globe /> 游戏连通性预测</h3>
             <div className="game-list">
                <div className="game-row">
                   <span className="game-name">Minecraft (P2P)</span>
                   <span className={`game-status ${result.gameGrade === 'S' ? 'good' : 'bad'}`}>
                      {result.gameGrade === 'S' ? '可作主机' : '不可作主机'}
                   </span>
                </div>
             </div>
          </div>
        )}

        <div className="faq-section">
           {[
             {q: "这个版本有什么不同?", a: "V8 版本采用了最严厉的判定逻辑。只要检测到任何端口变化，就会判定为 Symmetric NAT4。这能准确反映您关闭 FullCone 后的网络状态变化。"},
             {q: "为什么显示 Cone NAT 而不是 NAT1?", a: "因为没有后端服务器辅助，纯浏览器技术无法从物理上区分 NAT1 (Full) 和 NAT2 (Restricted)。但只要显示为 Cone NAT (S级)，您的网络质量就已经达到了 NAT1/2 的水平。"}
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

        /* 游戏卡片 */
        .game-card h3 { margin: 0 0 16px 0; font-size: 16px; display: flex; align-items: center; gap: 8px; }
        .game-list { display: flex; flex-direction: column; gap: 12px; }
        .game-row { display: flex; justify-content: space-between; align-items: center; padding-bottom: 12px; border-bottom: 1px solid #2D3748; }
        .game-row:last-child { border-bottom: none; padding-bottom: 0; }
        .game-name { font-size: 14px; }
        .game-status { font-size: 13px; font-weight: 600; }
        .good { color: #10B981; }
        .bad { color: #EF4444; }

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

        @keyframes spin { from {transform: rotate(0deg);} to {transform: rotate(360deg);} }
        @keyframes ring { 0% {transform: rotate(0deg);} 100% {transform: rotate(360deg);} }
        @keyframes pulse { 0% {opacity: 1;} 50% {opacity: 0.5;} 100% {opacity: 1;} }
        @keyframes pop { 0% {transform: scale(0.95); opacity: 0;} 100% {transform: scale(1); opacity: 1;} }
        .animate-pop { animation: pop 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
        .animate-slide-up { animation: pop 0.5s ease-out backwards; animation-delay: 0.1s; }

      `}</style>
    </div>
  );
}
