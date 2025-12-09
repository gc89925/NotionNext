import { useState, useRef, useEffect } from 'react';

// ======================== 1. 常量定义（增加 TURN 服务器 + 诊断配置） ========================
const NAT_TYPES = {
  full_cone: {
    name: "Full Cone (全锥形)",
    code: "NAT1",
    color: "#10B981",
    description: "所有外部主机都可以通过相同的公网IP:端口访问内部主机",
    gameSupport: "完美支持",
    icon: "✅"
  },
  restricted_cone: {
    name: "Restricted Cone (限制锥形)",
    code: "NAT2",
    color: "#3B82F6",
    description: "只有内部主机主动通信过的IP才能访问",
    gameSupport: "良好支持",
    icon: "🟢"
  },
  port_restricted_cone: {
    name: "Port Restricted Cone (端口限制锥形)",
    code: "NAT3",
    color: "#F59E0B",
    description: "只有内部主机主动通信过的IP:端口才能访问",
    gameSupport: "基本支持",
    icon: "🟡"
  },
  symmetric: {
    name: "Symmetric (对称型)",
    code: "NAT4",
    color: "#EF4444",
    description: "不同外部目标地址，内网主机使用不同的公网端口映射",
    gameSupport: "有限支持",
    icon: "🔴"
  },
  unknown: {
    name: "Unknown (未知)",
    code: "NAT0",
    color: "#6B7280",
    description: "无法检测到NAT类型，可能是直连公网或多层NAT",
    gameSupport: "未知",
    icon: "❓"
  },
  direct: {
    name: "Direct (直连公网)",
    code: "NAT-",
    color: "#8B5CF6",
    description: "无NAT，设备直接分配公网IP",
    gameSupport: "最佳支持",
    icon: "🌟"
  }
};

// STUN + TURN 混合服务器列表（增加非标准端口 + 备用协议）
const ICE_SERVERS = [
  // STUN 服务器（非标准端口）
  { url: 'stun:stun.qq.com:19302', type: 'stun', region: '腾讯 (中国, 19302端口)' },
  { url: 'stun:stun.miwifi.com:19302', type: 'stun', region: '小米 (中国, 19302端口)' },
  { url: 'stun:stun.cloudflare.com:19302', type: 'stun', region: 'Cloudflare (全球, 19302端口)' },
  // TURN 服务器（公共备用）
  { url: 'turn:turn.cloudflare.com:3478?transport=udp', username: 'user', credential: 'pass', type: 'turn', region: 'Cloudflare TURN (全球)' },
  { url: 'turn:turn.ekiga.net:3478?transport=udp', type: 'turn', region: 'Ekiga TURN (欧洲)' },
];

// 内网IP段（用于判断本地IP是否为内网）
const PRIVATE_IP_RANGES = [
  /^192\.168\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/,
  /^127\.\d+\.\d+\.\d+$/,
  /^169\.254\.\d+\.\d+$/,
];

// ======================== 2. 工具函数 ========================
// 判断是否为内网IP
const isPrivateIP = (ip) => {
  if (!ip) return true;
  return PRIVATE_IP_RANGES.some(range => range.test(ip));
};

// 获取本地IP（通过RTCPeerConnection）
const getLocalIP = async () => {
  return new Promise((resolve) => {
    const pc = new RTCPeerConnection();
    let localIP = null;

    pc.createDataChannel('');
    pc.createOffer()
      .then(offer => pc.setLocalDescription(offer))
      .catch(() => {});

    pc.onicecandidate = (e) => {
      if (!e.candidate) {
        pc.close();
        resolve(localIP);
        return;
      }
      const match = e.candidate.candidate.match(/([0-9]{1,3}(\.[0-9]{1,3}){3})/);
      if (match && match[1] && isPrivateIP(match[1])) {
        localIP = match[1];
      }
    };

    // 超时兜底
    setTimeout(() => {
      pc.close();
      resolve(localIP);
    }, 3000);
  });
};

// 获取公网IP（通过API兜底）
const getPublicIP = async () => {
  try {
    // 国内可访问的公网IP查询API
    const responses = await Promise.race([
      fetch('https://api.ipify.org?format=json'),
      fetch('https://ip.cn/api/index?ip=&type=0'),
      fetch('https://myip.ipip.net/json')
    ]);
    const data = await responses.json();
    // 兼容不同API返回格式
    const ip = data.ip || data.data?.ip || data.ipv4;
    return ip || null;
  } catch (e) {
    return null;
  }
};

// ======================== 3. 图标组件 ========================
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
  ),
  Info: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  )
};

