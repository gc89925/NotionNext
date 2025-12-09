// NAT类型定义
const NAT_TYPES = {
  full_cone: {
    name: "Full Cone (全锥形)",
    code: "FC",
    description: "所有外部主机都可以通过相同的公网IP:端口访问内部主机"
  },
  restricted_cone: {
    name: "Restricted Cone (限制锥形)",
    code: "RC",
    description: "只有内部主机主动通信过的IP才能访问"
  },
  port_restricted_cone: {
    name: "Port Restricted Cone (端口限制锥形)",
    code: "PRC",
    description: "只有内部主机主动通信过的IP:端口才能访问"
  },
  symmetric: {
    name: "Symmetric (对称型)",
    code: "SYM",
    description: "不同外部主机对应不同的公网IP:端口"
  },
  unknown: {
    name: "Unknown (未知类型)",
    code: "UNK",
    description: "无法确定NAT类型"
  }
};

// STUN服务器列表（增加多样性和数量）
const STUN_SERVERS = [
  { url: 'stun:stun.l.google.com:19302', region: 'Google (Global)' },
  { url: 'stun:stun1.l.google.com:19302', region: 'Google (1)' },
  { url: 'stun:stun2.l.google.com:19302', region: 'Google (2)' },
  { url: 'stun:stun3.l.google.com:19302', region: 'Google (3)' },
  { url: 'stun:stun4.l.google.com:19302', region: 'Google (4)' },
  { url: 'stun:stun.ekiga.net', region: 'Ekiga (Europe)' },
  { url: 'stun:stun.ideasip.com', region: 'IdeasIP (US)' },
  { url: 'stun:stun.schlund.de', region: 'Schlund (Europe)' },
  { url: 'stun:stun.stunprotocol.org:3478', region: 'STUN Protocol (Global)' },
  { url: 'stun:stun.voiparound.com', region: 'VoIPAround (Global)' }
];

// 状态管理变量
let status = 'idle'; // idle, scanning, success, error
let natType = 'unknown';
let progress = 0;
let activeServer = null;
let logs = [];
const abortControllerRef = { current: new AbortController() };

// 日志函数
const addLog = (message, type = 'info') => {
  logs.push({
    timestamp: new Date().toISOString(),
    message,
    type
  });
  console.log(`[${type}] ${message}`);
  // 这里可以添加UI更新逻辑
};

// 重置状态
const resetState = () => {
  logs = [];
  progress = 0;
  natType = 'unknown';
  abortControllerRef.current = new AbortController();
};

// 解析ICE候选者
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

// 获取NAT映射
const getNatMapping = async (server, retries = 2) => {
  return new Promise((resolve) => {
    if (!server || !server.url) {
      addLog("无效的STUN服务器配置", "error");
      return resolve(null);
    }

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: server.url }],
      iceTransportPolicy: 'all'
    });

    // 创建数据通道以触发ICE收集
    pc.createDataChannel('nat-detection');

    let mapping = null;
    let timeoutId = null;

    // 监听ICE候选者
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const candidate = parseIceCandidate(event.candidate.candidate);
        if (candidate && candidate.type === 'srflx') { // 仅关注服务器反射的候选者
          mapping = {
            ip: candidate.ip,
            port: candidate.port,
            type: candidate.type,
            relatedAddress: candidate.relatedAddress,
            relatedPort: candidate.relatedPort,
            server: server.url
          };
          addLog(`成功获取映射: ${mapping.ip}:${mapping.port}`, "debug");
          clearTimeout(timeoutId);
          pc.close();
          resolve(mapping);
        }
      }
    };

    // 处理连接状态变化
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed' || 
          pc.iceConnectionState === 'disconnected' || 
          pc.iceConnectionState === 'closed') {
        if (!mapping && retries > 0) {
          addLog(`服务器 ${server.url} 连接失败，重试中...`, "warning");
          clearTimeout(timeoutId);
          pc.close();
          setTimeout(() => {
            resolve(getNatMapping(server, retries - 1));
          }, 1000);
        } else if (!mapping) {
          addLog(`服务器 ${server.url} 无法获取映射`, "error");
          pc.close();
          resolve(null);
        }
      }
    };

    // 创建offer以触发ICE流程
    pc.createOffer()
      .then(offer => pc.setLocalDescription(offer))
      .catch(error => {
        addLog(`创建offer失败: ${error.message}`, "error");
        clearTimeout(timeoutId);
        pc.close();
        resolve(null);
      });

    // 超时处理
    timeoutId = setTimeout(() => {
      addLog(`服务器 ${server.url} 响应超时`, "warning");
      pc.close();
      if (retries > 0) {
        resolve(getNatMapping(server, retries - 1));
      } else {
        resolve(mapping || null);
      }
    }, 8000);
  });
};

