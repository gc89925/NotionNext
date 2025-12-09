// pages/nat.js
import { useState, useEffect, useRef } from 'react';

export default function LocalNatTester() {
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [result, setResult] = useState(null);
  const peerConnectionRef = useRef(null);

  const addLog = (msg) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const detectNatType = async () => {
    if (loading) return;
    setLoading(true);
    setLogs([]);
    setResult(null);
    addLog("开始初始化 WebRTC...");

    // 使用 Google 免费的公共 STUN 服务器
    const config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    };

    const pc = new RTCPeerConnection(config);
    peerConnectionRef.current = pc;
    
    const candidates = [];
    let publicIp = null;

    // 创建一个数据通道，这是触发浏览器收集 ICE 候选所必须的
    pc.createDataChannel('nat-test');
    addLog("创建数据通道，准备连接 STUN 服务器...");

    // 监听 ICE 候选收集事件
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const { candidate, type, protocol, address, port } = event.candidate;
        // 只关注 UDP 协议
        if (protocol !== 'udp') return;

        addLog(`收集到候选地址: 类型=${type}, IP=${address}, 端口=${port}`);
        candidates.push(event.candidate);

        // 'srflx' 类型表示通过 STUN 服务器反射得到的公网地址
        if (type === 'srflx' && !publicIp) {
          publicIp = address;
          addLog(`🎉 成功获取本地公网 IP: ${publicIp}`);
        }
      } else {
        addLog("✅ ICE 候选收集完毕。开始分析...");
        analyzeCandidates(candidates, publicIp);
      }
    };

    // 创建一个 Offer 来启动流程
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      addLog("已设置本地描述，等待浏览器与 STUN 服务器通信...");
    } catch (e) {
      addLog(`❌ 发生错误: ${e.message}`);
      setLoading(false);
    }

    // 设置一个超时，防止一直卡住
    setTimeout(() => {
        if (peerConnectionRef.current && peerConnectionRef.current.iceConnectionState !== 'completed') {
            addLog("⏳ 检测超时，强制结束收集。");
            if (peerConnectionRef.current.iceGatheringState !== 'complete') {
                 // 手动触发分析
                 analyzeCandidates(candidates, publicIp);
            }
        }
    }, 10000); // 10秒超时
  };

  const analyzeCandidates = (candidates, publicIp) => {
    if (candidates.length === 0) {
        setResult({ type: "检测失败", desc: "无法连接到 STUN 服务器，可能是网络阻断或浏览器限制。", ip: "未知" });
        setLoading(false);
        peerConnectionRef.current.close();
        return;
    }

    // 筛选出公网映射候选 (server reflex)
    const srflxCandidates = candidates.filter(c => c.type === 'srflx' && c.protocol === 'udp');
    
    let natType = "未知类型";
    let natDesc = "无法确定详细类型";
    let detectedIp = publicIp || "未检测到";

    if (srflxCandidates.length === 0) {
        // 没有获取到公网地址候选，可能非常严格的网络或只支持 TCP
        natType = "连接受限 / 失败";
        natDesc = "浏览器未能通过 UDP 连接到 STUN 服务器获取公网地址。";
    } else {
        // 获取所有映射的公网端口
        const ports = srflxCandidates.map(c => c.port);
        // 检查端口是否唯一。如果连接不同的 STUN 服务器映射了不同的端口，通常意味着是对称 NAT
        const uniquePorts = new Set(ports);

        if (uniquePorts.size > 1) {
            natType = "Symmetric NAT (NAT4)";
            natDesc = "最差。对每个外部目标使用不同的公网映射端口，P2P 联机非常困难。";
            addLog("分析结果: 检测到多个不同的外部映射端口，判定为 Symmetric NAT。");
        } else {
            // 如果端口只有一个，可能是各种锥形 NAT。浏览器 API 很难精确区分是哪一种锥形。
            natType = "Cone NAT (NAT 1-3)";
            natDesc = "较好。包含全锥形、受限锥形等。通常对 P2P 比较友好，但浏览器无法精确区分具体子类型。";
            addLog("分析结果: 外部映射端口一致，判定为某种 Cone NAT。");
        }
    }
    
    setResult({ type: natType, desc: natDesc, ip: detectedIp });
    setLoading(false);
    if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
    }
  };

  useEffect(() => {
    // 组件卸载时清理连接
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
        <p className="subtitle">基于浏览器 WebRTC 技术，直接检测您当前电脑的网络环境。</p>

        {!result && (
            <button onClick={detectNatType} disabled={loading} className="btn">
            {loading ? '正在检测中...' : '开始本地检测'}
            </button>
        )}

        {result && (
            <div className="result-box fadeIn">
                <div className="result-header">检测结果</div>
                
                <div className="info-item highlight">
                    <div className="info-label">公网 IP 地址</div>
                    <div className="info-value">{result.ip}</div>
                </div>

                <div className="info-item" style={{borderLeft: result.type.includes('Symmetric') ? '4px solid red' : '4px solid green'}}>
                    <div className="info-label">推测 NAT 类型</div>
                    <div className="info-value title">{result.type}</div>
                    <div className="info-desc">{result.desc}</div>
                </div>
                
                <button onClick={detectNatType} className="btn retry-btn">重新检测</button>
            </div>
        )}
        
        <div className="log-box">
            <div className="log-title">检测日志 (Debug)</div>
            {logs.length === 0 ? <div className="log-empty">点击开始按钮查看详细日志...</div> : 
             logs.map((log, index) => <div key={index} className="log-entry">{log}</div>)
            }
        </div>

      </div>

      <style jsx>{`
        .container {
          display: flex; justify-content: center; align-items: center;
          min-height: 100vh; padding: 20px; background: #f0f2f5;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
        .card {
          background: white; padding: 30px; border-radius: 12px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.08);
          width: 100%; max-width: 500px;
        }
        h1 { margin: 0 0 10px 0; font-size: 1.8em; text-align: center; color: #1a1a1a; }
        .subtitle { text-align: center; color: #666; margin-bottom: 25px; }
        .btn {
          width: 100%; padding: 14px; border: none; border-radius: 8px;
          background: #0070f3; color: white; font-size: 1.1em; font-weight: 600; cursor: pointer;
          transition: background 0.2s;
        }
        .btn:hover:not(:disabled) { background: #005bb5; }
        .btn:disabled { background: #ccc; cursor: not-allowed; }
        .retry-btn { margin-top: 20px; background: #333; }
        .retry-btn:hover { background: #555; }

        .result-box {
            margin-top: 20px;
        }
        .fadeIn { animation: fadeIn 0.5s ease-in; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

        .result-header { font-weight: bold; margin-bottom: 15px; font-size: 1.2em; }

        .info-item {
            background: #f9f9f9; padding: 15px; border-radius: 8px;
            margin-bottom: 15px; border: 1px solid #eee;
        }
        .highlight { background: #e6f7ff; border-color: #91d5ff; }
        .info-label { font-size: 0.9em; color: #555; margin-bottom: 5px; }
        .info-value { font-size: 1.3em; font-weight: bold; color: #333; font-family: monospace; }
        .info-value.title { font-family: sans-serif; }
        .info-desc { margin-top: 5px; font-size: 0.9em; color: #666; }

        .log-box {
            margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;
        }
        .log-title { font-size: 0.9em; font-weight: bold; margin-bottom: 10px; color: #888; }
        .log-entry { font-size: 0.85em; color: #555; margin-bottom: 4px; font-family: monospace; white-space: pre-wrap; word-break: break-all; }
        .log-empty { font-size: 0.85em; color: #aaa; font-style: italic; }
      `}</style>
    </div>
  );
}