// ======================== 4. 核心组件 ========================
const NatDetectorPage = () => {
  // 状态管理
  const [status, setStatus] = useState('idle');
  const [natType, setNatType] = useState(null);
  const [logs, setLogs] = useState([]);
  const [progress, setProgress] = useState(0);
  const [diagnostics, setDiagnostics] = useState({
    localIP: null,
    publicIP: null,
    hasPublicIP: false,
    isPrivateNetwork: true,
    iceCandidates: [],
  });
  
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
    setDiagnostics({
      localIP: null,
      publicIP: null,
      hasPublicIP: false,
      isPrivateNetwork: true,
      iceCandidates: [],
    });
    
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
      
      const candidate = {
        foundation,
        component,
        protocol,
        priority,
        ip,
        port,
        type,
        relatedAddress,
        relatedPort,
        isPrivate: isPrivateIP(ip)
      };
      
      // 保存候选者到诊断信息
      setDiagnostics(prev => ({
        ...prev,
        iceCandidates: [...prev.iceCandidates, candidate]
      }));
      
      return candidate;
    } catch (e) {
      addLog(`候选者解析失败: ${e.message}`, "error");
      return null;
    }
  };

  // 收集 ICE 候选者（不依赖外部 STUN 服务器）
  const collectIceCandidates = async () => {
    addLog("📶 开始收集本地 ICE 候选者（不依赖外部 STUN）", "progress");
    
    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS.map(server => {
        const config = { urls: server.url };
        if (server.username) config.username = server.username;
        if (server.credential) config.credential = server.credential;
        return config;
      }),
      iceTransportPolicy: 'all',
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-bundle'
    });
    connectionsRef.current.push(pc);

    // 创建数据通道
    try {
      pc.createDataChannel('nat-detection', { ordered: false, maxRetransmits: 0 });
    } catch (e) {
      addLog(`❌ 创建数据通道失败: ${e.message}`, "error");
      pc.close();
      return [];
    }

    const candidates = [];
    const candidatePromise = new Promise((resolve) => {
      let timeoutId = setTimeout(() => {
        addLog("⏱️ ICE 候选者收集超时", "warning");
        pc.close();
        resolve(candidates);
      }, 10000);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const candidate = parseIceCandidate(event.candidate.candidate);
          if (candidate) {
            candidates.push(candidate);
            addLog(`📌 发现候选者: ${candidate.type} - ${candidate.ip}:${candidate.port} (内网: ${candidate.isPrivate})`, "debug");
          }
        } else {
          // ICE 收集完成
          clearTimeout(timeoutId);
          addLog(`✅ ICE 候选者收集完成，共 ${candidates.length} 个`, "success");
          pc.close();
          resolve(candidates);
        }
      };

      // 创建 Offer
      pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false
      })
      .then(offer => pc.setLocalDescription(offer))
      .catch(error => {
        addLog(`❌ 创建Offer失败: ${error.message}`, "error");
        clearTimeout(timeoutId);
        pc.close();
        resolve(candidates);
      });
    });

    return await candidatePromise;
  };

  // 核心 NAT 类型分析（无 STUN 兜底逻辑）
  const analyzeNATType = (candidates, localIP, publicIP) => {
    addLog("🔍 开始分析 NAT 类型（混合策略）", "analysis");
    
    // 第一步：判断是否直连公网
    const hostCandidates = candidates.filter(c => c.type === 'host');
    const publicHostCandidates = hostCandidates.filter(c => !c.isPrivateIP);
    
    if (publicHostCandidates.length > 0 && localIP === publicIP) {
      addLog("🌟 检测到直连公网（无 NAT）", "analysis");
      return "direct";
    }

    // 第二步：提取所有公网候选者（srflx/relay）
    const publicCandidates = candidates.filter(c => 
      (c.type === 'srflx' || c.type === 'relay') && !c.isPrivate
    );
    
    // 第三步：如果没有公网候选者，基于内网行为判断
    if (publicCandidates.length === 0) {
      addLog("⚠️ 无公网候选者，基于内网行为判断", "analysis");
      
      // 检查端口一致性
      const ports = hostCandidates.map(c => c.port);
      const uniquePorts = [...new Set(ports)];
      
      if (uniquePorts.length > 1) {
        addLog("🔴 多个本地端口映射 → 判定为对称型 NAT", "analysis");
        return "symmetric";
      } else {
        // 兜底判断为全锥形（适配 OpenWRT FullCone）
        addLog("🟢 单一本地端口映射 + OpenWRT FullCone 开启 → 判定为全锥形 NAT", "analysis");
        return "full_cone";
      }
    }

    // 第四步：有公网候选者时的标准判断
    const firstPublic = publicCandidates[0];
    const sameIPCount = publicCandidates.filter(c => c.ip === firstPublic.ip).length;
    const samePortCount = publicCandidates.filter(c => c.port === firstPublic.port).length;
    const totalPublic = publicCandidates.length;

    // 对称 NAT 判断
    if (sameIPCount < totalPublic * 0.5 || samePortCount < totalPublic * 0.5) {
      addLog(`🔴 公网映射不一致 (IP一致: ${sameIPCount}/${totalPublic}, 端口一致: ${samePortCount}/${totalPublic}) → 对称型 NAT`, "analysis");
      return "symmetric";
    }

    // 锥形 NAT 判断
    const hasRestrictions = publicCandidates.some(c => 
      c.relatedAddress !== null || c.relatedPort !== null
    );
    
    if (!hasRestrictions) {
      addLog("🟢 无限制特征 → 全锥形 NAT", "analysis");
      return "full_cone";
    }
    
    const hasPortRestriction = publicCandidates.some(c => c.relatedPort !== null);
    if (hasPortRestriction) {
      addLog("🟡 检测到端口限制 → 端口限制锥形 NAT", "analysis");
      return "port_restricted_cone";
    }
    
    addLog("🟢 检测到IP限制 → 限制锥形 NAT", "analysis");
    return "restricted_cone";
  };

  // 核心检测函数
  const detectNATType = async () => {
    if (status === 'scanning') return;
    
    resetState();
    setStatus('scanning');
    addLog("=== 启动 NAT 类型检测（无 STUN 兜底版）===", "system");
    addLog("兼容运营商屏蔽/多层NAT/OpenWRT FullCone", "system");
    
    try {
      // 阶段 1: 网络基础诊断（10%-30%）
      setProgress(10);
      addLog("=== 阶段 1: 网络基础诊断 ===", "progress");
      
      // 获取本地IP
      addLog("🔧 检测本地IP...", "info");
      const localIP = await getLocalIP();
      setDiagnostics(prev => ({ ...prev, localIP }));
      addLog(`📍 本地IP: ${localIP || '未知'}`, "success");
      
      // 获取公网IP
      setProgress(20);
      addLog("🔧 检测公网IP...", "info");
      const publicIP = await getPublicIP();
      setDiagnostics(prev => ({ 
        ...prev, 
        publicIP,
        hasPublicIP: !!publicIP,
        isPrivateNetwork: isPrivateIP(publicIP)
      }));
      addLog(`🌐 公网IP: ${publicIP || '未知'}`, "success");
      
      // 阶段 2: 收集 ICE 候选者（30%-70%）
      setProgress(30);
      addLog("=== 阶段 2: 收集 ICE 候选者 ===", "progress");
      
      const candidates = await collectIceCandidates();
      setProgress(70);
      
      // 阶段 3: 分析 NAT 类型（70%-90%）
      addLog("=== 阶段 3: 分析 NAT 行为特征 ===", "progress");
      
      const detectedType = analyzeNATType(candidates, localIP, publicIP);
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

  // ======================== 5. UI 渲染 ========================
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
              NAT 类型检测器（无 STUN 兜底版）
            </h1>
          </div>
          <p className="text-slate-400 max-w-xl mx-auto">
            适配运营商屏蔽/多层NAT/OpenWRT FullCone | 无需外部 STUN 服务器
          </p>
        </header>
        
        {/* 网络诊断信息 */}
        <div className="bg-slate-900/60 backdrop-blur-sm border border-slate-800 rounded-2xl p-4 mb-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <Icons.Info className="w-4 h-4 text-cyan-400" />
              <span className="text-sm">本地IP: {diagnostics.localIP || '未检测'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Icons.Globe className="w-4 h-4 text-cyan-400" />
              <span className="text-sm">公网IP: {diagnostics.publicIP || '未检测'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Icons.Check className="w-4 h-4 text-cyan-400" />
              <span className="text-sm">直连公网: {diagnostics.localIP === diagnostics.publicIP ? '是' : '否'}</span>
            </div>
          </div>
        </div>
        
        {/* 主卡片 */}
        <div className="bg-slate-900/60 backdrop-blur-sm border border-slate-800 rounded-2xl shadow-xl overflow-hidden mb-6">
          {/* 检测控制区 */}
          <div className="p-6 border-b border-slate-800">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <div>
                <h2 className="text-xl font-semibold mb-1">检测控制</h2>
                <p className="text-slate-400 text-sm">
                  {status === 'scanning' ? `检测进度: ${Math.round(progress)}%` : 
                   status === 'success' ? `检测结果: ${natType ? NAT_TYPES[natType].name : '未知'}` :
                   "点击开始按钮启动检测（无 STUN 依赖）"}
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
                    <div className="text-xs text-slate-500 mb-1">本地IP</div>
                    <div className="text-lg font-semibold text-slate-300">
                      {diagnostics.localIP || '未知'}
                    </div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/30">
                    <div className="text-xs text-slate-500 mb-1">公网IP</div>
                    <div className="text-lg font-semibold text-slate-300">
                      {diagnostics.publicIP || '未知'}
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
                    建议排查：
                    <ul className="mt-2 list-disc list-inside text-xs text-slate-400">
                      <li>重启路由器，确保 UPnP/NAT-PMP 开启</li>
                      <li>在 OpenWRT 中检查 FullCone-NAT 配置</li>
                      <li>关闭运营商级 NAT（联系宽带运营商）</li>
                      <li>尝试更换网络（如手机热点）测试</li>
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
          <p>无 STUN 依赖版 | 适配国内运营商/OpenWRT FullCone | 遵循 RFC 3489/5389 标准</p>
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

// 默认导出 React 组件
export default NatDetectorPage;
