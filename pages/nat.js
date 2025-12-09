import { useState } from 'react';

export default function NATTest() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const apiURL = "https://你的域名/nat"; // ← 记得换成你的域名

  const testNAT = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(apiURL);
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError("请求失败，请检查服务器或域名配置");
    }

    setLoading(false);
  };

  return (
    <div
      className="min-h-screen p-6"
      style={{
        background: "linear-gradient(135deg, #6D5DFB 0%, #4AA8FF 100%)",
      }}
    >
      <div className="max-w-4xl mx-auto mt-20 bg-white rounded-2xl shadow-xl p-10">
        
        <h1 className="text-4xl font-bold text-center mb-4">NAT 类型测试</h1>
        <p className="text-center text-gray-600 mb-8">
          点击按钮即可测试你的 NAT 类型、公网 IP 与端口映射情况
        </p>

        <div className="text-center">
          <button
            onClick={testNAT}
            disabled={loading}
            className="px-8 py-3 bg-indigo-600 text-white rounded-xl text-lg shadow hover:bg-indigo-700 transition"
          >
            {loading ? "检测中..." : "点击检测我的 NAT 类型"}
          </button>
        </div>

        {/* 结果展示 */}
        {result && (
          <div className="mt-10 p-6 bg-gray-50 rounded-xl border">
            <h2 className="text-xl font-semibold mb-3">检测结果</h2>
            <p><strong>NAT 类型：</strong>{result.nat_type}</p>
            <p><strong>公网 IP：</strong>{result.results[0].split(':')[1]}</p>
            <p className="mt-2">
              <strong>端口映射：</strong>
            </p>
            <ul className="list-disc list-inside mt-1">
              {result.results.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <div className="mt-8 p-4 bg-red-100 text-red-800 rounded-lg border border-red-300">
            ❌ {error}
          </div>
        )}
      </div>

      {/* NAT 介绍部分 */}
      <div className="max-w-4xl mx-auto mt-16 bg-white rounded-2xl shadow-md p-10">
        <h2 className="text-2xl font-bold mb-4">什么是 NAT？</h2>
        <p className="text-gray-700 leading-7">
          <strong>NAT（网络地址转换）</strong> 允许多个局域网设备共享一个公网 IP，
          在正常网页浏览、观影等场景没有问题，但在  
          <strong>P2P 连接、游戏、远程访问</strong> 上，会受到不同 NAT 类型的影响。
        </p>

        <div className="text-center my-8">
          <img
            src="https://i.imgur.com/ZDdqMmj.png"
            className="mx-auto w-3/4"
            alt="NAT 示意图"
          />
        </div>

        <h2 className="text-2xl font-bold mb-4">NAT 四种类型</h2>

        <ul className="space-y-2 text-gray-700">
          <li><strong>Full Cone NAT（全锥形）</strong>：外部主机只要知道 IP+端口即可访问。</li>
          <li><strong>Restricted Cone NAT（受限锥形）</strong>：外部主机需先有通讯记录。</li>
          <li><strong>Port Restricted Cone NAT（端口受限锥形）</strong>：更严格，需要端口完全匹配。</li>
          <li><strong>Symmetric NAT（对称 NAT）</strong>：每个外联都会分配不同端口，P2P 最困难。</li>
        </ul>

        <p className="mt-4 text-gray-700">
          <strong>总结：</strong>前 3 种 NAT 都较为友好，对称 NAT 最严格，也是最难穿透的类型。
        </p>
      </div>
    </div>
  );
}
