import { useState, useEffect } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic'; // 1. 引入 dynamic
// 引入样式文件
import styles from '../styles/nat.module.css';

// 2. 使用 dynamic 动态引入图标，并设置 ssr: false 来禁止服务器端渲染
const FiActivity = dynamic(() => import('react-icons/fi').then(mod => mod.FiActivity), { ssr: false });
const FiGlobe = dynamic(() => import('react-icons/fi').then(mod => mod.FiGlobe), { ssr: false });
const FiServer = dynamic(() => import('react-icons/fi').then(mod => mod.FiServer), { ssr: false });
const FiInfo = dynamic(() => import('react-icons/fi').then(mod => mod.FiInfo), { ssr: false });
const GiPartyPopper = dynamic(() => import('react-icons/gi').then(mod => mod.GiPartyPopper), { ssr: false });

export default function NatTester() {
  const [natData, setNatData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // 用于解决 hydration 问题的状态
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // 你的 VPS API 地址。
  // 重要：目前是 HTTP，在 Vercel HTTPS 环境下会被浏览器拦截。一定要尽快配置后端 HTTPS。
  const API_URL = 'http://nat.laogaofenxiang.com:5000/nat';

  const checkNatType = async () => {
    setLoading(true);
    setError(null);
    setNatData(null);

    try {
      const response = await fetch(API_URL, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      let publicIp = '未知';
      let textPort = '未知';

      if (data.results && data.results.length > 0) {
          // 假设 format 是: 本地端口:公网IP:公网端口
          const parts = data.results[0].split(':');
          if (parts.length >= 2) {
              publicIp = parts[1];
          }
          if (parts.length >= 3) {
              textPort = parts[2];
          }
      }
      
      setNatData({ ...data, publicIp, textPort });

    } catch (err) {
      console.error("Failed to fetch NAT type:", err);
      // 这里提示用户可能是混合内容问题
      setError(err.message + ' (如果部署在 Vercel，请确保后端 API 支持 HTTPS)');
    } finally {
      setLoading(false);
    }
  };

  // 如果不是在客户端，先不渲染任何内容，避免 hydration 不匹配
  if (!isClient) {
    return <div className={styles.container}></div>;
  }

  return (
    <div className={styles.container}>
      <Head>
        <title>NAT 类型在线检测工具</title>
        <meta name="description" content="远程检测您的网络 NAT 类型" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
        <h1 className={styles.title}>
            {/* 动态组件需要在使用时才加载 */}
            <FiActivity style={{ marginRight: '12px', color: '#3b82f6', verticalAlign: 'middle' }} />
            NAT 类型检测
        </h1>

        {/* 核心检测卡片 */}
        <div className={styles.card}>
            {!loading && !natData && !error && (
                <div className={styles.loading} style={{ padding: '2rem' }}>
                    <FiActivity size={40} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                    <p>点击下方按钮开始检测您的网络环境。</p>
                </div>
            )}

            {loading && (
                <div className={styles.loading}>
                    <div style={{ marginBottom: '1rem', fontSize: '2rem' }}>⏳</div>
                    正在进行 STUN 测试，请稍候...
                    <br/>
                    <small style={{opacity: 0.7, fontSize: '0.9rem'}}>这通常需要 3-5 秒</small>
                </div>
            )}

            {error && (
                <div className={styles.error}>
                    <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>检测失败</div>
                    {error}
                </div>
            )}

            {natData && !loading && (
                <div>
                    <div className={styles.resultHeader}>
                        <GiPartyPopper className={styles.icon} />
                        <span className={styles.natTypeHighlight}>
                            {natData.nat_type}
                        </span>
                        <GiPartyPopper className={styles.icon} style={{ transform: 'scaleX(-1)' }} />
                    </div>

                    <div className={styles.detailsGrid}>
                        <div className={styles.detailItem}>
                            <span className={styles.detailLabel}>
                                <FiGlobe style={{ marginRight: '8px' }} />
                                公网 IP 地址
                            </span>
                            <span className={styles.detailValue}>{natData.publicIp}</span>
                        </div>
                        <div className={styles.detailItem}>
                            <span className={styles.detailLabel}>
                                <FiServer style={{ marginRight: '8px' }} />
                                测试端口映射
                            </span>
                            <span className={styles.detailValue}>{natData.textPort}</span>
                        </div>
                    </div>
                </div>
            )}

            <button 
                onClick={checkNatType} 
                disabled={loading} 
                className={styles.button}
            >
                {loading ? '检测中...' : natData ? '重新检测' : '开始检测'}
            </button>
        </div>

        {/* 底部解释信息卡片 */}
        <section className={`${styles.card} ${styles.infoSection}`}>
            <h2 className={styles.infoTitle}>
                <FiInfo style={{ marginRight: '10px', verticalAlign: 'middle' }} />
                关于 NAT 类型
            </h2>
            <div className={styles.infoText}>
                <p>网络地址转换 (NAT) 影响着您与其他互联网用户的连接能力（如 P2P 联机）。</p>
                <ul>
                    <li><strong>Full Cone (NAT1):</strong> 最佳。完全开放，任何外部主机均可访问。</li>
                    <li><strong>Restricted Cone (NAT2):</strong> 较好。仅允许您发送过数据的 IP 回传数据。</li>
                    <li><strong>Port-Restricted Cone (NAT3):</strong> 一般。限制更严，要求外部 IP 和端口都匹配。</li>
                    <li><strong>Symmetric (NAT4):</strong> 最差。对每个外部目标使用不同的映射，P2P 困难。</li>
                </ul>
            </div>
        </section>

      </main>
    </div>
  );
}
