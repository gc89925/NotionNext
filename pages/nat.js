// pages/nat.js - 双VPS NAT检测（非纯前端，对接你的2台VPS）
import { useEffect, useState } from 'react';
import Head from 'next/head';

// ======================== 你的2台VPS配置（核心！替换为实际IP）========================
const VPS_CONFIG = {
    serverA: {
        ip: '45.62.118.20',    // 你的第一台VPS IP
        wsPort: 8080,          // WS端口
        stunPort: 3478         // STUN端口
    },
    serverB: {
        ip: '43.229.154.85', // 你的第二台VPS IP（替换！）
        wsPort: 8080,
        stunPort: 3478
    }
};

// ======================== Next.js合法页面组件（默认导出）========================
export default function NATDetectorPage() {
    // 状态管理
    const [isDetecting, setIsDetecting] = useState(false);
    const [currentStep, setCurrentStep] = useState(0);
    const [errorMsg, setErrorMsg] = useState('');
    const [natResult, setNatResult] = useState({
        localIp: '未知',
        publicIpA: '未知',  // 从VPS A获取的公网IP
        publicPortA: '未知',// 从VPS A获取的公网端口
        publicIpB: '未知',  // 从VPS B获取的公网IP
        publicPortB: '未知',// 从VPS B获取的公网端口
        natType: '未知',
        natDesc: '未知',
        tips: '未知'
    });
    const [localIp, setLocalIp] = useState('未知');

    // ======================== 核心：双VPS NAT检测逻辑（对接你的VPS）========================
    useEffect(() => {
        // 仅在客户端执行（避免服务端window报错）
        if (typeof window === 'undefined' || !window.WebSocket || !window.RTCPeerConnection) {
            setErrorMsg('当前环境不支持WebRTC/WebSocket，无法检测');
            return;
        }

        let wsA = null; // 连接VPS A的WS
        let wsB = null; // 连接VPS B的WS
        let pcA = null; // 与VPS A的RTCPeerConnection
        let pcB = null; // 与VPS B的RTCPeerConnection

        // 1. 获取本地IP
        const getLocalIP = () => {
            try {
                const pc = new RTCPeerConnection({ iceServers: [] });
                pc.createDataChannel('');
                pc.createOffer().then(offer => pc.setLocalDescription(offer)).catch(() => {});

                pc.onicecandidate = (e) => {
                    if (!e.candidate) return;
                    const ipRegex = /([0-9]{1,3}(\.[0-9]{1,3}){3})/;
                    const match = e.candidate.candidate.match(ipRegex);
                    if (match && match[1] && match[1] !== '0.0.0.0') {
                        setLocalIp(match[1]);
                        pc.close();
                    }
                };
            } catch (err) {
                setErrorMsg('获取本地IP失败：' + err.message);
            }
        };

        // 2. 连接VPS的WebSocket（核心：对接你的VPS后端）
        const connectVPS = (serverConfig, callback) => {
            const ws = new WebSocket(`ws://${serverConfig.ip}:${serverConfig.wsPort}`);
            
            ws.onopen = () => {
                setErrorMsg('');
                if (callback) callback(ws);
            };

            ws.onclose = () => {
                if (isDetecting) {
                    setErrorMsg(`连接VPS ${serverConfig.ip} 断开`);
                    setIsDetecting(false);
                    setCurrentStep(0);
                }
            };

            ws.onerror = () => {
                setErrorMsg(`连接VPS ${serverConfig.ip} 失败（检查IP/端口/安全组）`);
                setIsDetecting(false);
                setCurrentStep(0);
            };

            return ws;
        };

        // 3. 检测NAT类型（核心：通过双VPS的STUN服务分析）
        const detectNATType = () => {
            // 步骤1：连接VPS A
            setCurrentStep(1);
            wsA = connectVPS(VPS_CONFIG.serverA, (ws) => {
                // 步骤2：从VPS A获取公网IP/端口
                setCurrentStep(2);
                ws.send(JSON.stringify({ type: 'get_stun' }));
                
                ws.onmessage = (e) => {
                    try {
                        const data = JSON.parse(e.data);
                        if (data.type === 'stun_response') {
                            // 保存VPS A返回的公网信息
                            const publicIpA = data.publicIp;
                            const publicPortA = data.publicPort;

                            // 步骤3：连接VPS B，对比端口
                            setCurrentStep(3);
                            wsB = connectVPS(VPS_CONFIG.serverB, (ws) => {
                                ws.send(JSON.stringify({ type: 'get_stun' }));
                                
                                ws.onmessage = (e) => {
                                    try {
                                        const dataB = JSON.parse(e.data);
                                        if (dataB.type === 'stun_response') {
                                            const publicIpB = dataB.publicIp;
                                            const publicPortB = dataB.publicPort;

                                            // 步骤4：分析NAT类型（核心逻辑）
                                            setCurrentStep(4);
                                            let natType = '';
                                            let natDesc = '';
                                            let tips = [];

                                            // NAT类型判断规则（基于双VPS端口对比）
                                            if (publicPortA === publicPortB) {
                                                // 全锥型NAT（Full Cone）
                                                natType = 'Full Cone NAT（全锥型）';
                                                natDesc = '最宽松的NAT类型，任何外部主机都能通过映射的端口访问你，P2P通信最优';
                                                tips = ['NAT类型最优，无需优化', '保持路由器UPnP开启'];
                                            } else if (publicIpA === publicIpB && publicPortA !== publicPortB) {
                                                // 地址受限锥型（Address-Restricted Cone）
                                                natType = 'Address-Restricted Cone NAT（地址受限锥型）';
                                                natDesc = '只有你主动访问过的IP才能通过映射的端口访问你，P2P通信良好';
                                                tips = ['P2P通信基本无问题', '可开启UPnP优化'];
                                            } else if (publicIpA !== publicIpB) {
                                                // 端口受限锥型/对称型（Port-Restricted/Symmetric）
                                                natType = 'Symmetric NAT（对称型）';
                                                natDesc = '最严格的NAT类型，不同目标IP映射不同端口，P2P通信需要中继服务器';
                                                tips = ['P2P通信困难', '建议使用中继服务器（如TURN）', '尝试开启路由器DMZ'];
                                            }

                                            // 保存最终结果
                                            setNatResult({
                                                localIp: localIp,
                                                publicIpA: publicIpA,
                                                publicPortA: publicPortA,
                                                publicIpB: publicIpB,
                                                publicPortB: publicPortB,
                                                natType: natType,
                                                natDesc: natDesc,
                                                tips: tips.join('；')
                                            });

                                            setIsDetecting(false);
                                        }
                                    } catch (err) {
                                        setErrorMsg('解析VPS B数据失败：' + err.message);
                                        setIsDetecting(false);
                                    }
                                };
                            });
                        }
                    } catch (err) {
                        setErrorMsg('解析VPS A数据失败：' + err.message);
                        setIsDetecting(false);
                    }
                };
            });
        };

        // 4. 暴露全局检测方法
        window.startNATDetect = () => {
            setIsDetecting(true);
            setErrorMsg('');
            setNatResult({
                localIp: '未知',
                publicIpA: '未知',
                publicPortA: '未知',
                publicIpB: '未知',
                publicPortB: '未知',
                natType: '未知',
                natDesc: '未知',
                tips: '未知'
            });

            // 初始化检测
            detectNATType();
        };

        // 初始化：获取本地IP + 预连接VPS
        getLocalIP();

        // 组件卸载：清理资源
        return () => {
            if (wsA) wsA.close();
            if (wsB) wsB.close();
            if (pcA) pcA.close();
            if (pcB) pcB.close();
        };
    }, [localIp]);

    // 步骤配置
    const steps = [
        { id: 1, text: '连接VPS A' },
        { id: 2, text: 'VPS A获取公网端口' },
        { id: 3, text: '连接VPS B对比端口' },
        { id: 4, text: '分析NAT类型' }
    ];

    // ======================== JSX渲染 ========================
    return (
        <div style={pageStyle}>
            <Head>
                <title>双VPS NAT类型检测 | 我的博客</title>
                <meta name="description" content="基于双VPS STUN协议，精准检测NAT类型" />
            </Head>

            <div style={headerStyle}>
                <h2>双VPS NAT类型精准检测工具</h2>
                <p style={subTitleStyle}>基于STUN/ICE协议，对接你的2台公网VPS</p>
            </div>

            {/* 检测按钮 */}
            <button
                style={{ ...btnStyle, ...(isDetecting ? disabledBtnStyle : {}) }}
                onClick={() => window.startNATDetect()}
                disabled={isDetecting}
            >
                {isDetecting ? '检测中...' : '开始NAT类型检测'}
            </button>

            {/* 步骤展示 */}
            <div style={stepsContainerStyle}>
                {steps.map(step => (
                    <div key={step.id} style={stepItemStyle}>
                        <div
                            style={{
                                ...stepIconStyle,
                                backgroundColor: currentStep === step.id
                                    ? '#2563eb'
                                    : currentStep > step.id
                                        ? '#10b981'
                                        : '#e2e8f0'
                            }}
                        >
                            {step.id}
                        </div>
                        <div style={stepTextStyle}>{step.text}</div>
                    </div>
                ))}
            </div>

            {/* 错误提示 */}
            {errorMsg && <div style={errorStyle}>{errorMsg}</div>}

            {/* 加载提示 */}
            {isDetecting && currentStep > 0 && <div style={loadingStyle}>检测中，请稍候...</div>}

            {/* 检测结果（双VPS数据） */}
            {currentStep === 4 && (
                <div style={resultCardStyle}>
                    <div style={resultTitleStyle}>双VPS NAT检测报告</div>
                    <div style={resultItemStyle}>
                        <span style={resultLabelStyle}>本地IP：</span>
                        <span style={resultValueStyle}>{natResult.localIp}</span>
                    </div>
                    <div style={resultItemStyle}>
                        <span style={resultLabelStyle}>VPS A公网IP：</span>
                        <span style={resultValueStyle}>{natResult.publicIpA}</span>
                    </div>
                    <div style={resultItemStyle}>
                        <span style={resultLabelStyle}>VPS A映射端口：</span>
                        <span style={resultValueStyle}>{natResult.publicPortA}</span>
                    </div>
                    <div style={resultItemStyle}>
                        <span style={resultLabelStyle}>VPS B公网IP：</span>
                        <span style={resultValueStyle}>{natResult.publicIpB}</span>
                    </div>
                    <div style={resultItemStyle}>
                        <span style={resultLabelStyle}>VPS B映射端口：</span>
                        <span style={resultValueStyle}>{natResult.publicPortB}</span>
                    </div>
                    <div style={resultItemStyle}>
                        <span style={resultLabelStyle}>NAT类型：</span>
                        <span style={resultValueStyle}>{natResult.natType}</span>
                    </div>
                    <div style={resultItemStyle}>
                        <span style={resultLabelStyle}>类型描述：</span>
                        <span style={resultValueStyle}>{natResult.natDesc}</span>
                    </div>
                    <div style={resultItemStyle}>
                        <span style={resultLabelStyle}>优化建议：</span>
                        <span style={resultValueStyle}>{natResult.tips}</span>
                    </div>
                </div>
            )}
        </div>
    );
}

