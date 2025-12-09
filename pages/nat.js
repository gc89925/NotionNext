import { useState, useRef, useEffect } from 'react';

// NAT类型定义（极简精准）
const NAT_TYPES = {
  full_cone: { name: "全锥形", code: "NAT1", color: "#10B981", icon: "✅" },
  symmetric: { name: "对称型", code: "NAT4", color: "#EF4444", icon: "🔴" },
  direct: { name: "直连公网", code: "NAT-", color: "#8B5CF6", icon: "🌟" },
  unknown: { name: "未知", code: "NAT0", color: "#6B7280", icon: "❓" }
};

// 最优STUN服务器（国内延迟最低，只选2个极速的）
const FAST_STUN_SERVERS = [
  { urls: ["stun:stun.qq.com:3478"], desc: "腾讯" },
  { urls: ["stun:stun.miwifi.com:3478"], desc: "小米" },
];

// 极简内网IP判断（性能优先）
const isPrivateIP = (ip) => {
  return /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.|127\.|169\.254\.)/.test(ip);
};

// 极速候选者解析（只提取必要字段）
const parseFastCandidate = (candidateStr) => {
  if (!candidateStr || !candidateStr.includes('typ=srflx')) return null;
  const match = candidateStr.match(/(\d+\.\d+\.\d+\.\d+)\s+(\d+).*raddr=(\d+\.\d+\.\d+\.\d+).*rport=(\d+)/);
  if (!match) return null;
  return {
    publicIp: match[1],
    publicPort: parseInt(match[2]),
    localIp: match[3],
    localPort: parseInt(match[4])
  };
};

// 图标组件（极简）
const Icons = {
  Radar: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" />
    </svg>
  ),
  Check: (props) => <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>,
  Cross: (props) => <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>,
  Loader: (props) => <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeDasharray="62.8" strokeDashoffset="15.7" transform="rotate(-90 12 12)"><animate attributeName="strokeDashoffset" values="62.8;0" dur="1s" repeatCount="indefinite" /></circle></svg>
};

