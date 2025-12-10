/**
 * NAT类型检测工具 - 纯原生JS版
 * 适配博客嵌入、Vercel部署
 * 后端地址：ws://45.62.118.20:8080
 */
(function(window) {
    // ########## 配置项（可根据需要修改）##########
    const CONFIG = {
        serverIP: '45.62.118.20',
        wsPort: 8080,
        // DOM元素ID（博客中需对应创建这些ID的元素）
        domIds: {
            btn: 'nat-detect-btn',       // 检测按钮ID
            steps: 'nat-steps',          // 步骤容器ID
            loading: 'nat-loading',      // 加载提示ID
            error: 'nat-error',          // 错误提示ID
            result: 'nat-result',        // 结果容器ID
            // 结果项ID
            localIp: 'nat-local-ip',
            publicIp: 'nat-public-ip',
            publicPort: 'nat-public-port',
            natType: 'nat-type',
            natDesc: 'nat-desc',
            natTips: 'nat-tips'
        }
    };

    // ########## 全局状态 ##########
    let ws = null;
    let isDetecting = false;
    let currentStep = 0;
    let localIp = '未知';

    // ########## 初始化函数（核心入口）##########
    function initNATDetector() {
        // 获取本地IP
        getLocalIP();
        // 初始化WebSocket
        initWebSocket();
        // 绑定按钮点击事件
        bindBtnEvent();
        // 初始化步骤UI
        initStepsUI();
    }

    // ########## 获取本地IP ##########
    function getLocalIP() {
        try {
            const RTCPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
            if (!RTCPeerConnection) return;

            const pc = new RTCPeerConnection({ iceServers: [] });
            pc.createDataChannel('');
            pc.createOffer().then(offer => pc.setLocalDescription(offer));

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

    // ########## 初始化WebSocket ##########
    function initWebSocket(callback) {
        if (ws) ws.close();

        try {
            const wsUrl = `ws://${CONFIG.serverIP}:${CONFIG.wsPort}`;
            ws = new WebSocket(wsUrl);

            // 连接成功
            ws.onopen = () => {
                hideError();
                if (callback) callback();
            };

            // 接收消息
            ws.onmessage = (e) => {
                try {
                    const data = JSON.parse(e.data);
                    // 更新步骤
                    if (data.step) {
                        currentStep = data.step;
                        updateStepsUI();
                        hideLoading();

                        // 检测完成（步骤4）
                        if (data.step === 4) {
                            isDetecting = false;
                            document.getElementById(CONFIG.domIds.btn).disabled = false;
                            document.getElementById(CONFIG.domIds.btn).textContent = '重新检测';
                            // 填充结果
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

                    // 错误消息
                    if (data.type === 'error') {
                        handleError(data.message);
                    }
                } catch (err) {
                    handleError('解析检测数据失败');
                }
            };

            // 连接关闭
            ws.onclose = () => {
                if (isDetecting) {
                    handleError('检测服务器连接断开');
                }
            };

            // 连接错误
            ws.onerror = (err) => {
                handleError('连接检测服务器失败，请检查网络');
            };
        } catch (err) {
            handleError('初始化检测连接失败');
        }
    }

    // ########## 绑定按钮事件 ##########
    function bindBtnEvent() {
        const btn = document.getElementById(CONFIG.domIds.btn);
        if (!btn) return;

        btn.addEventListener('click', () => {
            if (isDetecting) return;

            // 重置状态
            resetState();
            isDetecting = true;
            currentStep = 1;
            updateStepsUI();
            
            // 更新UI
            showLoading();
            hideError();
            hideResult();
            btn.disabled = true;
            btn.textContent = '检测中...';

            // 发送检测请求
            if (ws && ws.readyState === WebSocket.OPEN) {
                setTimeout(() => {
                    ws.send(JSON.stringify({ type: 'init' }));
                }, 500);
            } else {
                // 重新连接后发送
                initWebSocket(() => {
                    ws.send(JSON.stringify({ type: 'init' }));
                });
            }
        });
    }

    // ########## 初始化步骤UI ##########
    function initStepsUI() {
        const stepsContainer = document.getElementById(CONFIG.domIds.steps);
        if (!stepsContainer) return;

        // 步骤配置
        const steps = [
            { id: 1, text: '连接服务器' },
            { id: 2, text: '获取公网IP' },
            { id: 3, text: '分析NAT类型' },
            { id: 4, text: '生成报告' }
        ];

        // 生成步骤HTML
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

    // ########## 更新步骤UI ##########
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

    // ########## 填充检测结果 ##########
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

    // ########## 错误处理 ##########
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

    // ########## 重置状态 ##########
    function resetState() {
        currentStep = 0;
        isDetecting = false;
        resetStepsUI();
    }

    // ########## 重置步骤UI ##########
    function resetStepsUI() {
        for (let i = 1; i <= 4; i++) {
            const stepEl = document.getElementById(`nat-step-${i}`);
            if (stepEl) stepEl.classList.remove('active', 'completed');
        }
    }

    // ########## UI控制工具函数 ##########
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

    // ########## 暴露全局方法 ##########
    window.NATDetector = {
        init: initNATDetector,
        getLocalIp: () => localIp
    };

    // ########## DOM加载完成后自动初始化 ##########
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initNATDetector();
    } else {
        document.addEventListener('DOMContentLoaded', initNATDetector);
    }
})(window);
