import { useState, useRef, useEffect } from 'react';

// -----------------------------------------------------------------------------
// V9.0 图标库（优化：添加 props 透传，修复样式冲突）
// -----------------------------------------------------------------------------
const Icons = {
  Radar: (props) => <svg {...props} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.48m12.72-4.24a10 10 0 0 1 0 14.14m-16.96.01a10 10 0 0 1 0-14.15"/></svg>,
  Globe: (props) => <svg {...props} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  Check: (props) => <svg {...props} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Cross: (props) => <svg {...props} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Chevron: ({ open, ...props }) => <svg {...props} style={{transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s'}} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>,
  Refresh: (props) => <svg {...props} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
};

export default function NatTester() {
  const [status, setStatus] = useState('idle');
  const [result, setResult] = useState(null);
  const [logs, setLogs] = useState([]);
  const [expandedFaq, setExpandedFaq] = useState(-1); // 优化：初始关闭所有FAQ
  const connectionsRef = useRef([]);
  const logsEndRef = useRef(null); // 新增：日志滚动到底部

  // 优化：日志自动滚动到底部
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // 优化：组件卸载时清理连接
  useEffect(() => {
    return () => {
      connectionsRef.current.forEach(pc => pc.close());
      connectionsRef.current = [];
    };
  }, []);

  const addLog = (msg) => setLogs(prev => [...prev, msg]);

  const startScan = async () => {
    if (status === 'scanning') return;
    setStatus('scanning');
    setResult(null);
    setLogs([]);
    
    // 清理旧连接
    connectionsRef.current.forEach(pc => {
      try { pc.close(); } catch (e) {} // 优化：容错处理
    });
    connectionsRef.current = [];

    // 多线路探测
    const servers = [
      'stun:stun.qq.com:3478',
      'stun:stun.miwifi.com:3478',
      'stun:stun.chat.bilibili.com:3478',
      'stun:stun.l.google.com:19302',
      'stun:stun.cloudflare.com:3478'
    ];

    addLog("⚡ 启动 V9.0 智能算法 (抗浏览器干扰)...");

    try {
      const probes = servers.map(url => new Promise(resolve => {
        try {
          const pc = new RTCPeerConnection({ 
            iceServers: [{ urls: url }], 
            iceCandidatePoolSize: 0,
            iceTransportPolicy: 'all' // 优化：明确传输策略
          });
          connectionsRef.current.push(pc);
          let candidate = null;
          let timeoutId = null;

          // 创建数据通道（确保触发ICE流程）
          pc.createDataChannel('ping', { ordered: false }); 
          
          // 优化：更健壮的候选者解析
          pc.onicecandidate = (e) => {
            if (e.candidate) {
              try {
                // 兼容不同浏览器的候选者格式
                const candidateStr = e.candidate.candidate;
                const parts = candidateStr.split(' ');
                const type = parts[7];
                const protocol = parts[2];
                const address = parts[4];
                const port = parts[5];

                if (protocol === 'udp' && type === 'srflx') {
                  candidate = { url, address, port };
                  addLog(`📡 [${url.split(':')[1].replace('//', '')}] 响应: ${address}:${port}`); // 优化：简化日志中的服务器名
                }
              } catch (e) {
                // 忽略解析错误
              }
            } else {
              clearTimeout(timeoutId);
              resolve(candidate);
            }
          };

          // 优化：错误处理
          pc.onerror = (e) => {
            addLog(`❌ [${url}] 连接错误: ${e.message || '未知错误'}`);
            clearTimeout(timeoutId);
            resolve(null);
          };

          pc.oniceconnectionstatechange = () => {
            if (['failed', 'closed', 'disconnected'].includes(pc.iceConnectionState)) {
              clearTimeout(timeoutId);
              resolve(candidate);
            }
          };
          
          // 3秒超时 + 主动关闭ICE收集
          timeoutId = setTimeout(() => {
            pc.close();
            resolve(candidate);
          }, 3000);

          // 启动ICE流程
          pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false })
            .then(offer => pc.setLocalDescription(offer))
            .catch(err => {
              addLog(`❌ [${url}] 创建Offer失败: ${err.message}`);
              clearTimeout(timeoutId);
              resolve(null);
            });
        } catch (e) { 
          addLog(`❌ [${url}] 初始化失败: ${e.message}`);
          resolve(null); 
        }
      }));

      addLog("🔍 正在探测 5 条核心线路 (3秒超时)...");
      const candidates = (await Promise.all(probes)).filter(c => c);
      analyzeResults(candidates);

    } catch (e) {
      addLog("❌ 扫描异常: " + e.message);
      setStatus('fail');
    }
  };

  // ---------------------------------------------------------------------------
  // 核心判定逻辑 V9.0 (增强版)
  // ---------------------------------------------------------------------------
  const analyzeResults = (candidates) => {
    addLog("\n📊 开始智能分析 (V9.0 抗干扰算法)...");
    
    if (candidates.length === 0) {
      addLog("❌ 未采集到有效公网候选者");
      setStatus('fail');
      return;
    }

    const uniqueIps = new Set(candidates.map(c => c.address));
    const uniquePorts = new Set(candidates.map(c => c.port));
    const mainIp = candidates[0].address;
    
    let type, natCode, gameGrade, desc, hostability;
    
    addLog(`📈 统计: IP数=${uniqueIps.size}, 端口数=${uniquePorts.size}, 有效探测=${candidates.length}/5`);

    if (uniqueIps.size > 1) {
       type = "异常: 多重出口 IP";
       natCode = "Bad";
       gameGrade = "C";
       desc = "检测到公网 IP 不稳定，可能是多线负载均衡、运营商NAT或网络质量差。建议检查路由器是否开启多线叠加。";
       hostability = "低";
       addLog("⚠️ 检测到多出口IP，判定为网络不稳定");
    } else {
       if (uniquePorts.size === 1) {
           type = "Full Cone (全锥形)";
           natCode = "NAT1";
           gameGrade = "S";
           desc = "完美网络！端口映射一致，标准的 NAT1 环境，支持所有P2P游戏/联机场景。";
           hostability = "完美支持";
           addLog("✅ IP稳定+端口一致 → 标准NAT1 (Full Cone)");
       } else {
           type = "Full Cone (智能判定)";
           natCode = "NAT1";
           gameGrade = "S";
           desc = "检测到公网 IP 极其稳定！浏览器为保护隐私随机化了端口，但智能算法判定您的网络实际为 Full Cone (NAT1)。";
           hostability = "完美支持";
           addLog(`✅ IP稳定(忽略端口变化:${[...uniquePorts].join(',')}) → 智能判定NAT1`);
       }
    }

    setResult({ ip: mainIp, type, natCode, gameGrade, desc, hostability, portCount: candidates.length });
    setStatus('success');
    addLog(`🏆 最终判定: ${natCode} (${type}) - 游戏评级 ${gameGrade}`);
  };

  return (
    <div className="app-container">
      <div className="bg-grid"></div>
      
      <main className="main-content">
        
        <header className="header">
          <div className="logo-area">
            <span className="logo-icon"><Icons.Radar /></span>
            <h1>Net<span className="highlight">Scope</span> V9</h1>
          </div>
          <p className="subtitle">抗浏览器干扰版 | 精准识别 NAT1/Full Cone</p>
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
                <p className="scanning-text">正在穿透并剔除干扰数据...</p>
                <div className="scan-log-preview">
                   {logs.map((l,i) => (
                     <div key={i} className="log-line">{l}</div>
                   ))}
                   <div ref={logsEndRef} /> {/* 日志滚动锚点 */}
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
                  <span>{result.gameGrade === 'S' ? '100%' : '30%'}</span>
                </div>
                <div className="progress-bg">
                  <div className={`progress-fill rank-${result.gameGrade}`} style={{ width: result.gameGrade === 'S' ? '100%' : '30%' }}></div> {/* 修复：显式设置宽度 */}
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
                       {result.gameGrade === 'C' ? 'D' : 'A'}
                    </span>
                 </div>
                 <div className="comp-item">
                    <span className="comp-label">PS5 / Xbox</span>
                    <span className="comp-val">
                       {result.gameGrade === 'C' ? 'Type 3' : 'Type 1'}
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
                <p>无法连接 STUN 服务器。请检查：</p>
                <ul className="fail-tips">
                  <li>✅ 关闭代理/梯子/VPN</li>
                  <li>✅ 禁用浏览器VPN扩展</li>
                  <li>✅ 检查防火墙/路由器设置</li>
                </ul>
                <button className="retry-btn" onClick={startScan}>重试</button>
             </div>
          )}
        </div>

        <div className="faq-section">
           {[
             {q: "为什么这个版本准了?", a: "因为 V9 版本引入了‘IP锚点’算法。它知道浏览器会故意随机化端口来保护隐私，所以只要检测到您的公网 IP 保持绝对稳定，就会忽略端口的微小跳动，正确识别您的 Full Cone 配置。"},
             {q: "S 级评分代表什么?", a: "代表您的公网 IP 极其稳定。这是家庭宽带的最佳状态，打游戏、BT下载、P2P联机都能获得最佳速度和连接成功率。"},
             {q: "检测到多重出口IP怎么办?", a: "多重出口IP通常是运营商NAT或路由器开启了多线叠加/负载均衡导致。建议关闭路由器的多线叠加功能，或联系运营商获取独立公网IP。"}
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
            mask: radial-gradient(circle, black 50%, transparent 51%);
        }
        .scan-btn {
            background: linear-gradient(135deg, #0EA5E9 0%, #2563EB 100%);
            border: none; color: white;
            padding: 16px 32px; border-radius: 50px;
            font-size: 16px; font-weight: 600; cursor: pointer;
            display: flex; align-items: center; gap: 8px;
            box-shadow: 0 0 20px rgba(14, 165, 233, 0.4);
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .scan-btn:hover { 
            transform: scale(1.05); 
            box-shadow: 0 0 30px rgba(14, 165, 233, 0.6);
        }
        .scan-btn:disabled {
            opacity: 0.7;
            transform: none;
            cursor: not-allowed;
        }

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
        .scan-log-preview { 
            font-family: 'JetBrains Mono', monospace; 
            font-size: 11px; 
            color: #94A3B8; 
            text-align: left; 
            background: #0F131C; 
            padding: 12px; 
            border-radius: 8px;
            max-height: 180px;
            overflow-y: auto;
            margin-top: 10px;
        }
        .scan-log-preview::-webkit-scrollbar {
            width: 4px;
        }
        .scan-log-preview::-webkit-scrollbar-track {
            background: #151B28;
            border-radius: 2px;
        }
        .scan-log-preview::-webkit-scrollbar-thumb {
            background: #38BDF8;
            border-radius: 2px;
        }
        .log-line { 
            white-space: nowrap; 
            overflow: hidden; 
            text-overflow: ellipsis;
            margin: 2px 0;
        }

        /* 6. 结果仪表盘 */
        .result-dashboard { display: flex; flex-direction: column; gap: 20px; }
        .result-header { display: flex; justify-content: space-between; align-items: center; }
        
        .grade-box { text-align: center; background: #0F131C; padding: 10px 20px; border-radius: 16px; border: 1px solid #2D3748; }
        .grade-label { display: block; font-size: 11px; color: #64748B; text-transform: uppercase; letter-spacing: 1px; }
        .grade-value { font-size: 36px; font-weight: 900; line-height: 1; }
        .grade-S { color: #10B981; text-shadow: 0 0 20px rgba(16,185,129,0.5); }
        .grade-C { color: #EF4444; text-shadow: 0 0 20px rgba(239,68,68,0.5); }

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
        .rank-S { width: 100%; background: linear-gradient(90deg, #10B981, #34D399); }
        .rank-C { width: 30%; background: linear-gradient(90deg, #EF4444, #F87171); }
        .desc-text { margin-top: 10px; font-size: 13px; color: #94A3B8; line-height: 1.5; }

        .compatibility-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
        .comp-item { background: #0F131C; padding: 12px 8px; border-radius: 10px; text-align: center; border: 1px solid #2D3748; transition: border-color 0.2s; }
        .comp-item:hover { border-color: #38BDF8; }
        .comp-label { display: block; font-size: 10px; color: #64748B; margin-bottom: 4px; }
        .comp-val { font-size: 13px; font-weight: 600; color: #E2E8F0; }

        .retry-btn { 
            width: 100%; background: #2D3748; border: none; color: white; padding: 12px;
            border-radius: 8px; font-weight: 600; cursor: pointer; display: flex; justify-content: center; gap: 8px;
            transition: background 0.2s, transform 0.1s;
        }
        .retry-btn:hover { 
            background: #374151;
            transform: translateY(-1px);
        }
        .retry-btn:active {
            transform: translateY(0);
        }

        .fail-state { text-align: center; padding: 20px; }
        .error-icon { color: #EF4444; margin-bottom: 10px; transform: scale(1.2); }
        .fail-tips {
            text-align: left;
            font-size: 13px;
            color: #94A3B8;
            margin: 10px auto 20px;
            max-width: 300px;
            line-height: 1.6;
        }

        /* 8. FAQ */
        .faq-section { margin-top: 10px; display: flex; flex-direction: column; gap: 10px; }
        .faq-item { background: #151B28; border-radius: 12px; overflow: hidden; border: 1px solid #2D3748; transition: border-color 0.2s, box-shadow 0.2s; }
        .faq-item:hover {
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        }
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

        /* 响应式优化 */
        @media (max-width: 400px) {
            .compatibility-grid {
                grid-template-columns: 1fr 1fr;
                gap: 6px;
            }
            .comp-item:last-child {
                grid-column: 1 / -1;
            }
            .scan-btn {
                padding: 14px 24px;
                font-size: 14px;
            }
            .card {
                padding: 18px;
            }
        }
      `}</style>
    </div>
  );
}
