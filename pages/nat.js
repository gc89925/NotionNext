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
        let publicPort = null;

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
              publicPort = port;
              addLog(`🎉【成功】通过 STUN 服务器获取到本地公网 IP: ${publicIp}`);
            }
          } else {
            // event.candidate 为 null 时，表示所有候选收集完毕
            addLog("🏁 ICE 候选收集过程结束。开始分析结果...");
            analyzeCandidates(candidates, publicIp, publicPort);
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
                 analyzeCandidates(candidates, publicIp, publicPort);
            }
        }
    }, 15000); 
  };

  // 分析收集到的候选地址，推断 NAT 类型
  const analyzeCandidates = (candidates, publicIp, publicPort) => {
    if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
    }

    // 筛选出所有成功的 UDP 公网映射候选 (server reflex)
    const srflxCandidates = candidates.filter(c => c.type === 'srflx' && c.protocol === 'udp');
    
    let natType = "检测失败 / 网络阻断";
    let detectedIp = publicIp || "未检测到";
    let detectedPort = publicPort || "未检测到";
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
            natType = "Symmetric NAT (NAT4)";
            resultStatus = "fail"; // 用红色强调最差
        } else {
            // 如果无论连接哪个 STUN 服务器，路由器映射的外部端口都一样，这就是锥形 NAT
            // 注意：纯浏览器环境无法精确区分 全锥形(Full) / 受限锥形(Restricted) / 端口受限锥形(Port-Restricted)
            // 因为这需要向特定的 IP/端口发送数据包来测试防火墙规则，浏览器处于安全沙箱中无法做到这一点。
            // 但通常来说，只要不是对称型，对大部分应用来说已经足够好。
            natType = "Cone NAT (NAT 1-3)";
            resultStatus = "success"; // 用绿色强调较好
        }
    } else {
        if (candidates.some(c => c.type === 'host')) {
             addLog("⚠️ 仅收集到本地网络候选 (host)，没有获取到公网候选 (srflx)。说明无法穿透到公网。");
        } else {
             addLog("❌ 没有收集到任何有效的网络候选。WebRTC 可能被浏览器禁用或网络完全不可用。");
        }
    }
    
    setResult({ type: natType, ip: detectedIp, port: detectedPort, status: resultStatus });
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
      <div className="card main-card">
        <h1><span style={{color:'#4F46E5'}}>⚡</span> NAT 类型检测</h1>
        
        {!result && (
            <button onClick={detectNatType} disabled={loading} className={`btn ${loading ? 'loading-btn' : ''}`}>
            {loading ? '正在检测中...' : '开始检测'}
            </button>
        )}

        {result && (
            <div className="result-box fadeIn">
                
                <div className="result-item">
                    <div className="result-label">NAT 类型:</div>
                    <div className="result-value" style={{
                         color: result.status === 'fail' ? '#cf1322' : 
                                result.status === 'success' ? '#389e0d' : 'inherit'
                    }}>{result.type}</div>
                </div>
                
                <div className="result-item">
                    <div className="result-label">公网 IP:</div>
                    <div className="result-value">{result.ip}</div>
                </div>

                <div className="result-item">
                    <div className="result-label">端口:</div>
                    <div className="result-value">{result.port}</div>
                </div>

                <div style={{textAlign: 'center', fontSize: '2em', margin: '20px 0'}}>🎉</div>
                <div style={{textAlign: 'center', color: '#666'}}>当前网络类型：{result.status === 'success' ? 'NAT1' : result.status === 'fail' ? 'NAT4' : 'NAT2/3'}</div>
                
                <button onClick={detectNatType} className="btn retry-btn">重新检测</button>
            </div>
        )}

      </div>
      
      <div className="card info-card">
        <h2>ⓘ 关于 NAT 类型</h2>
        <p style={{color: '#666', fontSize: '0.9em', lineHeight: '1.6'}}>网络地址转换 (NAT) 影响着您与其他互联网用户的连接能力，并影响着为您提供连接的质量。以及NAT类型对您网络的影响。您在缓冲视频时就可能遭受了这个问题的困扰。关于四种类型的访问:</p>
        <ul>
            <li><strong>Full Cone (NAT1):</strong> 最佳。完全开放，任何外部主机均可访问。</li>
            <li><strong>Restricted Cone (NAT2):</strong> 较好。仅允许您发送过数据的 IP 回传数据。</li>
            <li><strong>Port-Restricted Cone (NAT3):</strong> 一般。限制更严，要求外部 IP 和端口都匹配。</li>
            <li><strong>Symmetric (NAT4):</strong> 最差。对每个外部目标使用不同的映射，P2P 困难。</li>
        </ul>
      </div>

      {/* CSS 样式 */}
      <style jsx>{`
        .container {
          display: flex; flex-direction: column; align-items: center;
          min-height: 100vh; padding: 20px; background: #f0f2f5;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
        .card {
          background: white; padding: 30px; border-radius: 12px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.08);
          width: 100%; max-width: 600px;
          margin-bottom: 20px;
        }
        .main-card {
            text-align: center;
            background: #1a1a1a;
            color: white;
        }
        .info-card {
            background: #fff;
            color: #333;
        }
        h1 { margin: 0 0 20px 0; font-size: 1.8em; text-align: center; }
        h2 { margin: 0 0 15px 0; font-size: 1.2em; }
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

        .result-box { margin-top: 20px; text-align: left; }
        .fadeIn { animation: fadeIn 0.5s ease-in; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

        .result-item {
            display: flex;
            justify-content: space-between;
            padding: 10px 0;
            border-bottom: 1px solid #333;
        }
        .result-label {
            color: #aaa;
        }
        .result-value {
            font-weight: bold;
            font-family: monospace;
        }

        ul { padding-left: 20px; color: #666; font-size: 0.9em; lineHeight: 1.6; }
        li { margin-bottom: 10px; }
      `}</style>
    </div>
  );
}
