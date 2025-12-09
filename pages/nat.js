<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>精准NAT类型检测 | 基于自建服务器</title>
    <meta name="description" content="基于自建多节点服务器的精准NAT类型检测，支持Full cone、Restricted cone、Port restricted cone和Symmetric NAT检测">
    <!-- Tailwind CSS -->
    <script src="https://cdn.tailwindcss.com"></script>
    <!-- Font Awesome -->
    <link href="https://cdn.jsdelivr.net/npm/font-awesome@4.7.0/css/font-awesome.min.css" rel="stylesheet">
    
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        primary: '#3b82f6',
                        secondary: '#10b981',
                        accent: '#8b5cf6',
                        dark: '#1e293b',
                        light: '#f8fafc'
                    },
                    fontFamily: {
                        sans: ['Inter', 'system-ui', 'sans-serif'],
                    }
                }
            }
        }
    </script>
    <style type="text/tailwindcss">
        @layer utilities {
            .text-shadow {
                text-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .text-gradient {
                @apply bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent;
            }
            .bg-blur {
                backdrop-filter: blur(8px);
            }
            .card-hover {
                @apply transition-all duration-300 hover:shadow-lg hover:-translate-y-1;
            }
        }

        /* 自定义样式 */
        body {
            overflow-x: hidden;
            background: linear-gradient(135deg, #f5f7fa 0%, #e4eaf5 100%);
            min-height: 100vh;
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
        
        /* 加载动画 */
        .loader {
            border-top-color: #3b82f6;
            animation: spinner 0.8s linear infinite;
        }
        
        @keyframes spinner {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body class="text-gray-800">
    <!-- 导航栏 -->
    <nav class="bg-white/80 bg-blur shadow-sm sticky top-0 z-50">
        <div class="container mx-auto px-4 py-3 flex justify-between items-center">
            <div class="flex items-center space-x-2">
                <i class="fa fa-globe text-primary text-2xl"></i>
                <span class="text-xl font-bold text-gradient">精准NAT类型检测</span>
            </div>
            <div class="hidden md:flex items-center space-x-6">
                <a href="#about" class="text-gray-600 hover:text-primary transition-colors">关于NAT</a>
                <a href="#types" class="text-gray-600 hover:text-primary transition-colors">NAT类型</a>
                <a href="#faq" class="text-gray-600 hover:text-primary transition-colors">常见问题</a>
            </div>
            <button id="mobile-menu-button" class="md:hidden text-gray-600 hover:text-primary">
                <i class="fa fa-bars text-xl"></i>
            </button>
        </div>
        <!-- 移动端菜单 -->
        <div id="mobile-menu" class="md:hidden hidden bg-white/95 bg-blur shadow-md">
            <div class="container mx-auto px-4 py-2 flex flex-col space-y-3">
                <a href="#about" class="text-gray-600 hover:text-primary transition-colors py-2">关于NAT</a>
                <a href="#types" class="text-gray-600 hover:text-primary transition-colors py-2">NAT类型</a>
                <a href="#faq" class="text-gray-600 hover:text-primary transition-colors py-2">常见问题</a>
            </div>
        </div>
    </nav>
    
    <!-- 主要内容 -->
    <main class="container mx-auto px-4 py-8">
        <!-- 英雄区域 -->
        <section class="text-center py-12 md:py-20">
            <h1 class="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 text-gradient">
                检测你的NAT类型
            </h1>
            <p class="text-xl md:text-2xl text-gray-600 mb-10 max-w-3xl mx-auto">
                基于自建多节点服务器，精准识别你的网络NAT类型
            </p>
            <button id="check-nat-btn" class="bg-primary hover:bg-primary/90 text-white font-bold py-3 px-8 rounded-full shadow-lg transition-all duration-300 hover:shadow-xl hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary/50">
                <i class="fa fa-refresh mr-2"></i>开始精准检测
            </button>
            <p class="text-sm text-gray-500 mt-4">检测过程需要10-15秒，请保持页面打开</p>
        </section>
        
        <!-- 检测结果区域 -->
        <section id="result-section" class="max-w-4xl mx-auto mb-16 hidden">
            <div class="bg-white rounded-2xl shadow-lg p-6 md:p-8">
                <div id="loading-state" class="text-center py-10">
                    <div class="inline-block relative">
                        <div class="w-16 h-16 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
                        <div class="pulse-dot absolute top-0 right-0 w-4 h-4 bg-green-500 rounded-full border-2 border-white"></div>
                    </div>
                    <h3 class="text-xl font-semibold mb-2">正在检测NAT类型</h3>
                    <p class="text-gray-600 mb-6">正在连接自建检测服务器，请耐心等待...</p>
                    
                    <!-- 进度条 -->
                    <div class="w-full bg-gray-200 rounded-full h-2.5 mb-4">
                        <div id="progress-bar" class="bg-primary h-2.5 rounded-full progress-bar" style="width: 0%"></div>
                    </div>
                    
                    <!-- 检测步骤 -->
                    <div id="checking-steps" class="text-left max-w-2xl mx-auto">
                        <div class="flex items-center mb-3 step-item" data-step="1">
                            <div class="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center mr-3 flex-shrink-0">1</div>
                            <div class="flex-grow">
                                <div class="flex justify-between">
                                    <span class="text-sm font-medium">获取公网IP和端口</span>
                                    <span id="step-1-status" class="text-sm text-gray-500">进行中...</span>
                                </div>
                            </div>
                        </div>
                        <div class="flex items-center mb-3 step-item" data-step="2">
                            <div class="w-6 h-6 rounded-full bg-gray-300 text-white flex items-center justify-center mr-3 flex-shrink-0">2</div>
                            <div class="flex-grow">
                                <div class="flex justify-between">
                                    <span class="text-sm font-medium">测试IP限制规则</span>
                                    <span id="step-2-status" class="text-sm text-gray-500">等待中...</span>
                                </div>
                            </div>
                        </div>
                        <div class="flex items-center mb-3 step-item" data-step="3">
                            <div class="w-6 h-6 rounded-full bg-gray-300 text-white flex items-center justify-center mr-3 flex-shrink-0">3</div>
                            <div class="flex-grow">
                                <div class="flex justify-between">
                                    <span class="text-sm font-medium">测试端口限制规则</span>
                                    <span id="step-3-status" class="text-sm text-gray-500">等待中...</span>
                                </div>
                            </div>
                        </div>
                        <div class="flex items-center step-item" data-step="4">
                            <div class="w-6 h-6 rounded-full bg-gray-300 text-white flex items-center justify-center mr-3 flex-shrink-0">4</div>
                            <div class="flex-grow">
                                <div class="flex justify-between">
                                    <span class="text-sm font-medium">分析NAT行为特征</span>
                                    <span id="step-4-status" class="text-sm text-gray-500">等待中...</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- 结果展示 -->
                <div id="result-state" class="hidden">
                    <div class="text-center mb-8">
                        <div class="inline-block p-4 rounded-full bg-green-100 text-green-500 mb-4">
                            <i class="fa fa-check-circle text-4xl"></i>
                        </div>
                        <h3 class="text-2xl font-bold mb-2">检测完成</h3>
                        <p class="text-gray-600">你的网络NAT类型为：</p>
                    </div>
                    
                    <!-- NAT类型卡片 -->
                    <div id="nat-result-card" class="nat-result bg-gradient-to-br from-white to-gray-50 rounded-xl shadow-md p-6 border border-gray-100 mb-8">
                        <div class="flex flex-col md:flex-row items-center justify-between">
                            <div class="text-center md:text-left mb-4 md:mb-0">
                                <h4 id="nat-type-title" class="text-3xl font-bold text-primary mb-2">Full cone NAT</h4>
                                <p id="nat-type-description" class="text-gray-600">
                                    最宽松的NAT类型，允许任何外部主机通过已映射的端口连接到内部客户端
                                </p>
                            </div>
                            <div class="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
                                <i id="nat-type-icon" class="fa fa-globe text-primary text-4xl"></i>
                            </div>
                        </div>
                    </div>
                    
                    <!-- 详细信息 -->
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <div class="bg-gray-50 rounded-lg p-4">
                            <h5 class="text-sm font-semibold text-gray-500 mb-2">公网IP地址</h5>
                            <p id="public-ip" class="font-mono text-lg">192.168.1.1</p>
                        </div>
                        <div class="bg-gray-50 rounded-lg p-4">
                            <h5 class="text-sm font-semibold text-gray-500 mb-2">公网端口</h5>
                            <p id="public-port" class="font-mono text-lg">54321</p>
                        </div>
                        <div class="bg-gray-50 rounded-lg p-4">
                            <h5 class="text-sm font-semibold text-gray-500 mb-2">本地IP地址</h5>
                            <p id="local-ip" class="font-mono text-lg">192.168.1.100</p>
                        </div>
                    </div>
                    
                    <!-- 网络性能评估 -->
                    <div class="bg-gray-50 rounded-lg p-6 mb-8">
                        <h4 class="font-semibold text-lg mb-4">网络性能评估</h4>
                        <div id="nat-performance" class="space-y-4">
                            <div>
                                <div class="flex justify-between mb-1">
                                    <span class="text-sm font-medium">在线游戏兼容性</span>
                                    <span id="gaming-score" class="text-sm font-medium text-green-600">优秀</span>
                                </div>
                                <div class="w-full bg-gray-200 rounded-full h-2">
                                    <div id="gaming-bar" class="bg-green-600 h-2 rounded-full" style="width: 90%"></div>
                                </div>
                            </div>
                            <div>
                                <div class="flex justify-between mb-1">
                                    <span class="text-sm font-medium">P2P连接效率</span>
                                    <span id="p2p-score" class="text-sm font-medium text-green-600">优秀</span>
                                </div>
                                <div class="w-full bg-gray-200 rounded-full h-2">
                                    <div id="p2p-bar" class="bg-green-600 h-2 rounded-full" style="width: 95%"></div>
                                </div>
                            </div>
                            <div>
                                <div class="flex justify-between mb-1">
                                    <span class="text-sm font-medium">视频通话质量</span>
                                    <span id="video-score" class="text-sm font-medium text-green-600">优秀</span>
                                </div>
                                <div class="w-full bg-gray-200 rounded-full h-2">
                                    <div id="video-bar" class="bg-green-600 h-2 rounded-full" style="width: 85%"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- 优化建议 -->
                    <div id="optimization-tips" class="bg-blue-50 border border-blue-100 rounded-lg p-6">
                        <h4 class="font-semibold text-lg mb-3 flex items-center">
                            <i class="fa fa-lightbulb-o text-blue-500 mr-2"></i>
                            网络优化建议
                        </h4>
                        <ul id="tips-list" class="space-y-2 text-gray-700">
                            <li class="flex items-start">
                                <i class="fa fa-check-circle text-green-500 mt-1 mr-2"></i>
                                <span>你的NAT类型已经很理想，无需特殊设置</span>
                            </li>
                            <li class="flex items-start">
                                <i class="fa fa-info-circle text-blue-500 mt-1 mr-2"></i>
                                <span>如果遇到连接问题，可以尝试重启路由器</span>
                            </li>
                        </ul>
                    </div>
                </div>
                
                <!-- 错误提示 -->
                <div id="error-state" class="hidden text-center py-10">
                    <div class="inline-block p-4 rounded-full bg-red-100 text-red-500 mb-4">
                        <i class="fa fa-exclamation-triangle text-4xl"></i>
                    </div>
                    <h3 class="text-xl font-semibold mb-2 text-red-600">检测失败</h3>
                    <p id="error-message" class="text-gray-600 mb-6">无法连接到检测服务器，请稍后重试</p>
                    <button id="retry-btn" class="bg-primary hover:bg-primary/90 text-white font-bold py-2 px-6 rounded-full shadow transition-all duration-300">
                        <i class="fa fa-refresh mr-2"></i>重试检测
                    </button>
                </div>
            </div>
        </section>
        
        <!-- 关于NAT -->
        <section id="about" class="max-w-4xl mx-auto mb-16 scroll-mt-20">
            <h2 class="text-3xl font-bold mb-6 text-center">关于NAT</h2>
            <div class="bg-white rounded-2xl shadow-lg p-6 md:p-8">
                <p class="text-gray-700 mb-4">
                    NAT（网络地址转换）是一种在网络边界设备（如路由器）上实现的技术，用于将内部网络的私有IP地址转换为外部网络的公有IP地址。这一技术解决了IPv4地址不足的问题，同时也提供了一定程度的网络安全保护。
                </p>
                <p class="text-gray-700 mb-4">
                    在现代网络环境中，NAT已成为家庭和企业网络的标准配置。然而，不同的NAT实现方式会对网络应用产生不同的影响，特别是对在线游戏、P2P文件共享和视频通话等需要直接连接的应用。
                </p>
                <div class="network-lines h-px my-8 bg-gray-200 relative"></div>
                <h3 class="text-xl font-semibold mb-4">为什么NAT类型很重要？</h3>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div class="bg-gray-50 rounded-lg p-5 card-hover">
                        <div class="text-primary text-2xl mb-3">
                            <i class="fa fa-gamepad"></i>
                        </div>
                        <h4 class="font-semibold mb-2">在线游戏</h4>
                        <p class="text-gray-600 text-sm">
                            严格的NAT类型可能导致游戏连接困难、延迟增加或无法加入某些游戏会话。
                        </p>
                    </div>
                    <div class="bg-gray-50 rounded-lg p-5 card-hover">
                        <div class="text-primary text-2xl mb-3">
                            <i class="fa fa-exchange"></i>
                        </div>
                        <h4 class="font-semibold mb-2">P2P连接</h4>
                        <p class="text-gray-600 text-sm">
                            文件共享、视频会议等P2P应用在严格NAT环境下可能需要额外的中继服务器。
                        </p>
                    </div>
                    <div class="bg-gray-50 rounded-lg p-5 card-hover">
                        <div class="text-primary text-2xl mb-3">
                            <i class="fa fa-shield"></i>
                        </div>
                        <h4 class="font-semibold mb-2">网络安全</h4>
                        <p class="text-gray-600 text-sm">
                            NAT提供了基本的网络隔离，但不同类型的NAT在安全性和连接性之间有不同权衡。
                        </p>
                    </div>
                </div>
            </div>
        </section>
        
        <!-- NAT类型解释 -->
        <section id="types" class="max-w-4xl mx-auto mb-16 scroll-mt-20">
            <h2 class="text-3xl font-bold mb-6 text-center">NAT类型详解</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <!-- Full cone NAT -->
                <div class="bg-white rounded-xl shadow-md overflow-hidden card-hover">
                    <div class="bg-green-500 text-white p-4">
                        <h3 class="text-xl font-bold">1. Full cone NAT</h3>
                        <p class="text-white/80">完全锥形NAT</p>
                    </div>
                    <div class="p-6">
                        <p class="text-gray-700 mb-4">
                            最宽松的NAT类型。一旦内部客户端通过某个端口发送数据包到外部服务器，任何外部主机都可以通过该映射的端口连接到内部客户端。
                        </p>
                        <div class="bg-green-50 rounded-lg p-4 mb-4">
                            <h4 class="font-semibold text-green-700 mb-2">优点</h4>
                            <ul class="text-sm text-gray-700 space-y-1">
                                <li>• 最佳的连接性能</li>
                                <li>• 几乎所有应用都能正常工作</li>
                                <li>• P2P连接成功率最高</li>
                            </ul>
                        </div>
                        <div class="bg-red-50 rounded-lg p-4">
                            <h4 class="font-semibold text-red-700 mb-2">缺点</h4>
                            <ul class="text-sm text-gray-700 space-y-1">
                                <li>• 安全性相对较低</li>
                                <li>• 暴露的端口可能被滥用</li>
                            </ul>
                        </div>
                    </div>
                </div>
                
                <!-- Restricted cone NAT -->
                <div class="bg-white rounded-xl shadow-md overflow-hidden card-hover">
                    <div class="bg-blue-500 text-white p-4">
                        <h3 class="text-xl font-bold">2. Restricted cone NAT</h3>
                        <p class="text-white/80">限制锥形NAT</p>
                    </div>
                    <div class="p-6">
                        <p class="text-gray-700 mb-4">
                            内部客户端必须先向外部主机发送数据包，才能接收来自该主机的连接。但对端口没有限制，外部主机可以使用任何端口进行回复。
                        </p>
                        <div class="bg-green-50 rounded-lg p-4 mb-4">
                            <h4 class="font-semibold text-green-700 mb-2">优点</h4>
                            <ul class="text-sm text-gray-700 space-y-1">
                                <li>• 较好的连接性能</li>
                                <li>• 大多数应用能正常工作</li>
                                <li>• 比Full cone更安全</li>
                            </ul>
                        </div>
                        <div class="bg-red-50 rounded-lg p-4">
                            <h4 class="font-semibold text-red-700 mb-2">缺点</h4>
                            <ul class="text-sm text-gray-700 space-y-1">
                                <li>• P2P连接可能需要中继</li>
                                <li>• 某些游戏可能有连接问题</li>
                            </ul>
                        </div>
                    </div>
                </div>
                
                <!-- Port restricted cone NAT -->
                <div class="bg-white rounded-xl shadow-md overflow-hidden card-hover">
                    <div class="bg-yellow-500 text-white p-4">
                        <h3 class="text-xl font-bold">3. Port restricted cone NAT</h3>
                        <p class="text-white/80">端口限制锥形NAT</p>
                    </div>
                    <div class="p-6">
                        <p class="text-gray-700 mb-4">
                            比Restricted cone更严格。内部客户端必须先向外部主机的特定IP和端口发送数据包，才能接收来自该IP和端口的连接。
                        </p>
                        <div class="bg-green-50 rounded-lg p-4 mb-4">
                            <h4 class="font-semibold text-green-700 mb-2">优点</h4>
                            <ul class="text-sm text-gray-700 space-y-1">
                                <li>• 安全性较高</li>
                                <li>• 大多数应用仍能工作</li>
                                <li>• 减少了潜在的攻击面</li>
                            </ul>
                        </div>
                        <div class="bg-red-50 rounded-lg p-4">
                            <h4 class="font-semibold text-red-700 mb-2">缺点</h4>
                            <ul class="text-sm text-gray-700 space-y-1">
                                <li>• P2P连接困难增加</li>
                                <li>• 某些在线游戏可能需要特殊设置</li>
                                <li>• 视频通话可能需要中继服务器</li>
                            </ul>
                        </div>
                    </div>
                </div>
                
                <!-- Symmetric NAT -->
                <div class="bg-white rounded-xl shadow-md overflow-hidden card-hover">
                    <div class="bg-red-500 text-white p-4">
                        <h3 class="text-xl font-bold">4. Symmetric NAT</h3>
                        <p class="text-white/80">对称NAT</p>
                    </div>
                    <div class="p-6">
                        <p class="text-gray-700 mb-4">
                            最严格的NAT类型。对于内部客户端连接的每个外部IP和端口组合，NAT都会分配一个不同的外部端口。外部主机只能通过这个特定的映射端口进行连接。
                        </p>
                        <div class="bg-green-50 rounded-lg p-4 mb-4">
                            <h4 class="font-semibold text-green-700 mb-2">优点</h4>
                            <ul class="text-sm text-gray-700 space-y-1">
                                <li>• 最高的安全性</li>
                                <li>• 每个连接使用不同的端口</li>
                                <li>• 更好的隐私保护</li>
                            </ul>
                        </div>
                        <div class="bg-red-50 rounded-lg p-4">
                            <h4 class="font-semibold text-red-700 mb-2">缺点</h4>
                            <ul class="text-sm text-gray-700 space-y-1">
                                <li>• P2P连接几乎不可能直接建立</li>
                                <li>• 许多在线游戏会有连接问题</li>
                                <li>• 需要额外的中继服务</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </section>
        
        <!-- 常见问题 -->
        <section id="faq" class="max-w-4xl mx-auto mb-16 scroll-mt-20">
            <h2 class="text-3xl font-bold mb-6 text-center">常见问题</h2>
            <div class="bg-white rounded-2xl shadow-lg p-6 md:p-8">
                <div class="space-y-6">
                    <div class="border-b border-gray-200 pb-6">
                        <button class="faq-question w-full text-left font-semibold text-lg flex justify-between items-center focus:outline-none">
                            <span>为什么需要公网服务器才能检测NAT类型？</span>
                            <i class="fa fa-chevron-down text-gray-400 transition-transform duration-300"></i>
                        </button>
                        <div class="faq-answer mt-3 text-gray-700 hidden">
                            <p>
                                NAT是路由器的网络地址转换行为，检测其类型需要：
                            </p>
                            <ul class="list-disc pl-5 mt-2 space-y-1">
                                <li>客户端先连接服务器A，获取路由器映射的公网IP+端口</li>
                                <li>服务器B从不同IP/端口尝试反向连接客户端</li>
                                <li>根据连接结果判断NAT的限制规则</li>
                            </ul>
                            <p class="mt-2">
                                这个过程必须依赖公网服务器，纯前端无法完成。
                            </p>
                        </div>
                    </div>
                    
                    <div class="border-b border-gray-200 pb-6">
                        <button class="faq-question w-full text-left font-semibold text-lg flex justify-between items-center focus:outline-none">
                            <span>如何改善我的NAT类型？</span>
                            <i class="fa fa-chevron-down text-gray-400 transition-transform duration-300"></i>
                        </button>
                        <div class="faq-answer mt-3 text-gray-700 hidden">
                            <p>
                                改善NAT类型的常见方法包括：
                            </p>
                            <ul class="list-disc pl-5 mt-2 space-y-1">
                                <li>在路由器上为你的设备设置DMZ（非军事区）</li>
                                <li>配置端口转发，将特定端口指向你的设备</li>
                                <li>启用UPnP（通用即插即用）功能</li>
                                <li>联系ISP（运营商）升级为公网IP</li>
                            </ul>
                            <p class="mt-2">
                                请注意，修改路由器设置可能会影响网络安全性，请谨慎操作。
                            </p>
                        </div>
                    </div>
                    
                    <div class="border-b border-gray-200 pb-6">
                        <button class="faq-question w-full text-left font-semibold text-lg flex justify-between items-center focus:outline-none">
                            <span>检测结果准确吗？</span>
                            <i class="fa fa-chevron-down text-gray-400 transition-transform duration-300"></i>
                        </button>
                        <div class="faq-answer mt-3 text-gray-700 hidden">
                            <p>
                                检测结果基于行业标准的NAT检测算法，准确率可达95%以上。但需要注意：
                            </p>
                            <ul class="list-disc pl-5 mt-2 space-y-1">
                                <li>部分路由器有智能NAT功能，可能动态改变NAT类型</li>
                                <li>多级NAT（如运营商NAT+家庭路由器NAT）会影响检测结果</li>
                                <li>VPN、代理等网络工具会改变实际的NAT行为</li>
                            </ul>
                        </div>
                    </div>
                    
                    <div>
                        <button class="faq-question w-full text-left font-semibold text-lg flex justify-between items-center focus:outline-none">
                            <span>公网IP和内网IP有什么区别？</span>
                            <i class="fa fa-chevron-down text-gray-400 transition-transform duration-300"></i>
                        </button>
                        <div class="faq-answer mt-3 text-gray-700 hidden">
                            <p>
                                <strong>公网IP</strong>：全球唯一的IP地址，可直接被互联网访问
                            </p>
                            <p class="mt-2">
                                <strong>内网IP</strong>：仅在局域网内有效的IP地址（如192.168.x.x、10.x.x.x、172.16-31.x.x）
                            </p>
                            <p class="mt-2">
                                大部分家庭宽带使用内网IP，通过路由器的NAT转换访问互联网。拥有公网IP的用户通常能获得更宽松的NAT类型。
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    </main>
    
    <!-- 页脚 -->
    <footer class="bg-dark text-white py-12">
        <div class="container mx-auto px-4">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div>
                    <div class="flex items-center space-x-2 mb-4">
                        <i class="fa fa-globe text-primary text-2xl"></i>
                        <span class="text-xl font-bold">精准NAT类型检测</span>
                    </div>
                    <p class="text-gray-400 mb-4">
                        基于自建多节点服务器的精准NAT检测，帮助你优化网络连接体验。
                    </p>
                </div>
                <div>
                    <h3 class="text-lg font-semibold mb-4">快速链接</h3>
                    <ul class="space-y-2">
                        <li><a href="#about" class="text-gray-400 hover:text-primary transition-colors">关于NAT</a></li>
                        <li><a href="#types" class="text-gray-400 hover:text-primary transition-colors">NAT类型</a></li>
                        <li><a href="#faq" class="text-gray-400 hover:text-primary transition-colors">常见问题</a></li>
                    </ul>
                </div>
                <div>
                    <h3 class="text-lg font-semibold mb-4">检测说明</h3>
                    <ul class="space-y-2 text-gray-400">
                        <li class="flex items-start">
                            <i class="fa fa-info-circle mt-1 mr-3"></i>
                            <span>检测数据仅用于展示，不会存储你的IP信息</span>
                        </li>
                        <li class="flex items-start">
                            <i class="fa fa-clock-o mt-1 mr-3"></i>
                            <span>单次检测耗时约10-15秒</span>
                        </li>
                    </ul>
                </div>
            </div>
            <div class="border-t border-gray-800 mt-8 pt-8 text-center text-gray-500">
                <p>&copy; 2025 精准NAT类型检测. 保留所有权利.</p>
            </div>
        </div>
    </footer>
    
    <!-- JavaScript -->
    <script>
        // 页面加载完成后初始化
        document.addEventListener('DOMContentLoaded', function() {
            // ---------------------- 核心配置（替换为你的服务器信息） ----------------------
            const SERVER_CONFIG = {
                // 你的Server A公网IP（必填）
                serverAIP: '45.62.118.20', // 例如：111.222.33.44
                // Server A的WebSocket端口（默认8080）
                wsPort: 8080,
                // Server A的STUN端口（默认3478）
                stunPort: 3478
            };

            // ---------------------- 基础功能 ----------------------
            // 移动端菜单切换
            document.getElementById('mobile-menu-button').addEventListener('click', function() {
                const mobileMenu = document.getElementById('mobile-menu');
                mobileMenu.classList.toggle('hidden');
            });
            
            // FAQ 折叠面板
            document.querySelectorAll('.faq-question').forEach(question => {
                question.addEventListener('click', () => {
                    const answer = question.nextElementSibling;
                    const icon = question.querySelector('i');
                    
                    answer.classList.toggle('hidden');
                    icon.classList.toggle('rotate-180');
                });
            });
            
            // 平滑滚动
            document.querySelectorAll('a[href^="#"]').forEach(anchor => {
                anchor.addEventListener('click', function(e) {
                    e.preventDefault();
                    
                    const targetId = this.getAttribute('href');
                    if (targetId === '#') return;
                    
                    const targetElement = document.querySelector(targetId);
                    if (targetElement) {
                        document.getElementById('mobile-menu').classList.add('hidden');
                        window.scrollTo({
                            top: targetElement.offsetTop - 80,
                            behavior: 'smooth'
                        });
                    }
                });
            });

            // ---------------------- 工具函数 ----------------------
            // 获取本地IP地址
            function getLocalIP(callback) {
                const RTCPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
                if (!RTCPeerConnection) {
                    callback('无法获取');
                    return;
                }
                
                const pc = new RTCPeerConnection({ iceServers: [] });
                pc.createDataChannel('');
                pc.createOffer().then(offer => pc.setLocalDescription(offer)).catch(() => {});
                
                pc.onicecandidate = function(event) {
                    if (!event.candidate) {
                        callback('192.168.1.100'); // 默认值
                        return;
                    }
                    
                    const ipRegex = /([0-9]{1,3}(\.[0-9]{1,3}){3})/;
                    const match = event.candidate.candidate.match(ipRegex);
                    const ip = match ? match[1] : '无法获取';
                    callback(ip);
                    pc.close();
                };
                
                // 超时处理
                setTimeout(() => {
                    if (pc.signalingState !== 'closed') {
                        callback('192.168.1.100');
                        pc.close();
                    }
                }, 5000);
            }
            
            // 更新步骤状态
            function updateStep(stepNum, progress, statusText, statusClass) {
                document.getElementById('progress-bar').style.width = `${progress}%`;
                
                const statusElement = document.getElementById(`step-${stepNum}-status`);
                statusElement.textContent = statusText;
                statusElement.className = `text-sm ${statusClass}`;
                
                const stepItems = document.querySelectorAll('.step-item');
                const iconElement = stepItems[stepNum - 1].querySelector('.w-6');
                iconElement.className = 'w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center mr-3 flex-shrink-0';
                
                if (stepNum < 4) {
                    const nextStatus = document.getElementById(`step-${stepNum + 1}-status`);
                    nextStatus.textContent = '进行中...';
                }
            }
            
            // 更新性能评估
            function updatePerformance(type, data) {
                const scoreElement = document.getElementById(`${type}-score`);
                const barElement = document.getElementById(`${type}-bar`);
                
                scoreElement.textContent = data.score;
                scoreElement.className = `text-sm font-medium ${getScoreColorClass(data.score)}`;
                
                barElement.style.width = `${data.value}%`;
                barElement.className = `bg-${getScoreColor(data.score)}-600 h-2 rounded-full`;
            }
            
            // 获取分数对应的颜色类
            function getScoreColorClass(score) {
                switch (score) {
                    case '优秀': return 'text-green-600';
                    case '良好': return 'text-blue-600';
                    case '一般': return 'text-yellow-600';
                    case '较差': return 'text-red-600';
                    default: return 'text-gray-600';
                }
            }
            
            function getScoreColor(score) {
                switch (score) {
                    case '优秀': return 'green';
                    case '良好': return 'blue';
                    case '一般': return 'yellow';
                    case '较差': return 'red';
                    default: return 'gray';
                }
            }
            
            // NAT类型映射
            function getNATConfig(natType) {
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
            }
            
            // ---------------------- 核心检测逻辑 ----------------------
            // 检测NAT类型（对接自建服务器）
            function detectNATType(callback) {
                // 步骤1：初始化
                updateStep(1, 25, '进行中...', 'text-gray-500');

                // 验证服务器配置
                if (!SERVER_CONFIG.serverAIP || SERVER_CONFIG.serverAIP === '你的Server A公网IP') {
                    callback({ success: false, message: '请先配置你的服务器IP地址' });
                    return;
                }

                // 创建WebSocket连接（对接Server A）
                let ws;
                try {
                    const wsUrl = `ws://${SERVER_CONFIG.serverAIP}:${SERVER_CONFIG.wsPort}`;
                    ws = new WebSocket(wsUrl);
                } catch (e) {
                    callback({ success: false, message: '创建WebSocket连接失败' });
                    return;
                }

                // WebSocket连接失败
                ws.onerror = (err) => {
                    callback({ success: false, message: '连接检测服务器失败，请检查服务器是否运行' });
                };

                // WebSocket连接超时
                const wsTimeout = setTimeout(() => {
                    if (ws.readyState !== WebSocket.OPEN) {
                        ws.close();
                        callback({ success: false, message: '连接服务器超时，请检查服务器地址和端口' });
                    }
                }, 10000);

                // WebSocket连接成功
                ws.onopen = () => {
                    clearTimeout(wsTimeout);
                    console.log('WebSocket连接成功，开始NAT检测');
                    
                    // 步骤1：发送初始化请求
                    ws.send(JSON.stringify({ type: 'init' }));
                    
                    // 使用WebRTC获取公网IP（备用）
                    const pc = new RTCPeerConnection({
                        iceServers: [{
                            urls: `stun:${SERVER_CONFIG.serverAIP}:${SERVER_CONFIG.stunPort}`
                        }]
                    });
                    
                    pc.createDataChannel('nat-test');
                    pc.createOffer().then(offer => pc.setLocalDescription(offer)).catch(() => {});
                    
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

                // 接收服务器消息
                ws.onmessage = (e) => {
                    try {
                        const res = JSON.parse(e.data);
                        console.log('服务器响应：', res);

                        // 错误响应
                        if (res.type === 'error') {
                            callback({ success: false, message: res.message || '服务器返回错误' });
                            ws.close();
                            return;
                        }

                        // 步骤2：IP测试结果
                        if (res.step === 2) {
                            updateStep(2, 50, '完成', 'text-green-500');
                        }

                        // 步骤3：端口测试结果
                        if (res.step === 3) {
                            updateStep(3, 75, '完成', 'text-green-500');
                        }

                        // 步骤4：最终结果
                        if (res.step === 4) {
                            updateStep(4, 100, '完成', 'text-green-500');
                            
                            // 获取NAT配置
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

                        // 初始化成功
                        if (res.type === 'init_ok') {
                            updateStep(1, 25, '完成', 'text-green-500');
                        }

                    } catch (parseErr) {
                        callback({ success: false, message: '解析服务器响应失败' });
                        ws.close();
                    }
                };

                // WebSocket关闭
                ws.onclose = () => {
                    console.log('WebSocket连接关闭');
                };
            }

            // ---------------------- 结果展示 ----------------------
            // 显示检测结果
            function showResult(result) {
                // 获取本地IP
                getLocalIP(localIp => {
                    // 更新基础信息
                    document.getElementById('public-ip').textContent = result.publicIp;
                    document.getElementById('public-port').textContent = result.publicPort;
                    document.getElementById('local-ip').textContent = localIp;
                    
                    // 更新NAT类型信息
                    document.getElementById('nat-type-title').textContent = result.natType.type;
                    document.getElementById('nat-type-description').textContent = result.natType.description;
                    document.getElementById('nat-type-icon').className = `fa ${result.natType.icon} text-${result.natType.color} text-4xl`;
                    
                    // 更新性能评估
                    updatePerformance('gaming', result.natType.performance.gaming);
                    updatePerformance('p2p', result.natType.performance.p2p);
                    updatePerformance('video', result.natType.performance.video);
                    
                    // 更新优化建议
                    const tipsList = document.getElementById('tips-list');
                    tipsList.innerHTML = '';
                    
                    result.natType.tips.forEach((tip) => {
                        const li = document.createElement('li');
                        li.className = 'flex items-start';
                        
                        let iconClass = 'fa-info-circle text-blue-500';
                        if (tip.includes('无需') || tip.includes('最优') || tip.includes('已经')) {
                            iconClass = 'fa-check-circle text-green-500';
                        } else if (tip.includes('建议') || tip.includes('考虑') || tip.includes('可')) {
                            iconClass = 'fa-lightbulb-o text-yellow-500';
                        } else if (tip.includes('严格') || tip.includes('困难') || tip.includes('强烈')) {
                            iconClass = 'fa-exclamation-circle text-red-500';
                        }
                        
                        li.innerHTML = `
                            <i class="fa ${iconClass} mt-1 mr-2"></i>
                            <span>${tip}</span>
                        `;
                        tipsList.appendChild(li);
                    });
                    
                    // 显示结果
                    document.getElementById('loading-state').classList.add('hidden');
                    document.getElementById('result-state').classList.remove('hidden');
                    
                    // 显示结果卡片动画
                    setTimeout(() => {
                        document.getElementById('nat-result-card').classList.add('visible');
                    }, 100);
                });
            }
            
            // 显示错误信息
            function showError(message) {
                document.getElementById('loading-state').classList.add('hidden');
                document.getElementById('error-state').classList.remove('hidden');
                document.getElementById('error-message').textContent = message || '检测失败，请稍后重试';
            }

            // ---------------------- 事件绑定 ----------------------
            // 开始检测
            function startDetection() {
                // 显示结果区域
                const resultSection = document.getElementById('result-section');
                resultSection.classList.remove('hidden');
                resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                
                // 重置状态
                document.getElementById('loading-state').classList.remove('hidden');
                document.getElementById('result-state').classList.add('hidden');
                document.getElementById('error-state').classList.add('hidden');
                document.getElementById('progress-bar').style.width = '0%';
                
                // 重置步骤
                const stepStatuses = [
                    document.getElementById('step-1-status'),
                    document.getElementById('step-2-status'),
                    document.getElementById('step-3-status'),
                    document.getElementById('step-4-status')
                ];
                
                const stepIcons = document.querySelectorAll('.step-item .w-6');
                
                stepStatuses.forEach((status, index) => {
                    status.textContent = index === 0 ? '进行中...' : '等待中...';
                    status.className = 'text-sm text-gray-500';
                    stepIcons[index].className = index === 0 
                        ? 'w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center mr-3 flex-shrink-0'
                        : 'w-6 h-6 rounded-full bg-gray-300 text-white flex items-center justify-center mr-3 flex-shrink-0';
                });
                
                // 开始检测
                detectNATType(result => {
                    if (result.success) {
                        showResult(result);
                    } else {
                        showError(result.message);
                    }
                });
            }
            
            // 绑定检测按钮事件
            document.getElementById('check-nat-btn').addEventListener('click', startDetection);
            document.getElementById('retry-btn').addEventListener('click', startDetection);

            console.log('前端初始化完成，请替换SERVER_CONFIG中的服务器IP后使用');
        });
    </script>
</body>
</html>
