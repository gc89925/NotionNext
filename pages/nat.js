/**
 * NAT检测工具 - 适配Next.js SSR版
 * 仅在客户端（浏览器）环境执行，避免服务端报错
 */
let ws = null;
let isDetecting = false;
let currentStep = 0;
let localIp = '未知';

// 配置项
const CONFIG = {
    serverIP: '45.62.118.20',
    wsPort: 8080,
    domIds: {
        btn: 'nat-detect-btn',
        steps: 'nat-steps',
        loading: 'nat-loading',
        error: 'nat-error',
        result: 'nat-result',
        localIp: 'nat-local-ip',
        publicIp: 'nat-public-ip',
        publicPort: 'nat-public-port',
        natType: 'nat-type',
        natDesc: 'nat-desc',
        natTips: 'nat-tips'
    }
};

// 仅在客户端环境暴露方法
const NATDetector = {
    // 初始化（必须在客户端调用）
    init: function() {
        // 双重判断：确保是浏览器环境
        if (typeof window === 'undefined' || typeof document === 'undefined') {
            console.warn('NAT检测仅支持浏览器环境');
            return;
        }

        getLocalIP();
        initWebSocket();
        bindBtnEvent();
        initStepsUI();
    },
    getLocalIp: () => localIp
};

// 获取本地IP（客户端专用）
function getLocalIP() {
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
                localIp = match[1];
                pc.close();
            }
        };
    } catch (err) {
        console.log('获取本地IP失败:', err);
    }
}

// 初始化WebSocket（客户端专用）
function initWebSocket(callback) {
    if (typeof window === 'undefined') return;
    if (ws) ws.close();

    try {
        const wsUrl = `ws://${CONFIG.serverIP}:${CONFIG.wsPort}`;
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            hideError();
            if (callback) callback();
        };

        ws.onmessage = (e) => {
            try {
                const data = JSON.parse(e.data);
                if (data.step) {
                    currentStep = data.step;
                    updateStepsUI();
                    hideLoading();

                    if (data.step === 4) {
                        isDetecting = false;
                        const btn = document.getElementById(CONFIG.domIds.btn);
                        if (btn) {
                            btn.disabled = false;
                            btn.textContent = '重新检测';
                        }
                        fillResult({
                            localIp: localIp,
                            publicIp: data.publicIp || '未知',
                            publicPort: data.publicPort || '未知',
                            natType: data.natType || '未知',
                            desc: data.description || '无',
                            tips: data.tips?.join('；') || '无'
                        });
                        showResult();
                    }
                }

                if (data.type === 'error') {
                    handleError(data.message);
                }
            } catch (err) {
                handleError('解析检测数据失败');
            }
        };

        ws.onclose = () => {
            if (isDetecting) handleError('检测服务器连接断开');
        };

        ws.onerror = () => {
            handleError('连接检测服务器失败，请检查网络');
        };
    } catch (err) {
        handleError('初始化检测连接失败');
    }
}

// 绑定按钮事件
function bindBtnEvent() {
    const btn = document.getElementById(CONFIG.domIds.btn);
    if (!btn) return;

    btn.addEventListener('click', () => {
        if (isDetecting) return;

        resetState();
        isDetecting = true;
        currentStep = 1;
        updateStepsUI();
        
        showLoading();
        hideError();
        hideResult();
        btn.disabled = true;
        btn.textContent = '检测中...';

        if (ws && ws.readyState === WebSocket.OPEN) {
            setTimeout(() => {
                ws.send(JSON.stringify({ type: 'init' }));
            }, 500);
        } else {
            initWebSocket(() => {
                ws.send(JSON.stringify({ type: 'init' }));
            });
        }
    });
}

// 初始化步骤UI
function initStepsUI() {
    const stepsContainer = document.getElementById(CONFIG.domIds.steps);
    if (!stepsContainer) return;

    const steps = [
        { id: 1, text: '连接服务器' },
        { id: 2, text: '获取公网IP' },
        { id: 3, text: '分析NAT类型' },
        { id: 4, text: '生成报告' }
    ];

    let stepsHTML = '';
    steps.forEach(step => {
        stepsHTML += `
            <div class="nat-step" id="nat-step-${step.id}">
                <div class="nat-step-icon">${step.id}</div>
                <div class="nat-step-text">${step.text}</div>
            </div>
        `;
    });
    stepsContainer.innerHTML = stepsHTML;
}

// 更新步骤UI
function updateStepsUI() {
    for (let i = 1; i <= 4; i++) {
        const stepEl = document.getElementById(`nat-step-${i}`);
        if (!stepEl) continue;

        stepEl.classList.remove('active', 'completed');
        if (i === currentStep) {
            stepEl.classList.add('active');
        } else if (i < currentStep) {
            stepEl.classList.add('completed');
        }
    }
}

// 填充检测结果
function fillResult(result) {
    const localIpEl = document.getElementById(CONFIG.domIds.localIp);
    const publicIpEl = document.getElementById(CONFIG.domIds.publicIp);
    const publicPortEl = document.getElementById(CONFIG.domIds.publicPort);
    const natTypeEl = document.getElementById(CONFIG.domIds.natType);
    const natDescEl = document.getElementById(CONFIG.domIds.natDesc);
    const natTipsEl = document.getElementById(CONFIG.domIds.natTips);

    if (localIpEl) localIpEl.textContent = result.localIp;
    if (publicIpEl) publicIpEl.textContent = result.publicIp;
    if (publicPortEl) publicPortEl.textContent = result.publicPort;
    if (natTypeEl) natTypeEl.textContent = result.natType;
    if (natDescEl) natDescEl.textContent = result.desc;
    if (natTipsEl) natTipsEl.textContent = result.tips;
}

// 错误处理
function handleError(msg) {
    isDetecting = false;
    const btn = document.getElementById(CONFIG.domIds.btn);
    if (btn) {
        btn.disabled = false;
        btn.textContent = '开始检测';
    }
    showError(msg);
    hideLoading();
    resetStepsUI();
}

// 重置状态
function resetState() {
    currentStep = 0;
    isDetecting = false;
    resetStepsUI();
}

// 重置步骤UI
function resetStepsUI() {
    for (let i = 1; i <= 4; i++) {
        const stepEl = document.getElementById(`nat-step-${i}`);
        if (stepEl) stepEl.classList.remove('active', 'completed');
    }
}

// UI工具函数
function showLoading() {
    const el = document.getElementById(CONFIG.domIds.loading);
    if (el) el.classList.add('show');
}

function hideLoading() {
    const el = document.getElementById(CONFIG.domIds.loading);
    if (el) el.classList.remove('show');
}

function showError(msg) {
    const el = document.getElementById(CONFIG.domIds.error);
    if (el) {
        el.textContent = msg;
        el.classList.add('show');
    }
}

function hideError() {
    const el = document.getElementById(CONFIG.domIds.error);
    if (el) el.classList.remove('show');
}

function showResult() {
    const el = document.getElementById(CONFIG.domIds.result);
    if (el) el.classList.add('show');
}

function hideResult() {
    const el = document.getElementById(CONFIG.domIds.result);
    if (el) el.classList.remove('show');
}

// 仅在客户端导出（Next.js SSR兼容）
if (typeof window !== 'undefined') {
    window.NATDetector = NATDetector;
}

// 模块化导出（支持import）
export default NATDetector;