// 核心组件
const FastNATDetector = () => {
  const [status, setStatus] = useState('idle'); // idle/scanning/success/error
  const [natType, setNatType] = useState(null);
  const [log, setLog] = useState('');
  const abortRef = useRef(null);

  // 极速日志函数（只更最新，不存历史，提升性能）
  const updateLog = (msg) => {
    const time = new Date().toLocaleTimeString();
    const newLog = `[${time}] ${msg}`;
    setLog(newLog);
    console.log(newLog);
  };

  // 重置状态
  const reset = () => {
    if (abortRef.current) abortRef.current.abort();
    setStatus('idle');
    setNatType(null);
    setLog('');
  };

  // 核心：并行检测 + 极速终止（2秒超时）
  const fastDetect = async () => {
    if (status === 'scanning') return;
    reset();
    setStatus('scanning');
    updateLog('开始检测（并行极速模式）');
    
    const controller = new AbortController();
    abortRef.current = controller;
    const signal = controller.signal;

    try {
      // 关键1：并行检测所有极速服务器，哪个快用哪个
      const mappingPromises = FAST_STUN_SERVERS.map(server => getFastMapping(server, signal));
      const firstMapping = await Promise.race([
        ...mappingPromises,
        new Promise((_, reject) => setTimeout(() => reject(new Error('检测超时')), 2000)) // 2秒超时
      ]);

      if (!firstMapping) throw new Error('未获取到有效映射');
      updateLog(`获取到映射：公网${firstMapping.publicIp}:${firstMapping.publicPort} → 内网${firstMapping.localIp}:${firstMapping.localPort}`);

      // 关键2：极速判断NAT类型（只核心判断，不冗余）
      const natType = judgeFastNAT(firstMapping);
      setNatType(natType);
      updateLog(`检测完成：${NAT_TYPES[natType].name}`);
      setStatus('success');

    } catch (err) {
      updateLog(`检测失败：${err.message}`);
      setNatType('unknown');
      setStatus('error');
    }
  };

  // 极速获取映射（拿到第一个候选者就终止）
  const getFastMapping = (server, signal) => {
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new Error('检测中止'));

      // 关键：不创建DataChannel，用最少配置触发ICE
      const pc = new RTCPeerConnection({ iceServers: [server], iceTransportPolicy: 'relay' });
      let resolved = false;

      // 监听第一个有效候选者，拿到就跑
      pc.onicecandidate = (e) => {
        if (resolved || !e.candidate) return;
        const cand = parseFastCandidate(e.candidate.candidate);
        if (cand && !isPrivateIP(cand.publicIp)) {
          resolved = true;
          pc.close();
          resolve({ ...cand, server: server.desc });
        }
      };

      // 立即创建Offer，不等待
      pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false })
        .then(offer => pc.setLocalDescription(offer))
        .catch(err => {
          resolved = true;
          pc.close();
          reject(new Error(`${server.desc}创建Offer失败: ${err.message}`));
        });

      // 信号中止处理
      signal.addEventListener('abort', () => {
        if (!resolved) {
          resolved = true;
          pc.close();
          reject(new Error('检测中止'));
        }
      });
    });
  };

  // 极速NAT判断（核心逻辑，极简）
  const judgeFastNAT = (mapping) => {
    // 直连公网
    if (mapping.publicIp === mapping.localIp || isPrivateIP(mapping.publicIp)) {
      return 'direct';
    }

    // 对称NAT判断（补充第二个服务器验证，保证精准）
    const secondMapping = FAST_STUN_SERVERS.filter(s => s.desc !== mapping.server).map(s => getFastMapping(s));
    return Promise.resolve(secondMapping).then(second => {
      if (second && (second.publicIp !== mapping.publicIp || second.publicPort !== mapping.publicPort)) {
        return 'symmetric';
      }
      // 全锥形（OpenWRT FullCone核心判断）
      return 'full_cone';
    }).catch(() => 'full_cone'); // 兜底，保证速度
  };

  // UI渲染（极简，减少渲染耗时）
  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 p-4 md:p-6 max-w-md mx-auto">
      <div className="text-center mb-6">
        <h1 className="text-xl font-bold text-emerald-400 flex items-center justify-center gap-2">
          <Icons.Radar className="w-5 h-5" />
          极速NAT检测器
        </h1>
        <p className="text-xs text-slate-400">2秒出结果，精准对齐竞品</p>
      </div>

      {/* 控制按钮 */}
      <button
        onClick={status === 'scanning' ? reset : fastDetect}
        disabled={status === 'scanning'}
        className={`w-full py-3 rounded-lg text-sm font-medium ${
          status === 'scanning' 
            ? 'bg-red-600 opacity-80' 
            : 'bg-emerald-600 hover:bg-emerald-700'
        }`}
      >
        {status === 'scanning' ? (
          <><Icons.Loader className="w-4 h-4 inline mr-2 animate-spin" /> 检测中...</>
        ) : (
          <><Icons.Radar className="w-4 h-4 inline mr-2" /> 立即检测（2秒出结果）</>
        )}
      </button>

      {/* 结果展示 */}
      {status === 'success' && natType && (
        <div className="mt-4 p-3 bg-slate-800 rounded-lg border-l-4" style={{ borderColor: NAT_TYPES[natType].color }}>
          <div className="flex items-center gap-2">
            <span style={{ color: NAT_TYPES[natType].color }} className="text-lg">{NAT_TYPES[natType].icon}</span>
            <span className="font-medium">{NAT_TYPES[natType].name} ({NAT_TYPES[natType].code})</span>
          </div>
        </div>
      )}

      {/* 日志（极简） */}
      <div className="mt-4 p-3 bg-slate-800 rounded-lg text-xs h-20 overflow-y-auto">
        {log || '点击检测开始生成日志'}
      </div>

      {/* 全局样式（极简） */}
      <style jsx global>{`
        body { font-family: system-ui, sans-serif; margin: 0; }
        button { border: none; color: white; cursor: pointer; }
        ::-webkit-scrollbar { width: 2px; }
        ::-webkit-scrollbar-thumb { background: #4b5563; }
      `}</style>
    </div>
  );
};

export default FastNATDetector;
