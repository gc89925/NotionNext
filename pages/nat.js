import { useState, useRef, useEffect } from 'react';

// ======================== 1. 核心常量定义（优先国内服务器） ========================
// NAT 类型定义（RFC 标准）
const NAT_TYPES = {
  full_cone: {
    name: "Full Cone (全锥形)",
    code: "NAT1",
    color: "#10B981",
    description: "所有来自同一内网IP和端口的请求，映射到同一个公网IP和端口。任何外部主机都可以通过该公网地址访问内网主机。",
    gameSupport: "完美支持",
    icon: "✅"
  },
  restricted_cone: {
    name: "Restricted Cone (限制锥形)",
    code: "NAT2",
    color: "#3B82F6",
    description: "只有先由内网主机向外部某IP发送过数据，该IP才能通过映射的公网地址访问内网主机。端口无限制。",
    gameSupport: "良好支持",
    icon: "🟢"
  },
  port_restricted_cone: {
    name: "Port Restricted Cone (端口限制锥形)",
    code: "NAT3",
    color: "#F59E0B",
    description: "只有先由内网主机向外部某IP:端口发送过数据，该IP:端口才能通过映射的公网地址访问内网主机。",
    gameSupport: "基本支持",
    icon: "🟡"
  },
  symmetric: {
    name: "Symmetric (对称型)",
    code: "NAT4",
    color: "#EF4444",
    description: "不同外部目标地址，内网主机使用不同的公网端口映射。只有对应的外部目标才能回连。",
    gameSupport: "有限支持",
    icon: "🔴"
  },
  unknown: {
    name: "Unknown (未知)",
    code: "NAT0",
    color: "#6B7280",
    description: "无法检测到NAT类型，可能是直连公网或检测失败。",
    gameSupport: "未知",
    icon: "❓"
  }
};

// STUN服务器列表（国内优先 + 备用国际服务器）
const STUN_SERVERS = [
  // 国内可访问服务器（优先）
  { url: 'stun:stun.qq.com:3478', region: '腾讯 (中国)' },
  { url: 'stun:stun.miwifi.com:3478', region: '小米 (中国)' },
  { url: 'stun:stun.aliyun.com:3478', region: '阿里云 (中国)' },
  { url: 'stun:stun.bjtelecom.net:3478', region: '北京电信 (中国)' },
  // 备用国际服务器（国内访问不了时）
  { url: 'stun:stun.cloudflare.com:3478', region: 'Cloudflare (全球)' },
  { url: 'stun:stun.ekiga.net', region: 'Ekiga (欧洲)' },
  { url: 'stun:stun.ideasip.com', region: 'IdeasIP (美国)' },
  { url: 'stun:stun.stunprotocol.org:3478', region: 'STUN Protocol (全球)' },
  // Google服务器（最后尝试）
  { url: 'stun:stun.l.google.com:19302', region: 'Google (全球)' },
  { url: 'stun:stun1.l.google.com:19302', region: 'Google (1)' }
];

// ======================== 2. 图标组件 ========================
const Icons = {
  Radar: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" strokeOpacity="0.3" />
      <circle cx="12" cy="12" r="4" fill="currentColor" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l1.41-1.41M16.17 7.76l1.41-1.41" />
    </svg>
  ),
  Globe: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
  Check: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  Cross: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  Loader: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" strokeDasharray="62.8" strokeDashoffset="15.7" transform="rotate(-90 12 12)">
        <animate attributeName="strokeDashoffset" values="62.8;0" dur="1.5s" repeatCount="indefinite" />
      </circle>
    </svg>
  )
};

