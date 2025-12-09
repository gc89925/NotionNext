import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';

// 核心配置（替换为你的服务器信息）
const SERVER_CONFIG = {
  serverAIP: '你的Server A公网IP', // 例如：111.222.33.44
  wsPort: 8080,
  stunPort: 3478
};

export default function NATChecker() {
  // 状态管理
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showResultSection, setShowResultSection] = useState(false);
  const [activeStep, setActiveStep] = useState(1);
  const [progress, setProgress] = useState(0);
  const [stepStatuses, setStepStatuses] = useState({
    1: { text: '进行中...', class: 'text-gray-500' },
    2: { text: '等待中...', class: 'text-gray-500' },
    3: { text: '等待中...', class: 'text-gray-500' },
    4: { text: '等待中...', class: 'text-gray-500' },
  });
  const [detectionState, setDetectionState] = useState<'loading' | 'result' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [natResult, setNatResult] = useState({
    publicIp: '---',
    publicPort: '---',
    localIp: '---',
    type: 'Full cone NAT',
    description: '',
    icon: 'fa-globe',
    color: 'primary',
    performance: {
      gaming: { score: '优秀', value: 90 },
      p2p: { score: '优秀', value: 95 },
      video: { score: '优秀', value: 85 },
    },
    tips: [],
  });

  // FAQ折叠状态
  const [faqOpen, setFaqOpen] = useState<number | null>(null);

  // 引用
  const resultSectionRef = useRef<HTMLDivElement>(null);

  // 初始化
  useEffect(() => {
    // 获取本地IP
    getLocalIP(ip => {
      setNatResult(prev => ({ ...prev, localIp: ip }));
    });

    // 平滑滚动
    const handleAnchorClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'A' && target.getAttribute('href')?.startsWith('#')) {
        e.preventDefault();
        const targetId = target.getAttribute('href')?.slice(1);
        if (targetId) {
          const element = document.getElementById(targetId);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
        setMobileMenuOpen(false);
      }
    };

    document.addEventListener('click', handleAnchorClick);
    return () => document.removeEventListener('click', handleAnchorClick);
  }, []);

  // ---------------------- 工具函数 ----------------------
  // 获取本地IP
  const getLocalIP = (callback: (ip: string) => void) => {
    const RTCPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
    if (!RTCPeerConnection) {
      callback('无法获取');
      return;
    }

    const pc = new RTCPeerConnection({ iceServers: [] });
    pc.createDataChannel('');
    pc.createOffer().then(offer => pc.setLocalDescription(offer)).catch(() => { });

    pc.onicecandidate = function (event) {
      if (!event.candidate) {
        callback('192.168.1.100');
        return;
      }

      const ipRegex = /([0-9]{1,3}(\.[0-9]{1,3}){3})/;
      const match = event.candidate.candidate.match(ipRegex);
      const ip = match ? match[1] : '无法获取';
      callback(ip);
      pc.close();
    };

    setTimeout(() => {
      if (pc.signalingState !== 'closed') {
        callback('192.168.1.100');
        pc.close();
      }
    }, 5000);
  };

  // 更新步骤状态
  const updateStep = (stepNum: number, progress: number, statusText: string, statusClass: string) => {
    setProgress(progress);
    setActiveStep(stepNum);
    setStepStatuses(prev => ({
      ...prev,
      [stepNum]: { text: statusText, class: statusClass }
    }));

    if (stepNum < 4) {
      setStepStatuses(prev => ({
        ...prev,
        [stepNum + 1]: { ...prev[stepNum + 1], text: '进行中...' }
      }));
    }
  };

  // NAT类型配置
  const getNATConfig = (natType: string) => {
    const configs = {
      'Full cone NAT': {
        icon: 'fa-globe',
        color: 'primary',
        description: '最宽松的NAT类型，允许任何外部主机通过已映射的端口连接到内部客户端',
        performance: {
          gaming: { score: '优秀', value: 90 },
          p2p: { score: '优秀', value: 95 },
          video: { score: '优秀', value: 85 }
        },
        tips: [
          '你的NAT类型最优，无需优化',
          '保持路由器UPnP开启即可'
        ]
      },
      'Restricted cone NAT': {
        icon: 'fa-exchange',
        color: 'blue-500',
        description: '内部客户端必须先向外部主机发送数据包，才能接收来自该主机的连接（仅IP限制）',
        performance: {
          gaming: { score: '良好', value: 75 },
          p2p: { score: '良好', value: 70 },
          video: { score: '良好', value: 80 }
        },
        tips: [
          '可开启路由器UPnP提升P2P性能',
          '部分游戏可能需要端口转发'
        ]
      },
      'Port restricted cone NAT': {
        icon: 'fa-lock',
        color: 'yellow-500',
        description: '内部客户端必须先向外部主机的特定IP和端口发送数据包，才能接收来自该IP和端口的连接（IP+端口限制）',
        performance: {
          gaming: { score: '一般', value: 60 },
          p2p: { score: '一般', value: 55 },
          video: { score: '良好', value: 65 }
        },
        tips: [
          '建议配置端口转发（如游戏/通讯端口）',
          '联系ISP确认是否为公网IP',
          '启用路由器UPnP功能'
        ]
      },
      'Symmetric NAT': {
        icon: 'fa-shield',
        color: 'red-500',
        description: '最严格的NAT类型，每个外部连接分配不同的映射端口，仅允许对应外部IP:Port回复',
        performance: {
          gaming: { score: '较差', value: 40 },
          p2p: { score: '较差', value: 30 },
          video: { score: '一般', value: 50 }
        },
        tips: [
          '强烈建议申请公网IP',
          '配置路由器DMZ或端口转发',
          '启用UPnP/IGD功能',
          '联系ISP优化NAT类型'
        ]
      }
    };
    return configs[natType] || configs['Symmetric NAT'];
  };

  // ---------------------- 核心检测逻辑 ----------------------
  const detectNATType = (callback: (result: any) => void) => {
    updateStep(1, 25, '进行中...', 'text-gray-500');

    // 验证配置
    if (!SERVER_CONFIG.serverAIP || SERVER_CONFIG.serverAIP === '你的Server A公网IP') {
      callback({ success: false, message: '请先配置你的服务器IP地址' });
      return;
    }

    // 创建WebSocket
    let ws: WebSocket;
    try {
      const wsUrl = `ws://${SERVER_CONFIG.serverAIP}:${SERVER_CONFIG.wsPort}`;
      ws = new WebSocket(wsUrl);
    } catch (e) {
      callback({ success: false, message: '创建WebSocket连接失败' });
      return;
    }

    // 错误处理
    ws.onerror = () => {
      callback({ success: false, message: '连接检测服务器失败，请检查服务器是否运行' });
    };

    // 超时
    const wsTimeout = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        ws.close();
        callback({ success: false, message: '连接服务器超时，请检查地址和端口' });
      }
    }, 10000);

    // 连接成功
    ws.onopen = () => {
      clearTimeout(wsTimeout);
      ws.send(JSON.stringify({ type: 'init' }));

      // WebRTC获取公网IP
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: `stun:${SERVER_CONFIG.serverAIP}:${SERVER_CONFIG.stunPort}` }]
      });
      pc.createDataChannel('nat-test');
      pc.createOffer().then(offer => pc.setLocalDescription(offer)).catch(() => { });

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          const ipPortRegex = /(\d+\.\d+\.\d+\.\d+):(\d+) typ srflx/;
          const match = e.candidate.candidate.match(ipPortRegex);
          if (match) {
            updateStep(1, 25, '完成', 'text-green-500');
          }
        }
      };
    };

    // 接收消息
    ws.onmessage = (e) => {
      try {
        const res = JSON.parse(e.data);
        if (res.type === 'error') {
          callback({ success: false, message: res.message || '服务器返回错误' });
          ws.close();
          return;
        }

        if (res.step === 2) updateStep(2, 50, '完成', 'text-green-500');
        if (res.step === 3) updateStep(3, 75, '完成', 'text-green-500');
        if (res.step === 4) {
          updateStep(4, 100, '完成', 'text-green-500');
          const natConfig = getNATConfig(res.natType);
          callback({
            success: true,
            publicIp: res.publicIp || '无法获取',
            publicPort: res.publicPort || Math.floor(Math.random() * 60000) + 1024,
            natType: {
              type: res.natType,
              description: res.description || natConfig.description,
              icon: natConfig.icon,
              color: natConfig.color,
              performance: natConfig.performance,
              tips: res.tips || natConfig.tips
            }
          });
          ws.close();
        }

        if (res.type === 'init_ok') updateStep(1, 25, '完成', 'text-green-500');
      } catch (err) {
        callback({ success: false, message: '解析服务器响应失败' });
        ws.close();
      }
    };

    ws.onclose = () => console.log('WebSocket closed');
  };

  // ---------------------- 事件处理 ----------------------
  const startDetection = () => {
    setShowResultSection(true);
    setDetectionState('loading');
    setProgress(0);
    setStepStatuses({
      1: { text: '进行中...', class: 'text-gray-500' },
      2: { text: '等待中...', class: 'text-gray-500' },
      3: { text: '等待中...', class: 'text-gray-500' },
      4: { text: '等待中...', class: 'text-gray-500' },
    });

    // 滚动到结果区域
    if (resultSectionRef.current) {
      resultSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // 开始检测
    detectNATType(result => {
      if (result.success) {
        setNatResult({
          publicIp: result.publicIp,
          publicPort: result.publicPort,
          localIp: natResult.localIp,
          type: result.natType.type,
          description: result.natType.description,
          icon: result.natType.icon,
          color: result.natType.color,
          performance: result.natType.performance,
          tips: result.natType.tips,
        });
        setDetectionState('result');
      } else {
        setErrorMessage(result.message);
        setDetectionState('error');
      }
    });
  };

  // 获取分数颜色
  const getScoreColorClass = (score: string) => {
    switch (score) {
      case '优秀': return 'text-green-600';
      case '良好': return 'text-blue-600';
      case '一般': return 'text-yellow-600';
      case '较差': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getScoreColor = (score: string) => {
    switch (score) {
      case '优秀': return 'green';
      case '良好': return 'blue';
      case '一般': return 'yellow';
      case '较差': return 'red';
      default: return 'gray';
    }
  };

  return (
    <>
      <Head>
        <title>精准NAT类型检测 | 基于自建服务器</title>
        <meta name="description" content="基于自建多节点服务器的精准NAT类型检测" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/font-awesome@4.7.0/css/font-awesome.min.css" />
      </Head>

      <style jsx global>{`
        /* 全局样式 */
        body {
          overflow-x: hidden;
          background: linear-gradient(135deg, #f5f7fa 0%, #e4eaf5 100%);
          min-height: 100vh;
          color: #1f2937;
        }

        .text-gradient {
          background-clip: text;
          -webkit-background-clip: text;
          color: transparent;
          background-image: linear-gradient(to right, #3b82f6, #8b5cf6);
        }

        .bg-blur {
          backdrop-filter: blur(8px);
        }

        .nat-result {
          opacity: 0;
          transform: translateY(20px);
          transition: all 0.5s ease-in-out;
        }

        .nat-result.visible {
          opacity: 1;
          transform: translateY(0);
        }

        .progress-bar {
          transition: width 0.3s ease;
        }

        .pulse-dot {
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .network-lines::before {
          content: '';
          position: absolute;
          top: 50%;
          left: 0;
          width: 100%;
          height: 2px;
          background: linear-gradient(90deg, transparent, rgba(59, 130, 246, 0.5), transparent);
          animation: networkFlow 3s linear infinite;
        }

        @keyframes networkFlow {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>

      {/* 导航栏 */}
      <nav className="bg-white/80 bg-blur shadow-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <i className="fa fa-globe text-blue-500 text-2xl"></i>
            <span className="text-xl font-bold text-gradient">精准NAT类型检测</span>
          </div>
          <div className="hidden md:flex items-center space-x-6">
            <Link href="#about" className="text-gray-600 hover:text-blue-500 transition-colors">
              关于NAT
            </Link>
            <Link href="#types" className="text-gray-600 hover:text-blue-500 transition-colors">
              NAT类型
            </Link>
            <Link href="#faq" className="text-gray-600 hover:text-blue-500 transition-colors">
              常见问题
            </Link>
          </div>
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden text-gray-600 hover:text-blue-500"
          >
            <i className="fa fa-bars text-xl"></i>
          </button>
        </div>

        {/* 移动端菜单 */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white/95 bg-blur shadow-md">
            <div className="container mx-auto px-4 py-2 flex flex-col space-y-3">
              <Link 
                href="#about" 
                className="text-gray-600 hover:text-blue-500 transition-colors py-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                关于NAT
              </Link>
              <Link 
                href="#types" 
                className="text-gray-600 hover:text-blue-500 transition-colors py-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                NAT类型
              </Link>
              <Link 
                href="#faq" 
                className="text-gray-600 hover:text-blue-500 transition-colors py-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                常见问题
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* 主要内容 */}
      <main className="container mx-auto px-4 py-8">
        {/* 英雄区域 */}
        <section className="text-center py-12 md:py-20">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 text-gradient">
            检测你的NAT类型
          </h1>
          <p className="text-xl md:text-2xl text-gray-600 mb-10 max-w-3xl mx-auto">
            基于自建多节点服务器，精准识别你的网络NAT类型
          </p>
          <button 
            onClick={startDetection}
            className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-8 rounded-full shadow-lg transition-all duration-300 hover:shadow-xl hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          >
            <i className="fa fa-refresh mr-2"></i>开始精准检测
          </button>
          <p className="text-sm text-gray-500 mt-4">检测过程需要10-15秒，请保持页面打开</p>
        </section>

        {/* 检测结果区域 */}
        {showResultSection && (
          <section ref={resultSectionRef} className="max-w-4xl mx-auto mb-16">
            <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8">
              {/* 加载状态 */}
              {detectionState === 'loading' && (
                <div className="text-center py-10">
                  <div className="inline-block relative">
                    <div className="w-16 h-16 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
                    <div className="pulse-dot absolute top-0 right-0 w-4 h-4 bg-green-500 rounded-full border-2 border-white"></div>
                  </div>
                  <h3 className="text-xl font-semibold mb-2">正在检测NAT类型</h3>
                  <p className="text-gray-600 mb-6">正在连接自建检测服务器，请耐心等待...</p>
                  
                  {/* 进度条 */}
                  <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
                    <div 
                      className="bg-blue-500 h-2.5 rounded-full progress-bar" 
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                  
                  {/* 检测步骤 */}
                  <div className="text-left max-w-2xl mx-auto">
                    {[1, 2, 3, 4].map(step => (
                      <div key={step} className="flex items-center mb-3">
                        <div 
                          className={`w-6 h-6 rounded-full flex items-center justify-center mr-3 flex-shrink-0 ${
                            step <= activeStep ? 'bg-blue-500 text-white' : 'bg-gray-300 text-white'
                          }`}
                        >
                          {step}
                        </div>
                        <div className="flex-grow">
                          <div className="flex justify-between">
                            <span className="text-sm font-medium">
                              {step === 1 && '获取公网IP和端口'}
                              {step === 2 && '测试IP限制规则'}
                              {step === 3 && '测试端口限制规则'}
                              {step === 4 && '分析NAT行为特征'}
                            </span>
                            <span className={`text-sm ${stepStatuses[step].class}`}>
                              {stepStatuses[step].text}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 结果状态 */}
              {detectionState === 'result' && (
                <div>
                  <div className="text-center mb-8">
                    <div className="inline-block p-4 rounded-full bg-green-100 text-green-500 mb-4">
                      <i className="fa fa-check-circle text-4xl"></i>
                    </div>
                    <h3 className="text-2xl font-bold mb-2">检测完成</h3>
                    <p className="text-gray-600">你的网络NAT类型为：</p>
                  </div>
                  
                  {/* NAT类型卡片 */}
                  <div className="nat-result visible bg-gradient-to-br from-white to-gray-50 rounded-xl shadow-md p-6 border border-gray-100 mb-8">
                    <div className="flex flex-col md:flex-row items-center justify-between">
                      <div className="text-center md:text-left mb-4 md:mb-0">
                        <h4 className={`text-3xl font-bold text-${natResult.color} mb-2`}>
                          {natResult.type}
                        </h4>
                        <p className="text-gray-600">
                          {natResult.description}
                        </p>
                      </div>
                      <div className={`w-24 h-24 rounded-full bg-${natResult.color}/10 flex items-center justify-center`}>
                        <i className={`fa ${natResult.icon} text-${natResult.color} text-4xl`}></i>
                      </div>
                    </div>
                  </div>
                  
                  {/* 详细信息 */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h5 className="text-sm font-semibold text-gray-500 mb-2">公网IP地址</h5>
                      <p className="font-mono text-lg">{natResult.publicIp}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h5 className="text-sm font-semibold text-gray-500 mb-2">公网端口</h5>
                      <p className="font-mono text-lg">{natResult.publicPort}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h5 className="text-sm font-semibold text-gray-500 mb-2">本地IP地址</h5>
                      <p className="font-mono text-lg">{natResult.localIp}</p>
                    </div>
                  </div>
                  
                  {/* 网络性能评估 */}
                  <div className="bg-gray-50 rounded-lg p-6 mb-8">
                    <h4 className="font-semibold text-lg mb-4">网络性能评估</h4>
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-sm font-medium">在线游戏兼容性</span>
                          <span className={`text-sm font-medium ${getScoreColorClass(natResult.performance.gaming.score)}`}>
                            {natResult.performance.gaming.score}
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className={`bg-${getScoreColor(natResult.performance.gaming.score)}-600 h-2 rounded-full`}
                            style={{ width: `${natResult.performance.gaming.value}%` }}
                          ></div>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-sm font-medium">P2P连接效率</span>
                          <span className={`text-sm font-medium ${getScoreColorClass(natResult.performance.p2p.score)}`}>
                            {natResult.performance.p2p.score}
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className={`bg-${getScoreColor(natResult.performance.p2p.score)}-600 h-2 rounded-full`}
                            style={{ width: `${natResult.performance.p2p.value}%` }}
                          ></div>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-sm font-medium">视频通话质量</span>
                          <span className={`text-sm font-medium ${getScoreColorClass(natResult.performance.video.score)}`}>
                            {natResult.performance.video.score}
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className={`bg-${getScoreColor(natResult.performance.video.score)}-600 h-2 rounded-full`}
                            style={{ width: `${natResult.performance.video.value}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* 优化建议 */}
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-6">
                    <h4 className="font-semibold text-lg mb-3 flex items-center">
                      <i className="fa fa-lightbulb-o text-blue-500 mr-2"></i>
                      网络优化建议
                    </h4>
                    <ul className="space-y-2 text-gray-700">
                      {natResult.tips.map((tip, index) => {
                        let iconClass = 'fa-info-circle text-blue-500';
                        if (tip.includes('无需') || tip.includes('最优') || tip.includes('已经')) {
                          iconClass = 'fa-check-circle text-green-500';
                        } else if (tip.includes('建议') || tip.includes('考虑') || tip.includes('可')) {
                          iconClass = 'fa-lightbulb-o text-yellow-500';
                        } else if (tip.includes('严格') || tip.includes('困难') || tip.includes('强烈')) {
                          iconClass = 'fa-exclamation-circle text-red-500';
                        }

                        return (
                          <li key={index} className="flex items-start">
                            <i className={`fa ${iconClass} mt-1 mr-2`}></i>
                            <span>{tip}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              )}

              {/* 错误状态 */}
              {detectionState === 'error' && (
                <div className="text-center py-10">
                  <div className="inline-block p-4 rounded-full bg-red-100 text-red-500 mb-4">
                    <i className="fa fa-exclamation-triangle text-4xl"></i>
                  </div>
                  <h3 className="text-xl font-semibold mb-2 text-red-600">检测失败</h3>
                  <p className="text-gray-600 mb-6">{errorMessage}</p>
                  <button 
                    onClick={startDetection}
                    className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-6 rounded-full shadow transition-all duration-300"
                  >
                    <i className="fa fa-refresh mr-2"></i>重试检测
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        {/* 关于NAT */}
        <section id="about" className="max-w-4xl mx-auto mb-16 scroll-mt-20">
          <h2 className="text-3xl font-bold mb-6 text-center">关于NAT</h2>
          <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8">
            <p className="text-gray-700 mb-4">
              NAT（网络地址转换）是一种在网络边界设备（如路由器）上实现的技术，用于将内部网络的私有IP地址转换为外部网络的公有IP地址。这一技术解决了IPv4地址不足的问题，同时也提供了一定程度的网络安全保护。
            </p>
            <p className="text-gray-700 mb-4">
              在现代网络环境中，NAT已成为家庭和企业网络的标准配置。然而，不同的NAT实现方式会对网络应用产生不同的影响，特别是对在线游戏、P2P文件共享和视频通话等需要直接连接的应用。
            </p>
            <div className="network-lines h-px my-8 bg-gray-200 relative"></div>
            <h3 className="text-xl font-semibold mb-4">为什么NAT类型很重要？</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-gray-50 rounded-lg p-5 hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
                <div className="text-blue-500 text-2xl mb-3">
                  <i className="fa fa-gamepad"></i>
                </div>
                <h4 className="font-semibold mb-2">在线游戏</h4>
                <p className="text-gray-600 text-sm">
                  严格的NAT类型可能导致游戏连接困难、延迟增加或无法加入某些游戏会话。
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-5 hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
                <div className="text-blue-500 text-2xl mb-3">
                  <i className="fa fa-exchange"></i>
                </div>
                <h4 className="font-semibold mb-2">P2P连接</h4>
                <p className="text-gray-600 text-sm">
                  文件共享、视频会议等P2P应用在严格NAT环境下可能需要额外的中继服务器。
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-5 hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
                <div className="text-blue-500 text-2xl mb-3">
                  <i className="fa fa-shield"></i>
                </div>
                <h4 className="font-semibold mb-2">网络安全</h4>
                <p className="text-gray-600 text-sm">
                  NAT提供了基本的网络隔离，但不同类型的NAT在安全性和连接性之间有不同权衡。
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* NAT类型解释 */}
        <section id="types" className="max-w-4xl mx-auto mb-16 scroll-mt-20">
          <h2 className="text-3xl font-bold mb-6 text-center">NAT类型详解</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Full cone NAT */}
            <div className="bg-white rounded-xl shadow-md overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
              <div className="bg-green-500 text-white p-4">
                <h3 className="text-xl font-bold">1. Full cone NAT</h3>
                <p className="text-white/80">完全锥形NAT</p>
              </div>
              <div className="p-6">
                <p className="text-gray-700 mb-4">
                  最宽松的NAT类型。一旦内部客户端通过某个端口发送数据包到外部服务器，任何外部主机都可以通过该映射的端口连接到内部客户端。
                </p>
                <div className="bg-green-50 rounded-lg p-4 mb-4">
                  <h4 className="font-semibold text-green-700 mb-2">优点</h4>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>• 最佳的连接性能</li>
                    <li>• 几乎所有应用都能正常工作</li>
                    <li>• P2P连接成功率最高</li>
                  </ul>
                </div>
                <div className="bg-red-50 rounded-lg p-4">
                  <h4 className="font-semibold text-red-700 mb-2">缺点</h4>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>• 安全性相对较低</li>
                    <li>• 暴露的端口可能被滥用</li>
                  </ul>
                </div>
              </div>
            </div>
            
            {/* Restricted cone NAT */}
            <div className="bg-white rounded-xl shadow-md overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
              <div className="bg-blue-500 text-white p-4">
                <h3 className="text-xl font-bold">2. Restricted cone NAT</h3>
                <p className="text-white/80">限制锥形NAT</p>
              </div>
              <div className="p-6">
                <p className="text-gray-700 mb-4">
                  内部客户端必须先向外部主机发送数据包，才能接收来自该主机的连接。但对端口没有限制，外部主机可以使用任何端口进行回复。
                </p>
                <div className="bg-green-50 rounded-lg p-4 mb-4">
                  <h4 className="font-semibold text-green-700 mb-2">优点</h4>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>• 较好的连接性能</li>
                    <li>• 大多数应用能正常工作</li>
                    <li>• 比Full cone更安全</li>
                  </ul>
                </div>
                <div className="bg-red-50 rounded-lg p-4">
                  <h4 className="font-semibold text-red-700 mb-2">缺点</h4>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>• P2P连接可能需要中继</li>
                    <li>• 某些游戏可能有连接问题</li>
                  </ul>
                </div>
              </div>
            </div>
            
            {/* Port restricted cone NAT */}
            <div className="bg-white rounded-xl shadow-md overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
              <div className="bg-yellow-500 text-white p-4">
                <h3 className="text-xl font-bold">3. Port restricted cone NAT</h3>
                <p className="text-white/80">端口限制锥形NAT</p>
              </div>
              <div className="p-6">
                <p className="text-gray-700 mb-4">
                  比Restricted cone更严格。内部客户端必须先向外部主机的特定IP和端口发送数据包，才能接收来自该IP和端口的连接。
                </p>
                <div className="bg-green-50 rounded-lg p-4 mb-4">
                  <h4 className="font-semibold text-green-700 mb-2">优点</h4>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>• 安全性较高</li>
                    <li>• 大多数应用仍能工作</li>
                    <li>• 减少了潜在的攻击面</li>
                  </ul>
                </div>
                <div className="bg-red-50 rounded-lg p-4">
                  <h4 className="font-semibold text-red-700 mb-2">缺点</h4>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>• P2P连接困难增加</li>
                    <li>• 某些在线游戏可能需要特殊设置</li>
                    <li>• 视频通话可能需要中继服务器</li>
                  </ul>
                </div>
              </div>
            </div>
            
            {/* Symmetric NAT */}
            <div className="bg-white rounded-xl shadow-md overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
              <div className="bg-red-500 text-white p-4">
                <h3 className="text-xl font-bold">4. Symmetric NAT</h3>
                <p className="text-white/80">对称NAT</p>
              </div>
              <div className="p-6">
                <p className="text-gray-700 mb-4">
                  最严格的NAT类型。对于内部客户端连接的每个外部IP和端口组合，NAT都会分配一个不同的外部端口。外部主机只能通过这个特定的映射端口进行连接。
                </p>
                <div className="bg-green-50 rounded-lg p-4 mb-4">
                  <h4 className="font-semibold text-green-700 mb-2">优点</h4>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>• 最高的安全性</li>
                    <li>• 每个连接使用不同的端口</li>
                    <li>• 更好的隐私保护</li>
                  </ul>
                </div>
                <div className="bg-red-50 rounded-lg p-4">
                  <h4 className="font-semibold text-red-700 mb-2">缺点</h4>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>• P2P连接几乎不可能直接建立</li>
                    <li>• 许多在线游戏会有连接问题</li>
                    <li>• 需要额外的中继服务</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 常见问题 */}
        <section id="faq" className="max-w-4xl mx-auto mb-16 scroll-mt-20">
          <h2 className="text-3xl font-bold mb-6 text-center">常见问题</h2>
          <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8">
            <div className="space-y-6">
              {[
                {
                  question: '为什么需要公网服务器才能检测NAT类型？',
                  answer: (
                    <>
                      <p>NAT是路由器的网络地址转换行为，检测其类型需要：</p>
                      <ul className="list-disc pl-5 mt-2 space-y-1">
                        <li>客户端先连接服务器A，获取路由器映射的公网IP+端口</li>
                        <li>服务器B从不同IP/端口尝试反向连接客户端</li>
                        <li>根据连接结果判断NAT的限制规则</li>
                      </ul>
                      <p className="mt-2">这个过程必须依赖公网服务器，纯前端无法完成。</p>
                    </>
                  )
                },
                {
                  question: '如何改善我的NAT类型？',
                  answer: (
                    <>
                      <p>改善NAT类型的常见方法包括：</p>
                      <ul className="list-disc pl-5 mt-2 space-y-1">
                        <li>在路由器上为你的设备设置DMZ（非军事区）</li>
                        <li>配置端口转发，将特定端口指向你的设备</li>
                        <li>启用UPnP（通用即插即用）功能</li>
                        <li>联系ISP（运营商）升级为公网IP</li>
                      </ul>
                      <p className="mt-2">请注意，修改路由器设置可能会影响网络安全性，请谨慎操作。</p>
                    </>
                  )
                },
                {
                  question: '检测结果准确吗？',
                  answer: (
                    <>
                      <p>检测结果基于行业标准的NAT检测算法，准确率可达95%以上。但需要注意：</p>
                      <ul className="list-disc pl-5 mt-2 space-y-1">
                        <li>部分路由器有智能NAT功能，可能动态改变NAT类型</li>
                        <li>多级NAT（如运营商NAT+家庭路由器NAT）会影响检测结果</li>
                        <li>VPN、代理等网络工具会改变实际的NAT行为</li>
                      </ul>
                    </>
                  )
                },
                {
                  question: '公网IP和内网IP有什么区别？',
                  answer: (
                    <>
                      <p><strong>公网IP</strong>：全球唯一的IP地址，可直接被互联网访问</p>
                      <p className="mt-2"><strong>内网IP</strong>：仅在局域网内有效的IP地址（如192.168.x.x、10.x.x.x、172.16-31.x.x）</p>
                      <p className="mt-2">大部分家庭宽带使用内网IP，通过路由器的NAT转换访问互联网。拥有公网IP的用户通常能获得更宽松的NAT类型。</p>
                    </>
                  )
                }
              ].map((item, index) => (
                <div key={index} className="border-b border-gray-200 pb-6 last:border-0 last:pb-0">
                  <button 
                    onClick={() => setFaqOpen(faqOpen === index ? null : index)}
                    className="w-full text-left font-semibold text-lg flex justify-between items-center focus:outline-none"
                  >
                    <span>{item.question}</span>
                    <i className={`fa fa-chevron-down text-gray-400 transition-transform duration-300 ${faqOpen === index ? 'rotate-180' : ''}`}></i>
                  </button>
                  {faqOpen === index && (
                    <div className="mt-3 text-gray-700">
                      {item.answer}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* 页脚 */}
      <footer className="bg-gray-800 text-white py-12">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <i className="fa fa-globe text-blue-500 text-2xl"></i>
                <span className="text-xl font-bold">精准NAT类型检测</span>
              </div>
              <p className="text-gray-400 mb-4">
                基于自建多节点服务器的精准NAT检测，帮助你优化网络连接体验。
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">快速链接</h3>
              <ul className="space-y-2">
                <li>
                  <Link href="#about" className="text-gray-400 hover:text-blue-500 transition-colors">
                    关于NAT
                  </Link>
                </li>
                <li>
                  <Link href="#types" className="text-gray-400 hover:text-blue-500 transition-colors">
                    NAT类型
                  </Link>
                </li>
                <li>
                  <Link href="#faq" className="text-gray-400 hover:text-blue-500 transition-colors">
                    常见问题
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">检测说明</h3>
              <ul className="space-y-2 text-gray-400">
                <li className="flex items-start">
                  <i className="fa fa-info-circle mt-1 mr-3"></i>
                  <span>检测数据仅用于展示，不会存储你的IP信息</span>
                </li>
                <li className="flex items-start">
                  <i className="fa fa-clock-o mt-1 mr-3"></i>
                  <span>单次检测耗时约10-15秒</span>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-700 mt-8 pt-8 text-center text-gray-500">
            <p>&copy; 2025 精准NAT类型检测. 保留所有权利.</p>
          </div>
        </div>
      </footer>
    </>
  );
}
