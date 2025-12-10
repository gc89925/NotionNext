// pages/nat.js - 单文件解决方案（Next.js合法页面组件 + 客户端NAT检测）
import { useEffect, useState } from 'react';
import Head from 'next/head';

// ======================== 核心：默认导出React组件（满足Next.js规则）========================
export default function NATDetectorPage() {
    // 状态管理（替代原DOM操作，更符合React规范）
    const [isDetecting, setIsDetecting] = useState(false);
    const [currentStep, setCurrentStep] = useState(0);
    const [errorMsg, setErrorMsg] = useState('');
    const [natResult, setNatResult] = useState({
        localIp: '未知',
        publicIp: '未知',
        publicPort: '未知',
        natType: '未知',
        desc: '未知',
        tips: '未知'
    });
    const [localIp, setLocalIp] = useState('未知');

    // 服务器配置
    const CONFIG = {
        serverIP: '45.62.118.20',
        wsPort: 8080
    };

    // ======================== 客户端NAT检测逻辑（仅浏览器执行）========================
    useEffect(() => {
        // 1. 仅在客户端执行（避免服务端window报错）
        if (typeof window === 'undefined' || !window.WebSocket) {
            setErrorMsg('当前环境不支持WebSocket，无法检测');
            return;
        }

        let ws = null;

        // 2. 获取本地IP
        const getLocalIP = () => {
            try {
                const RTCPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
                if (!RTCPeerConnection) return;

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
                console.log('获取本地IP失败:', err);
            }
        };

        // 3. 初始化WebSocket
        const initWebSocket = (callback) => {
            if (ws) ws.close();

            try {
                const wsUrl = `ws://${CONFIG.serverIP}:${CONFIG.wsPort}`;
                ws = new WebSocket(wsUrl);

                ws.onopen = () => {
                    setErrorMsg('');
                    if (callback) callback();
                };

                ws.onmessage = (e) => {
                    try {
                        const data = JSON.parse(e.data);
                        // 更新步骤
                        if (data.step) {
                            setCurrentStep(data.step);
                            // 检测完成（步骤4）
                            if (data.step === 4) {
                                setIsDetecting(false);
                                setNatResult({
                                    localIp: localIp,
                                    publicIp: data.publicIp || '未知',
                                    publicPort: data.publicPort || '未知',
                                    natType: data.natType || '未知',
                                    desc: data.description || '无',
                                    tips: data.tips?.join('；') || '无'
                                });
                            }
                        }
                        // 错误处理
                        if (data.type === 'error') {
                            setErrorMsg(data.message);
                            setIsDetecting(false);
                            setCurrentStep(0);
                        }
                    } catch (err) {
                        setErrorMsg('解析检测数据失败');
                        setIsDetecting(false);
                        setCurrentStep(0);
                    }
                };

                ws.onclose = () => {
                    if (isDetecting) {
                        setErrorMsg('检测服务器连接断开');
                        setIsDetecting(false);
                        setCurrentStep(0);
                    }
                };

                ws.onerror = () => {
                    setErrorMsg('连接检测服务器失败，请检查网络或服务器状态');
                    setIsDetecting(false);
                    setCurrentStep(0);
                };
            } catch (err) {
                setErrorMsg('初始化检测连接失败');
                setIsDetecting(false);
            }
        };

        // 4. 开始检测函数
        window.startNATDetect = () => {
            setIsDetecting(true);
            setCurrentStep(1);
            setErrorMsg('');
            setNatResult({
                localIp: '未知',
                publicIp: '未知',
                publicPort: '未知',
                natType: '未知',
                desc: '未知',
                tips: '未知'
            });

            // 发送检测请求
            if (ws && ws.readyState === WebSocket.OPEN) {
                setTimeout(() => {
                    ws.send(JSON.stringify({ type: 'init' }));
                }, 500);
            } else {
                initWebSocket(() => {
                    ws.send(JSON.stringify({ type: 'init' }));
                });
            }
        };

        // 初始化：获取本地IP + 连接WS
        getLocalIP();
        initWebSocket();

        // 组件卸载：关闭WS
        return () => {
            if (ws) ws.close();
        };
    }, [localIp]); // 依赖仅localIp，避免重复执行

    // ======================== 步骤配置 ========================
    const steps = [
        { id: 1, text: '连接服务器' },
        { id: 2, text: '获取公网IP' },
        { id: 3, text: '分析NAT类型' },
        { id: 4, text: '生成报告' }
    ];

    // ======================== JSX渲染（React组件核心）========================
    return (
        <div style={pageStyle}>
            <Head>
                <title>NAT类型检测 | 我的博客</title>
                <meta name="description" content="精准检测NAT类型、公网IP、本地IP" />
            </Head>

            {/* 标题 */}
            <div style={headerStyle}>
                <h2>NAT类型精准检测工具</h2>
                <p style={subTitleStyle}>基于WebSocket+STUN协议，纯前端检测</p>
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
                                    ? '#2563eb' // 激活态
                                    : currentStep > step.id
                                        ? '#10b981' // 完成态
                                        : '#e2e8f0' // 未开始
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

            {/* 检测结果 */}
            {currentStep === 4 && (
                <div style={resultCardStyle}>
                    <div style={resultTitleStyle}>NAT检测报告</div>
                    <div style={resultItemStyle}>
                        <span style={resultLabelStyle}>本地IP：</span>
                        <span style={resultValueStyle}>{natResult.localIp}</span>
                    </div>
                    <div style={resultItemStyle}>
                        <span style={resultLabelStyle}>公网IP：</span>
                        <span style={resultValueStyle}>{natResult.publicIp}</span>
                    </div>
                    <div style={resultItemStyle}>
                        <span style={resultLabelStyle}>公网端口：</span>
                        <span style={resultValueStyle}>{natResult.publicPort}</span>
                    </div>
                    <div style={resultItemStyle}>
                        <span style={resultLabelStyle}>NAT类型：</span>
                        <span style={resultValueStyle}>{natResult.natType}</span>
                    </div>
                    <div style={resultItemStyle}>
                        <span style={resultLabelStyle}>类型描述：</span>
                        <span style={resultValueStyle}>{natResult.desc}</span>
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

// ======================== 内联样式（无需额外CSS文件）========================
const pageStyle = {
    maxWidth: '700px',
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
    width: '100px',
    color: '#666',
    fontWeight: 500
};

const resultValueStyle = {
    flex: 1,
    color: '#333'
};