// ======================== 3. 核心检测逻辑（适配国内网络） ========================
const NatDetectorPage = () => {
  // React 状态管理
  const [status, setStatus] = useState('idle');
  const [natType, setNatType] = useState(null);
  const [logs, setLogs] = useState([]);
  const [progress, setProgress] = useState(0);
  const [activeServer, setActiveServer] = useState(null);
  
  // 引用管理
  const connectionsRef = useRef([]);
  const logsEndRef = useRef(null);
  const abortControllerRef = useRef(new AbortController());

  // 日志自动滚动
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // 组件卸载清理
  useEffect(() => {
    return () => {
      abortControllerRef.current.abort();
      connectionsRef.current.forEach(pc => {
        try { pc.close(); } catch (e) {}
      });
    };
  }, []);

  // 日志函数
  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { timestamp, message, type }]);
    console.log(`[${type}] ${timestamp} - ${message}`);
  };

  // 重置状态
  const resetState = () => {
    setStatus('idle');
    setNatType(null);
    setLogs([]);
    setProgress(0);
    setActiveServer(null);
    
    connectionsRef.current.forEach(pc => {
      try { pc.close(); } catch (e) {}
    });
    connectionsRef.current = [];
    
    abortControllerRef.current = new AbortController();
  };

  // 解析 ICE 候选者
  const parseIceCandidate = (candidateStr) => {
    try {
      const candidateParts = candidateStr.split(' ');
      if (candidateParts.length < 8) return null;
      
      const foundation = candidateParts[0];
      const component = candidateParts[1];
      const protocol = candidateParts[2];
      const priority = parseInt(candidateParts[3], 10);
      const ip = candidateParts[4];
      const port = parseInt(candidateParts[5], 10);
      
      let type = 'host';
      let relatedAddress = null;
      let relatedPort = null;
      
      for (let i = 7; i < candidateParts.length; i++) {
        const part = candidateParts[i];
        if (part.startsWith('typ=')) {
          type = part.split('=')[1];
        } else if (part.startsWith('raddr=')) {
          relatedAddress = part.split('=')[1];
        } else if (part.startsWith('rport=')) {
          relatedPort = parseInt(part.split('=')[1], 10);
        }
      }
      
      return {
        foundation,
        component,
        protocol,
        priority,
        ip,
        port,
        type,
        relatedAddress,
        relatedPort
      };
    } catch (e) {
      addLog(`候选者解析失败: ${e.message}`, "error");
      return null;
    }
  };

  // 获取 NAT 映射（优化超时和重试）
  const getNatMapping = async (server, retries = 1) => {
    return new Promise((resolve) => {
      if (!server || !server.url) {
        addLog("无效的STUN服务器配置", "error");
        return resolve(null);
      }

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: server.url }],
        iceTransportPolicy: 'all',
        iceCandidatePoolSize: 0
      });
      connectionsRef.current.push(pc);

      // 创建数据通道
      try {
        pc.createDataChannel('nat-detection', { ordered: false });
      } catch (e) {
        addLog(`创建数据通道失败: ${e.message}`, "error");
        pc.close();
        resolve(null);
        return;
      }

      let mapping = null;
      let timeoutId = null;

      // 监听 ICE 候选者
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const candidate = parseIceCandidate(event.candidate.candidate);
          if (candidate && candidate.type === 'srflx') {
            mapping = {
              ip: candidate.ip,
              port: candidate.port,
              type: candidate.type,
              relatedAddress: candidate.relatedAddress,
              relatedPort: candidate.relatedPort,
              server: server.url
            };
            addLog(`✅ 成功获取映射: ${mapping.ip}:${mapping.port} (${server.region})`, "success");
            clearTimeout(timeoutId);
            pc.close();
            resolve(mapping);
          }
        } else if (event.candidate === null) {
          // ICE 收集完成但未找到 srflx 候选者
          clearTimeout(timeoutId);
          pc.close();
          resolve(mapping);
        }
      };

      // 连接状态处理
      pc.oniceconnectionstatechange = () => {
        if (['failed', 'disconnected', 'closed'].includes(pc.iceConnectionState)) {
          clearTimeout(timeoutId);
          if (!mapping && retries > 0) {
            addLog(`⚠️ ${server.region} 连接失败，重试1次`, "warning");
            pc.close();
            setTimeout(() => resolve(getNatMapping(server, retries - 1)), 500);
          } else {
            pc.close();
            resolve(mapping);
          }
        }
      };

      // 创建 Offer
      pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false
      })
      .then(offer => pc.setLocalDescription(offer))
      .catch(error => {
        addLog(`❌ 创建Offer失败: ${error.message} (${server.region})`, "error");
        clearTimeout(timeoutId);
        pc.close();
        resolve(null);
      });

      // 超时处理（国内网络调整为6秒）
      timeoutId = setTimeout(() => {
        addLog(`⏱️ ${server.region} 响应超时 (6秒)`, "warning");
        pc.close();
        if (retries > 0) {
          resolve(getNatMapping(server, retries - 1));
        } else {
          resolve(mapping || null);
        }
      }, 6000);
    });
  };

  // 【关键修复】自动尝试多个服务器获取初始映射
  const getInitialMappingWithFallback = async () => {
    addLog("🔍 尝试获取初始映射（国内服务器优先）", "progress");
    
    // 依次尝试服务器，直到获取到映射
    for (let i = 0; i < STUN_SERVERS.length; i++) {
      const server = STUN_SERVERS[i];
      setActiveServer(server);
      addLog(`📡 尝试服务器: ${server.region} (${server.url})`, "info");
      
      const mapping = await getNatMapping(server);
      if (mapping) {
        addLog(`✅ 初始映射获取成功 (${server.region})`, "success");
        return mapping;
      }
      
      // 检测是否被中止
      if (abortControllerRef.current.signal.aborted) {
        return null;
      }
      
      addLog(`❌ ${server.region} 无法获取映射，尝试下一个`, "warning");
    }
    
    // 所有服务器都失败
    return null;
  };

  // 分析 NAT 行为
  const analyzeNatBehavior = (initialMapping, mappings) => {
    if (mappings.length === 0) {
      addLog("⚠️ 缺少足够的映射数据进行分析", "warning");
      return "unknown";
    }
    
    // 对称 NAT 判断（多数不一致才判定）
    const sameIpCount = mappings.filter(m => m.ip === initialMapping.ip).length;
    const samePortCount = mappings.filter(m => m.port === initialMapping.port).length;
    const totalMappings = mappings.length;
    const isMostlyDifferent = sameIpCount < totalMappings * 0.5 || samePortCount < totalMappings * 0.5;
    
    if (isMostlyDifferent) {
      addLog(`🔴 不同服务器映射差异明显 (IP一致: ${sameIpCount}/${totalMappings}, 端口一致: ${samePortCount}/${totalMappings}) → 对称型 NAT`, "analysis");
      return "symmetric";
    }
    
    addLog(`🟢 大多数服务器映射端口/IP一致 → 锥形 NAT`, "analysis");
    
    // 检查限制类型
    const hasRestrictions = mappings.some(m => 
      m.relatedAddress !== null || m.relatedPort !== null
    );
    
    if (!hasRestrictions) {
      addLog(`🟢 无限制特征 → 全锥形 NAT`, "analysis");
      return "full_cone";
    }
    
    const hasPortRestriction = mappings.some(m => m.relatedPort !== null);
    if (hasPortRestriction) {
      addLog(`🟡 检测到端口限制 → 端口限制锥形 NAT`, "analysis");
      return "port_restricted_cone";
    }
    
    addLog(`🟢 检测到IP限制 → 限制锥形 NAT`, "analysis");
    return "restricted_cone";
  };

  // 核心检测函数
  const detectNATType = async () => {
    if (status === 'scanning') return;
    
    resetState();
    setStatus('scanning');
    addLog("=== 启动 NAT 类型精准检测（适配国内网络）===", "system");
    addLog("遵循 RFC 3489 / RFC 5389 标准，优先使用国内 STUN 服务器", "system");
    
    try {
      // 阶段 1: 获取初始映射（带 fallback）
      setProgress(10);
      addLog("=== 阶段 1: 获取初始公网映射 ===", "progress");
      
      const initialMapping = await getInitialMappingWithFallback();
      if (!initialMapping) {
        throw new Error("所有 STUN 服务器都无法获取映射，请检查网络（关闭代理/VPN）");
      }
      
      addLog(`初始映射信息: ${initialMapping.ip}:${initialMapping.port}`, "success");
      setProgress(30);
      
      // 阶段 2: 检测多服务器映射一致性
      addLog("=== 阶段 2: 检测不同服务器的映射一致性 ===", "progress");
      
      const mappings = [];
      const testServers = STUN_SERVERS.filter(s => s.url !== initialMapping.server).slice(0, 5); // 选5个不同服务器
      
      for (let i = 0; i < testServers.length; i++) {
        const server = testServers[i];
        setActiveServer(server);
        addLog(`📡 测试服务器 ${i+1}/${testServers.length}: ${server.region}`, "info");
        
        const mapping = await getNatMapping(server);
        if (mapping) {
          mappings.push(mapping);
          addLog(`📌 ${server.region} 映射: ${mapping.ip}:${mapping.port}`, "info");
        }
        
        // 更新进度
        setProgress(30 + (i * 50) / testServers.length);
        
        // 检测中止
        if (abortControllerRef.current.signal.aborted) {
          throw new Error("检测已手动中止");
        }
      }
      
      // 阶段 3: 分析 NAT 类型
      setProgress(85);
      addLog("=== 阶段 3: 分析 NAT 行为特征 ===", "progress");
      
      const detectedType = analyzeNatBehavior(initialMapping, mappings);
      setNatType(detectedType);
      addLog(`✅ NAT 类型检测完成: ${NAT_TYPES[detectedType].name} (${NAT_TYPES[detectedType].code})`, "success");
      addLog(`📝 类型描述: ${NAT_TYPES[detectedType].description}`, "info");
      
      // 完成检测
      setProgress(100);
      setStatus('success');
      addLog("=== NAT 检测流程完成 ===", "system");
      
    } catch (error) {
      if (error.message !== "检测已手动中止") {
        addLog(`❌ 检测失败: ${error.message}`, "error");
        setNatType("unknown");
        setStatus('error');
      } else {
        addLog("⚠️ 检测已手动中止", "warning");
        setStatus('idle');
      }
      setProgress(0);
    }
  };

  // 渲染日志项
  const renderLogItem = (log) => {
    const typeStyles = {
      info: "text-slate-300",
      success: "text-emerald-400",
      error: "text-red-400",
      warning: "text-amber-400",
      system: "text-cyan-400",
      progress: "text-purple-400",
      analysis: "text-blue-400",
      debug: "text-slate-400"
    };
    
    return (
      <div key={log.timestamp + log.message} className="flex items-start gap-2 mb-1">
        <span className="text-slate-500 text-xs min-w-[60px]">{log.timestamp}</span>
        <span className={`text-xs ${typeStyles[log.type]}`}>{log.message}</span>
      </div>
    );
  };

  // ======================== 4. UI 渲染 ========================
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 to-slate-900 text-slate-200 font-sans">
      {/* 背景装饰 */}
      <div className="fixed inset-0 z-0 opacity-10">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,rgba(34,197,94,0.1),transparent_70%)]"></div>
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500 rounded-full blur-[100px]"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500 rounded-full blur-[100px]"></div>
      </div>
      
      {/* 主容器 */}
      <div className="relative z-10 max-w-4xl mx-auto px-4 py-8">
        {/* 头部 */}
        <header className="mb-8 text-center">
          <div className="flex justify-center items-center mb-4">
            <Icons.Radar className="w-10 h-10 text-emerald-400 mr-3 animate-pulse" />
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-400">
              NAT 类型精准检测器（国内版）
            </h1>
          </div>
          <p className="text-slate-400 max-w-xl mx-auto">
            适配国内网络环境 | 优先使用腾讯/小米/阿里云 STUN 服务器 | 遵循 RFC 3489/5389 标准
          </p>
        </header>
        
        {/* 主卡片 */}
        <div className="bg-slate-900/60 backdrop-blur-sm border border-slate-800 rounded-2xl shadow-xl overflow-hidden mb-6">
          {/* 检测控制区 */}
          <div className="p-6 border-b border-slate-800">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <div>
                <h2 className="text-xl font-semibold mb-1">检测控制</h2>
                <p className="text-slate-400 text-sm">
                  {status === 'scanning' ? `当前服务器: ${activeServer?.region || '初始化中'}` : 
                   status === 'success' ? `检测结果: ${natType ? NAT_TYPES[natType].name : '未知'}` :
                   "点击开始按钮启动精准检测（国内服务器优先）"}
                </p>
              </div>
              
              <div className="flex gap-3">
                {status === 'scanning' ? (
                  <button
                    onClick={resetState}
                    className="px-4 py-2 bg-red-900/50 hover:bg-red-800/60 text-red-400 rounded-lg flex items-center gap-2 transition-colors"
                  >
                    <Icons.Cross className="w-4 h-4" />
                    中止检测
                  </button>
                ) : (
                  <button
                    onClick={detectNATType}
                    className="px-6 py-2 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white rounded-lg flex items-center gap-2 transition-all shadow-lg hover:shadow-emerald-500/20"
                  >
                    <Icons.Radar className="w-4 h-4" />
                    {status === 'idle' ? '开始检测' : '重新检测'}
                  </button>
                )}
              </div>
            </div>
            
            {/* 进度条 */}
            {status === 'scanning' && (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>检测进度</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>
          
          {/* 结果展示区 */}
          {status === 'success' && natType && (
            <div className="p-6 border-b border-slate-800">
              <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                  <div>
                    <div className="text-slate-400 text-sm mb-1">NAT 类型判定结果</div>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold" style={{ color: NAT_TYPES[natType].color }}>
                        {NAT_TYPES[natType].name}
                      </span>
                      <span className="px-2 py-1 bg-slate-700/50 rounded text-xs" style={{ color: NAT_TYPES[natType].color }}>
                        {NAT_TYPES[natType].code}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 bg-slate-700/30 px-3 py-1.5 rounded-lg">
                    <span className="text-xs text-slate-400">游戏支持:</span>
                    <span className="text-xs font-medium" style={{ color: NAT_TYPES[natType].color }}>
                      {NAT_TYPES[natType].gameSupport}
                    </span>
                  </div>
                </div>
                
                <p className="text-slate-300 text-sm leading-relaxed">
                  {NAT_TYPES[natType].description}
                </p>
                
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/30">
                    <div className="text-xs text-slate-500 mb-1">NAT 等级</div>
                    <div className="text-lg font-semibold" style={{ color: NAT_TYPES[natType].color }}>
                      {NAT_TYPES[natType].code}
                    </div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/30">
                    <div className="text-xs text-slate-500 mb-1">网络标识</div>
                    <div className="text-lg font-semibold">{NAT_TYPES[natType].icon}</div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/30">
                    <div className="text-xs text-slate-500 mb-1">联机质量</div>
                    <div className="text-lg font-semibold" style={{ color: NAT_TYPES[natType].color }}>
                      {natType === 'full_cone' ? '极佳' : 
                       natType === 'restricted_cone' ? '良好' : 
                       natType === 'port_restricted_cone' ? '一般' : 
                       natType === 'symmetric' ? '较差' : '未知'}
                    </div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/30">
                    <div className="text-xs text-slate-500 mb-1">检测时间</div>
                    <div className="text-lg font-semibold text-slate-300">
                      {new Date().toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* 错误提示 */}
          {status === 'error' && (
            <div className="p-6 border-b border-slate-800">
              <div className="bg-red-900/20 border border-red-800/30 rounded-xl p-4 flex items-start gap-3">
                <Icons.Cross className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="text-red-400 font-medium mb-1">检测失败</h3>
                  <p className="text-slate-300 text-sm">
                    所有 STUN 服务器都无法访问，请检查：
                    <ul className="mt-2 list-disc list-inside text-xs text-slate-400">
                      <li>关闭代理、VPN 或梯子</li>
                      <li>确保网络正常连接（重启路由器）</li>
                      <li>暂时关闭防火墙/安全软件</li>
                    </ul>
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {/* 日志区 */}
          <div className="p-6">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-medium flex items-center gap-2">
                <Icons.Globe className="w-4 h-4 text-cyan-400" />
                检测日志
              </h3>
              <button
                onClick={() => setLogs([])}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                disabled={logs.length === 0}
              >
                清空日志
              </button>
            </div>
            
            <div className="bg-slate-800/50 rounded-lg border border-slate-700/50 p-3 h-64 overflow-y-auto text-xs">
              {logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-500">
                  <Icons.Loader className="w-8 h-8 mb-2 opacity-50 animate-spin" />
                  <p>检测日志将显示在这里</p>
                </div>
              ) : (
                logs.map(renderLogItem)
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>
        
        {/* 说明区 */}
        <div className="bg-slate-900/60 backdrop-blur-sm border border-slate-800 rounded-2xl p-6">
          <h3 className="text-lg font-semibold mb-3 text-slate-200">NAT 类型说明</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(NAT_TYPES).map(([key, type]) => (
              <div key={key} className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/30">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{type.icon}</span>
                  <span className="font-medium" style={{ color: type.color }}>{type.name}</span>
                  <span className="text-xs px-1.5 py-0.5 bg-slate-700/50 rounded" style={{ color: type.color }}>
                    {type.code}
                  </span>
                </div>
                <p className="text-xs text-slate-400">{type.description}</p>
                <div className="mt-2 text-xs">
                  <span className="text-slate-500">游戏支持:</span>
                  <span className="ml-1" style={{ color: type.color }}>{type.gameSupport}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {/* 页脚 */}
        <footer className="mt-8 text-center text-xs text-slate-500">
          <p>适配国内网络环境 | 优先使用腾讯/小米/阿里云 STUN 服务器 | 遵循 RFC 3489/5389 标准</p>
        </footer>
      </div>

      {/* 全局样式 */}
      <style dangerouslySetInnerHTML={{ __html: `
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          -webkit-font-smoothing: antialiased;
        }
        
        ::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        
        ::-webkit-scrollbar-track {
          background: rgba(15, 23, 42, 0.5);
          border-radius: 3px;
        }
        
        ::-webkit-scrollbar-thumb {
          background: rgba(71, 85, 105, 0.5);
          border-radius: 3px;
        }
        
        ::-webkit-scrollbar-thumb:hover {
          background: rgba(100, 116, 139, 0.5);
        }
        
        .animate-pulse {
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        
        .animate-spin {
          animation: spin 1.5s linear infinite;
        }
        
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}} />
    </div>
  );
};

// 默认导出 React 组件（关键）
export default NatDetectorPage;
