import { useState, useRef } from 'react';

// -----------------------------------------------------------------------------
// SVG 图标库
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
  AlertTriangle: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
  ),
  Globe: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1 4-10 15.3 15.3 0 0 1 4-10z"/></svg>
  ),
  Server: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
  )
};

export default function NatTester() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [logs, setLogs] = useState([]); // 增加日志显示以便调试
  const connectionsRef = useRef([]);

  const addLog = (msg) => {
    console.log(msg);
    setLogs(prev => [...prev, msg]);
  };

  const startTest = async () => {
    if (loading) return;
    setLoading(true);
    setResult(null);
    setLogs([]);
    connectionsRef.current.forEach(pc => pc.close());
    connectionsRef.current = [];

    // 精选的高质量 STUN 服务器列表 (国内+国际混合，确保多样性)
    const stunServers = [
      'stun:stun.qq.com:3478',
      'stun:stun.miwifi.com:3478',
      'stun:stun.chat.bilibili.com:3478',
      'stun:stun.l.google.com:19302', // 如果能连上最好，连不上会超时忽略
      'stun:stun.cloudflare.com:3478' 
    ];

    addLog("🚀 开始多路并行检测...");

    try {
      // 核心修改：为每个 STUN 服务器创建一个独立的 PeerConnection
      // 这样可以强制浏览器分别向它们发送请求，而不是只选一个
      const promises = stunServers.map(serverUrl => {
        return new Promise((resolve) => {
          const pc = new RTCPeerConnection({
            iceServers: [{ urls: serverUrl }],
            iceCandidatePoolSize: 1
          });
          connectionsRef.current.push(pc);

          let foundCandidate = null;

          // 创建数据通道触发 ICE 收集
          pc.createDataChannel('ping');

          pc.onicecandidate = (e) => {
            if (e.candidate) {
              const { type, protocol, address, port } = e.candidate;
              // 只记录 UDP 的公网反射地址 (srflx)
              if (protocol === 'udp' && type === 'srflx') {
                foundCandidate = { serverUrl, address, port };
                addLog(`📡 [${serverUrl}] 发现映射: ${address}:${port}`);
              }
            } else {
              // 收集结束
              resolve(foundCandidate);
            }
          };

          // 3秒超时，防止某个服务器连不上卡住
          setTimeout(() => {
            resolve(foundCandidate);
          }, 3000);
          
          // 创建 Offer 启动流程
          pc.createOffer().then(offer => pc.setLocalDescription(offer)).catch(() => resolve(null));
        });
      });

      // 等待所有探测任务完成
      const candidates = (await Promise.all(promises)).filter(c => c !== null);
      
      analyze(candidates);

    } catch (err) {
      addLog(`❌ 错误: ${err.message}`);
      setLoading(false);
    }
  };

  const analyze = (candidates) => {
    // 1. 基础数据验证
    if (candidates.length === 0) {
      setResult({
        type: "检测失败 / 全局阻断",
        status: "fail",
        ip: "---",
        port: "---",
        desc: "无法连接到任何 STUN 服务器。请检查是否断网或防火墙拦截了所有 UDP 流量。",
        score: 0
      });
      setLoading(false);
      return;
    }

    // 提取 IP 和 端口
    const uniqueIps = new Set(candidates.map(c => c.address));
    const ips = Array.from(uniqueIps);
    const ports = candidates.map(c => c.port);
    const mainIp = ips[0];

    // 2. 核心判定逻辑
    let type = "未知";
    let status = "warning";
    let score = 50;
    let desc = "";

    // 如果所有服务器返回的公网 IP 不一致，这是非常罕见的双重 NAT 或路由异常
    if (uniqueIps.size > 1) {
        type = "异常: 多重公网 IP";
        desc = "检测到多个不同的公网出口 IP，这通常意味着极不稳定的路由或多线负载均衡。";
    } else {
        // IP 一致，分析端口映射规律
        
        // 如果只收集到 1 个样本，无法对比
        if (candidates.length < 2) {
             type = "样本不足 (Inconclusive)";
             desc = "仅成功连接到 1 个 STUN 服务器，无法通过对比判断 NAT 类型。建议重试或检查网络。";
             status = "warning";
        } else {
            // 有多个样本，检查端口是否一致
            const uniquePorts = new Set(ports);

            if (uniquePorts.size === 1) {
                // 连接不同服务器，外部映射端口完全一致 -> 锥形 NAT
                type = "Cone NAT (NAT 1-3)";
                status = "success";
                score = 95;
                desc = "检测到端口映射保持一致。这是理想的网络环境，P2P 联机体验极佳。";
            } else {
                // 连接不同服务器，外部映射端口发生变化 -> 对称型 NAT
                type = "Symmetric NAT (NAT4)";
                status = "fail";
                score = 20;
                desc = "检测到针对不同目标服务器使用了不同的映射端口。这是最严格的 NAT 类型，极易导致游戏联机失败 (Strict)。";
            }
        }
    }

    setResult({ type, ip: mainIp, port: ports.join(', '), status, desc, score });
    setLoading(false);
  };

  return (
    <div className="page-wrapper">
      <div className="bg-glow"></div>
      
      <div className="content-container">
        
        <div className="header">
          <h1>NAT 深度检测 Pro</h1>
          <p>多路并发探测算法，精准识别 NAT4 对称型网络</p>
        </div>

        <div className="action-area">
          <button 
            onClick={startTest} 
            disabled={loading} 
            className={`main-btn ${loading ? 'loading' : ''}`}
          >
            {loading ? <span className="spinner"></span> : <Icons.Wifi />}
            <span>{loading ? '正在进行多路探测...' : '开始深度检测'}</span>
          </button>
        </div>

        {result && (
          <div className="result-card pop-in">
            <div className="result-header">
                <span className="badge">检测报告</span>
                <span className="timestamp">{new Date().toLocaleTimeString()}</span>
            </div>

            <div className="status-display">
                <div className={`status-icon ${result.status}`}>
                    {result.status === 'success' ? <Icons.CheckCircle /> : 
                     result.status === 'fail' ? <Icons.XCircle /> : <Icons.AlertTriangle />}
                </div>
                <div className="status-text">
                    <div className="label">判定结果</div>
                    <div className={`value ${result.status}`}>{result.type}</div>
                </div>
            </div>

            <div className="health-bar-container">
                <div className="flex-between">
                    <span>网络质量评分</span>
                    <span className={result.status === 'success' ? 'text-green' : result.status === 'fail' ? 'text-red' : 'text-yellow'}>
                        {result.score}
                    </span>
                </div>
                <div className="progress-track">
                    <div 
                        className="progress-fill" 
                        style={{
                            width: `${result.score}%`, 
                            backgroundColor: result.status === 'success' ? '#10b981' : 
                                             result.status === 'fail' ? '#ef4444' : '#f59e0b'
                        }}
                    ></div>
                </div>
            </div>

            <div className="info-grid">
                <div className="info-item">
                    <div className="icon-wrap"><Icons.Globe /></div>
                    <div>
                        <div className="info-label">公网 IP</div>
                        <div className="info-val">{result.ip}</div>
                    </div>
                </div>
                <div className="info-item">
                    <div className="icon-wrap"><Icons.Server /></div>
                    <div>
                        <div className="info-label">采样端口数据</div>
                        <div className="info-val small">{result.port}</div>
                    </div>
                </div>
            </div>

            <div className="desc-box">
                <p>{result.desc}</p>
            </div>
            
            {/* 调试日志区域，只有在出现问题时有意义 */}
            <div className="logs-area">
                <div className="logs-title">探测日志 (Debug)</div>
                {logs.map((log, i) => <div key={i} className="log-line">{log}</div>)}
            </div>
        </div>
        )}

      </div>

      <style jsx>{`
        /* 样式复用并微调，保持极客风格 */
        .page-wrapper {
            min-height: 100vh;
            background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
            color: #fff;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            display: flex; justify-content: center; padding: 20px;
        }
        .bg-glow {
            position: absolute; top: -100px; left: 50%; transform: translateX(-50%);
            width: 600px; height: 600px;
            background: radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, rgba(0,0,0,0) 70%);
            pointer-events: none;
        }
        .content-container { width: 100%; max-width: 480px; z-index: 1; display: flex; flex-direction: column; gap: 24px; }
        
        .header { text-align: center; margin-top: 20px; }
        .header h1 { 
            font-size: 2rem; font-weight: 800; margin: 0;
            background: linear-gradient(to right, #38bdf8, #818cf8);
            -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        }
        .header p { color: #94a3b8; margin-top: 8px; font-size: 0.9rem; }

        .action-area { display: flex; justify-content: center; }
        .main-btn {
            background: linear-gradient(90deg, #2563eb, #4f46e5);
            border: none; padding: 16px 40px; border-radius: 50px;
            color: white; font-size: 1.1rem; font-weight: 600; cursor: pointer;
            box-shadow: 0 10px 25px -5px rgba(37, 99, 235, 0.4);
            display: flex; align-items: center; gap: 12px; width: 100%; justify-content: center;
        }
        .main-btn.loading { opacity: 0.8; }
        .spinner {
            width: 20px; height: 20px; border: 3px solid rgba(255,255,255,0.3);
            border-radius: 50%; border-top-color: white; animation: spin 1s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .result-card {
            background: rgba(30, 41, 59, 0.8); backdrop-filter: blur(12px);
            border: 1px solid rgba(255,255,255,0.1); border-radius: 24px; padding: 24px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.3); animation: popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        @keyframes popIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }

        .result-header { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 0.8rem; color: #64748b; }
        .badge { background: rgba(255,255,255,0.1); padding: 2px 8px; border-radius: 4px; }

        .status-display { 
            display: flex; align-items: center; gap: 16px; margin-bottom: 24px; 
            background: rgba(0,0,0,0.2); padding: 16px; border-radius: 16px;
        }
        .status-icon { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; }
        .status-icon.success { background: rgba(16, 185, 129, 0.15); color: #10b981; }
        .status-icon.fail { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
        .status-icon.warning { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
        
        .value { font-size: 1.25rem; font-weight: bold; }
        .value.success { color: #fff; text-shadow: 0 0 20px rgba(16, 185, 129, 0.5); }
        .value.fail { color: #fca5a5; }
        .value.warning { color: #fcd34d; }

        .health-bar-container { margin-bottom: 24px; }
        .flex-between { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.9rem; color: #cbd5e1; }
        .text-green { color: #34d399; } .text-red { color: #f87171; } .text-yellow { color: #fbbf24; }
        .progress-track { height: 6px; background: #334155; border-radius: 3px; overflow: hidden; }
        .progress-fill { height: 100%; transition: width 1s ease; border-radius: 3px; }

        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
        .info-item { 
            background: rgba(255,255,255,0.03); border-radius: 16px; padding: 16px; 
            display: flex; align-items: center; gap: 12px; overflow: hidden;
        }
        .icon-wrap { color: #818cf8; opacity: 0.8; flex-shrink: 0; }
        .info-label { font-size: 0.75rem; color: #64748b; margin-bottom: 2px; }
        .info-val { font-size: 1rem; font-weight: 600; font-family: monospace; letter-spacing: 0.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .info-val.small { font-size: 0.8rem; }

        .desc-box { background: rgba(0,0,0,0.2); padding: 15px; border-radius: 12px; font-size: 0.9rem; line-height: 1.5; color: #cbd5e1; border-left: 4px solid #6366f1; }
        
        .logs-area { margin-top: 20px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.1); }
        .logs-title { font-size: 0.75rem; color: #64748b; margin-bottom: 8px; }
        .log-line { font-family: monospace; font-size: 0.7rem; color: #64748b; margin-bottom: 2px; }
      `}</style>
    </div>
  );
}