// 内联样式
const pageStyle = {
    maxWidth: '800px',
    margin: '0 auto',
    padding: '20px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
};

const headerStyle = {
    textAlign: 'center',
    marginBottom: '20px'
};

const subTitleStyle = {
    color: '#666',
    fontSize: '14px',
    marginTop: '8px'
};

const btnStyle = {
    width: '100%',
    padding: '12px',
    backgroundColor: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '16px',
    cursor: 'pointer',
    marginBottom: '20px',
    transition: 'background-color 0.2s'
};

const disabledBtnStyle = {
    backgroundColor: '#94a3b8',
    cursor: 'not-allowed'
};

const stepsContainerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '20px',
    gap: '8px'
};

const stepItemStyle = {
    flex: 1,
    textAlign: 'center',
    position: 'relative'
};

const stepIconStyle = {
    width: '28px',
    height: '28px',
    lineHeight: '28px',
    borderRadius: '50%',
    color: '#fff',
    margin: '0 auto 6px',
    fontSize: '12px'
};

const stepTextStyle = {
    fontSize: '12px',
    color: '#666'
};

const errorStyle = {
    textAlign: 'center',
    padding: '12px',
    backgroundColor: '#fef2f2',
    color: '#ef4444',
    borderRadius: '4px',
    marginBottom: '20px',
    fontSize: '14px'
};

const loadingStyle = {
    textAlign: 'center',
    color: '#2563eb',
    fontSize: '14px',
    marginBottom: '20px'
};

const resultCardStyle = {
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    padding: '16px',
    marginTop: '20px'
};

const resultTitleStyle = {
    fontSize: '18px',
    marginBottom: '15px',
    paddingBottom: '10px',
    borderBottom: '1px solid #f5f5f5'
};

const resultItemStyle = {
    display: 'flex',
    marginBottom: '10px',
    fontSize: '14px'
};

const resultLabelStyle = {
    width: '120px',
    color: '#666',
    fontWeight: 500
};

const resultValueStyle = {
    flex: 1,
    color: '#333'
};
