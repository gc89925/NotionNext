// pages/nat.js
import { useState, useEffect, useRef } from 'react';

export default function LocalNatTester() {
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [result, setResult] = useState(null);
  const peerConnectionRef = useRef(null);

  // 添加日志的辅助函数
  const addLog = (msg) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const detectNatType = async () => {
    if (loading) return;
    setLoading(true);
    setLogs([]);
    setResult(null);
    addLog("🚀 开始初始化 WebRTC...");
    addLog("🌐 正在准备连接国内公共 STUN 服务器...");

    // =================================================================
    // 🔥 核心修改点：配置国内可访问的 STUN 服务器列表
    // =================================================================
    // 浏览器会尝试连接列表中的服务器，直到找到一个可用的。
    // 这些是国内大厂提供的免费公共节点，在国内访问通常比较稳定。
    const config = {
      iceServers: [
        // 腾讯
        { urls: 'stun:stun.qq.com:3478' },
        // 小米
        { urls: 'stun:stun.miwifi.com:3478' },
        // Bilibili (哔哩哔哩)
        { urls: 'stun:stun.chat.bilibili.com:3478' },
        // 湖南卫视
        { urls: 'stun:stun.hitv.com:3478' },
        // 备用：某些地区的运营商可能能连上 Cloudflare
        { urls: 'stun:stun.cloudflare.com:3478' }
      ],
      // 请求更频繁的收集，提高成功率
      iceCandidatePoolSize: 10
    };
    // =================================================================

    try {
        const pc = new RTCPeerConnection(config);
        peerConnectionRef.current = pc;
        
        const candidates = [];
        let publicIp = null;

        // 创建一个数据通道，这是触发浏览器收集 ICE 候选所必须的
        pc.createDataChannel('nat-test', { ordered: true });
        addLog("✅ WebRTC 实例创建完成，数据通道已开启。");

        // 监听连接状态变化
        pc.oniceconnectionstatechange = () => {
             addLog(`📡 连接状态变更: ${pc.iceConnectionState}`);
        };

        // 监听 ICE 候选收集事件 (核心逻辑)
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            const { candidate, type, protocol, address, port } = event.candidate;
            // 我们只关注 UDP 协议，因为 TCP 通常用于最后的后备手段，无法准确反映 NAT 类型
            if (protocol !== 'udp') {
                addLog(`ℹ️ 忽略非 UDP 候选: ${protocol}://${address}:${port} (${type})`);
                return;
            }

            addLog(`🔍 收集到 UDP 候选地址: ${address}:${port} [类型:${type}]`);
            candidates.push(event.candidate);

            // 'srflx' (server reflex) 类型表示通过 STUN 服务器反射得到的公网地址
            // 如果我们拿到了这个类型的地址，说明成功连接上了至少一个 STUN 服务器
            if (type === 'srflx' && !publicIp) {
              publicIp = address;
              addLog(`🎉【成功】通过 STUN 服务器获取到本地公网 IP: ${publicIp}`);
            }
          } else {
            // event.candidate 为 null 时，表示所有候选收集完毕
            addLog("🏁 ICE 候选收集过程结束。开始分析结果...");
            analyzeCandidates(candidates, publicIp);
          }
        };

        // 创建一个 Offer 来启动收集流程
        const offer = await pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false });
        await pc.setLocalDescription(offer);
        addLog("⏳ 已设置本地描述 (SDP)，浏览器正在向 STUN 服务器发起请求...");

    } catch (e) {
      addLog(`❌ 初始化阶段发生严重的未知错误: ${e.message}`);
      setLoading(false);
    }

    // 设置一个15秒的超时兜底，防止因为网络完全不通导致一直卡住
    setTimeout(() => {
        if (peerConnectionRef.current && ['new', 'checking'].includes(peerConnectionRef.current.iceConnectionState)) {
            addLog("⚠️ 检测超时 (15秒)。如果您的网络非常严格或完全断网，可能会发生这种情况。强制结束收集。");
            if (peerConnectionRef.current.iceGatheringState !== 'complete') {
                 // 强制关闭连接，触发 onicecandidate(null) 或手动分析
                 analyzeCandidates(candidates, publicIp);
            }
        }
    }, 15000); 
  };

  // 分析收集到的候选地址，推断 NAT 类型
  const analyzeCandidates = (candidates, publicIp) => {
    if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
    }

    // 筛选出所有成功的 UDP 公网映射候选 (server reflex)
    const srflxCandidates = candidates.filter(c => c.type === 'srflx' && c.protocol === 'udp');
    
    let natType = "检测失败 / 网络阻断";
    let natDesc = "浏览器未能通过 UDP 连接到任何 STUN 服务器。原因可能是：\n1. 您当前没有互联网连接。\n2. 您的防火墙或运营商完全封锁了 UDP 流量。";
    let detectedIp = publicIp || "未检测到";
    let resultStatus = "fail"; // success, warning, fail

    if (srflxCandidates.length > 0) {
        // 成功获取到了公网地址
        detectedIp = publicIp;
        
        // 获取所有映射出的公网端口
        const ports = srflxCandidates.map(c => c.port);
        // 使用 Set 去重，看看映射了几个不同的端口
        const uniquePorts = new Set(ports);

        addLog(`📊 分析报告: 成功从 ${srflxCandidates.length} 个响应中提取到公网信息。共映射了 ${uniquePorts.size} 个不同的外部端口。`);

        if (uniquePorts.size > 1) {
            // 如果浏览器连接不同的 STUN 服务器（IP不同或端口不同），路由器映射的外部端口不一样，这就是对称型 NAT
            natType = "Symmetric NAT (对称型 / NAT4)";
            natDesc = "这是限制最严格的类型。您的路由器对每个外部目标地址都使用不同的映射端口。这对 P2P 联机（如游戏、下载）非常不友好，通常只能作为客户端连接他人，很难作为主机。";
            resultStatus = "fail"; // 用红色强调最差
        } else {
            // 如果无论连接哪个 STUN 服务器，路由器映射的外部端口都一样，这就是锥形 NAT
            // 注意：纯浏览器环境无法精确区分 全锥形(Full) / 受限锥形(Restricted) / 端口受限锥形(Port-Restricted)
            // 因为这需要向特定的 IP/端口发送数据包来测试防火墙规则，浏览器处于安全沙箱中无法做到这一点。
            // 但通常来说，只要不是对称型，对大部分应用来说已经足够好。
            natType = "Cone NAT (锥形 / NAT 1-3)";
            natDesc = "类型较好。包含全锥形、受限锥形等。您的路由器对不同的外部目标使用相同的映射端口。这种类型通常对 P2P 联机比较友好。";
            resultStatus = "success"; // 用绿色强调较好
        }
    } else {
        if (candidates.some(c => c.type === 'host')) {
             addLog("⚠️ 仅收集到本地网络候选 (host)，没有获取到公网候选 (srflx)。说明无法穿透到公网。");
        } else {
             addLog("❌ 没有收集到任何有效的网络候选。WebRTC 可能被浏览器禁用或网络完全不可用。");
        }
    }
    
    setResult({ type: natType, desc: natDesc, ip: detectedIp, status: resultStatus });
    setLoading(false);
  };

  // 组件卸载时清理 WebRTC 连接资源
  useEffect(() => {
    return () => {
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
    };
  }, []);

  return (
    <div className="container">
      <div className="card">
        <h1>本地网络 NAT 检测</h1>
        <p className="subtitle">基于浏览器 WebRTC 技术，直接检测您当前电脑的网络环境。<br/>已优化使用国内 STUN 服务器。</p>

        {!result && (
            <button onClick={detectNatType} disabled={loading} className={`btn ${loading ? 'loading-btn' : ''}`}>
            {loading ? '正在努力检测中 (请稍候)...' : '开始本地检测'}
            </button>
        )}

        {result && (
            <div className="result-box fadeIn">
                <div className="result-header">检测结果</div>
                
                <div className="info-item highlight">
                    <div className="info-label">当前本地公网 IP 地址</div>
                    <div className="info-value">{result.ip}</div>
                </div>

                {/* 根据状态显示不同颜色的边框 */}
                <div className="info-item" style={{
                    borderLeft: result.status === 'fail' ? '5px solid #ff4d4f' : 
                                result.status === 'success' ? '5px solid #52c41a' : '5px solid #faad14'
                }}>
                    <div className="info-label">推测 NAT 类型</div>
                    <div className="info-value title" style={{
                         color: result.status === 'fail' ? '#cf1322' : 
                                result.status === 'success' ? '#389e0d' : 'inherit'
                    }}>{result.type}</div>
                    <div className="info-desc">{result.desc}</div>
                </div>
                
                <button onClick={detectNatType} className="btn retry-btn">重新检测</button>
            </div>
        )}
        
        <div className="log-box">
            <div className="log-title">检测日志 (Debug) - 如果失败请截图此区域</div>
            <div className="log-container">
            {logs.length === 0 ? <div className="log-empty">点击开始按钮查看详细检测过程...</div> : 
             logs.map((log, index) => {
                 let className = "log-entry";
                 if (log.includes("✅") || log.includes("🎉")) className += " log-success";
                 if (log.includes("❌") || log.includes("⚠️")) className += " log-error";
                 return <div key={index} className={className}>{log}</div>;
             })
            }
            </div>
        </div>

      </div>

      {/* CSS 样式 */}
      <style jsx>{`
        .container {
          display: flex; justify-content: center; align-items: center;
          min-height: 100vh; padding: 20px; background: #f0f2f5;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
        .card {
          background: white; padding: 30px; border-radius: 12px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.08);
          width: 100%; max-width: 600px; /* 稍微加宽一点 */
        }
        h1 { margin: 0 0 10px 0; font-size: 1.8em; text-align: center; color: #1a1a1a; }
        .subtitle { text-align: center; color: #666; margin-bottom: 25px; line-height: 1.5; }
        .btn {
          width: 100%; padding: 14px; border: none; border-radius: 8px;
          background: #1890ff; color: white; font-size: 1.1em; font-weight: 600; cursor: pointer;
          transition: all 0.2s;
        }
        .btn:hover:not(:disabled) { background: #40a9ff; }
        .btn:disabled { background: #d9d9d9; color: #8c8c8c; cursor: not-allowed; }
        .loading-btn { opacity: 0.8; }
        .retry-btn { margin-top: 20px; background: #595959; }
        .retry-btn:hover { background: #8c8c8c; }

        .result-box { margin-top: 20px; }
        .fadeIn { animation: fadeIn 0.5s ease-in; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

        .result-header { font-weight: bold; margin-bottom: 15px; font-size: 1.2em; border-bottom: 1px solid #eee; padding-bottom: 10px; }

        .info-item {
            background: #f9f9f9; padding: 15px; border-radius: 8px;
            margin-bottom: 15px; border: 1px solid #e8e8e8;
        }
        .highlight { background: #e6f7ff; border-color: #91d5ff; }
        .info-label { font-size: 0.9em; color: #555; margin-bottom: 8px; font-weight: 500;}
        .info-value { font-size: 1.3em; font-weight: bold; color: #262626; font-family: monospace; }
        .info-value.title { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
        .info-desc { margin-top: 8px; font-size: 0.95em; color: #666; line-height: 1.6; white-space: pre-wrap; }

        .log-box { margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px; }
        .log-title { font-size: 0.9em; font-weight: bold; margin-bottom: 10px; color: #888; }
        .log-container { 
            max-height: 250px; overflow-y: auto; background: #fafafa; padding: 10px; 
            border-radius: 5px; border: 1px solid #eee; font-family: monospace;
        }
        .log-entry { font-size: 0.85em; color: #555; margin-bottom: 4px; white-space: pre-wrap; word-break: break-all; }
        .log-success { color: #389e0d; }
        .log-error { color: #cf1322; }
        .log-empty { font-size: 0.85em; color: #aaa; font-style: italic; padding: 10px; text-align: center;}
      `}</style>
    </div>
  );
}
