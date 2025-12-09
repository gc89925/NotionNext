import { useState } from 'react';
import Head from 'next/head';
// 引入我们刚创建的样式文件
import styles from '../styles/nat.module.css';
// 引入图标
import { FiActivity, FiGlobe, FiServer } from 'react-icons/fi';
import { GiPartyPopper } from 'react-icons/gi';

export default function NatTester() {
  const [natData, setNatData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // 替换为你自己的 VPS Flask API 地址
  // 注意：必须是 HTTPS，否则 Vercel 会阻止请求
  const API_URL = 'http://nat.laogaofenxiang.com:5000/nat';

  const checkNatType = async () => {
    setLoading(true);
    setError(null);
    setNatData(null);

    try {
      const response = await fetch(API_URL, {
        method: 'GET',
        // 确保后端处理了 OPTIONS 请求，或者尝试去掉这个 header 如果不需要
        headers: {
            'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      // 简单处理一下数据，提取公共IP和第一个端口
      let publicIp = '未知';
      let textPort = '未知';

      if (data.results && data.results.length > 0) {
          const parts = data.results[0].split(':');
          if (parts.length >= 2) {
              publicIp = parts[1];
          }
          if (parts.length >= 3) {
              // 原始结果是 本地端口:公网IP:公网端口
              textPort = parts[2];
          }
      }
      
      // 将处理后的数据存入状态
      setNatData({ ...data, publicIp, textPort });

    } catch (err) {
      console.error("Failed to fetch NAT type:", err);
      setError(err.message || '请求失败，请检查网络或后端服务。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div={styles.container}>
      <Head>
        <title>NAT 类型在线检测工具</title>
        <meta name="description" content="远程检测您的网络 NAT 类型" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
        <h1 className={styles.title}>
            <FiActivity style={{ marginRight: '10px', verticalAlign: 'middle' }} />
            NAT 类型检测
        </h1>

        {/* 核心检测卡片 */}
        <div className={styles.card}>
            {!loading && !natData && !error && (
                <div className={styles.loading}>
                    点击下方按钮开始检测您的网络环境。
                </div>
            )}

            {loading && (
                <div className={styles.loading}>
                    正在进行 STUN 测试，请稍候...
                    <br/>
                    <small style={{color: '#888'}}>这可能需要几秒钟</small>
                </div>
            )}

            {error && (
                <div className={styles.error}>
                    <strong>检测失败:</strong> {error}
                    <br/>
                    <small>请确保您的 VPS API 服务正常运行且支持 HTTPS。</small>
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
                                <FiGlobe style={{ marginRight: '5px' }} />
                                公网 IP 地址
                            </span>
                            <span className={styles.detailValue}>{natData.publicIp}</span>
                        </div>
                        <div className={styles.detailItem}>
                            <span className={styles.detailLabel}>
                                <FiServer style={{ marginRight: '5px' }} />
                                测试端口
                            </span>
                            <span className={styles.detailValue}>{natData.textPort}</span>
                        </div>
                    </div>
                    {/* 可以选择性显示原始数据 */}
                    {/* <details style={{marginTop: '1rem', color: '#888'}}>
                        <summary>查看原始数据</summary>
                        <pre style={{textAlign: 'left', backgroundColor: '#000', padding: '1rem', borderRadius: '8px', overflowX: 'auto'}}>
                            {JSON.stringify(natData, null, 2)}
                        </pre>
                    </details> */}
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
            <h2 className={styles.infoTitle}>关于 NAT 类型</h2>
            <div className={styles.infoText}>
                <p>网络地址转换 (NAT) 影响着您与其他互联网用户的连接能力，尤其是在 P2P 游戏或应用中。</p>
                <ul style={{ paddingLeft: '20px', marginTop: '10px' }}>
                    <li><strong>Full Cone NAT (NAT1):</strong> 最佳类型。任何外部主机都可以通过映射的公网 IP 和端口向您发送数据。</li>
                    <li><strong>Restricted Cone NAT (NAT2):</strong> 只有您向其发送过数据的外部主机才能向您发送数据（基于 IP）。</li>
                    <li><strong>Port-Restricted Cone NAT (NAT3):</strong> 类似 NAT2，但限制更严格，外部主机必须匹配 IP 和端口。</li>
                    <li><strong>Symmetric NAT (NAT4):</strong> 最严格的类型。每次连接不同的外部目标都会使用不同的公网映射，通常对 P2P 不友好。</li>
                </ul>
            </div>
        </section>

      </main>
    </div>
  );
}