// 分析NAT行为
const analyzeNatBehavior = (initialMapping, mappings) => {
  if (mappings.length === 0) {
    addLog("缺少足够的映射数据进行分析", "warning");
    return "unknown";
  }
  
  // 检查是否为对称NAT
  const sameIpCount = mappings.filter(m => m.ip === initialMapping.ip).length;
  const samePortCount = mappings.filter(m => m.port === initialMapping.port).length;
  const isMostlyDifferent = sameIpCount < mappings.length * 0.5 || samePortCount < mappings.length * 0.5;
  
  if (isMostlyDifferent) {
    addLog(`不同服务器映射差异明显 (IP一致: ${sameIpCount}/${mappings.length}, 端口一致: ${samePortCount}/${mappings.length}) → 判定为对称型 NAT`, "analysis");
    return "symmetric";
  }
  
  // 锥形NAT判断
  addLog("大多数服务器映射端口/IP一致 → 锥形 NAT", "analysis");
  
  // 检查是否有地址/端口限制
  const hasRestrictions = mappings.some(m => 
    m.relatedAddress !== null || m.relatedPort !== null
  );
  
  if (!hasRestrictions) {
    addLog("无限制特征 → 全锥形 NAT", "analysis");
    return "full_cone";
  }
  
  // 检查端口限制
  const hasPortRestriction = mappings.some(m => m.relatedPort !== null);
  if (hasPortRestriction) {
    addLog("检测到端口限制特征 → 端口限制锥形 NAT", "analysis");
    return "port_restricted_cone";
  }
  
  // IP限制
  addLog("检测到IP限制特征 → 限制锥形 NAT", "analysis");
  return "restricted_cone";
};

// 设置状态更新函数（可根据框架替换）
const setStatus = (newStatus) => {
  status = newStatus;
  // 这里可以添加UI状态更新逻辑
};

const setProgress = (value) => {
  progress = value;
  // 这里可以添加进度条更新逻辑
};

const setActiveServer = (server) => {
  activeServer = server;
  // 这里可以添加当前服务器显示更新逻辑
};

const setNatType = (type) => {
  natType = type;
  // 这里可以添加NAT类型显示更新逻辑
};

// 核心检测函数
const detectNATType = async () => {
  if (status === 'scanning') return;
  
  resetState();
  setStatus('scanning');
  addLog("=== 启动 NAT 类型精准检测 ===", "system");
  addLog("遵循 RFC 3489 / RFC 5389 标准检测流程", "system");
  
  try {
    // 阶段 1: 获取初始映射
    setProgress(20);
    addLog("阶段 1: 获取初始公网映射", "progress");
    
    const initialMapping = await getNatMapping(STUN_SERVERS[0]);
    if (!initialMapping) {
      throw new Error("无法获取初始 NAT 映射");
    }
    
    addLog(`初始映射: ${initialMapping.ip}:${initialMapping.port} (类型: ${initialMapping.type})`, "success");
    
    // 阶段 2: 检测端口一致性
    setProgress(40);
    addLog("阶段 2: 检测不同服务器的端口映射一致性", "progress");
    
    const mappings = [];
    // 测试更多服务器以提高准确性
    const testServerCount = Math.min(6, STUN_SERVERS.length);
    
    for (let i = 1; i < testServerCount; i++) {
      setActiveServer(STUN_SERVERS[i]);
      addLog(`正在测试服务器: ${STUN_SERVERS[i].url} (${STUN_SERVERS[i].region})`, "info");
      
      const mapping = await getNatMapping(STUN_SERVERS[i]);
      if (mapping) {
        mappings.push(mapping);
        addLog(`服务器 ${STUN_SERVERS[i].url} 映射: ${mapping.ip}:${mapping.port}`, "info");
      }
      
      setProgress(40 + (i * 60) / (testServerCount - 1));
      
      // 检测中止
      if (abortControllerRef.current.signal.aborted) {
        throw new Error("检测已中止");
      }
    }
    
    // 阶段 3: 分析 NAT 类型
    setProgress(80);
    addLog("阶段 3: 分析 NAT 行为特征", "progress");
    
    const detectedType = analyzeNatBehavior(initialMapping, mappings);
    setNatType(detectedType);
    addLog(`NAT 类型检测完成: ${NAT_TYPES[detectedType].name} (${NAT_TYPES[detectedType].code})`, "success");
    addLog(`描述: ${NAT_TYPES[detectedType].description}`, "info");
    
    // 完成检测
    setProgress(100);
    setStatus('success');
    addLog("=== 检测流程完成 ===", "system");
    
  } catch (error) {
    if (error.message !== "检测已中止") {
      addLog(`检测失败: ${error.message}`, "error");
      setNatType("unknown");
      setStatus('error');
    } else {
      addLog("检测已手动中止", "warning");
      setStatus('idle');
    }
  }
};

// 中止检测函数
const abortDetection = () => {
  if (status === 'scanning') {
    abortControllerRef.current.abort();
    setStatus('idle');
    addLog("正在中止检测...", "warning");
  }
};

// 暴露公共API
export const NATDetector = {
  detect: detectNATType,
  abort: abortDetection,
  getStatus: () => status,
  getProgress: () => progress,
  getNatType: () => natType,
  getLogs: () => [...logs]
};
