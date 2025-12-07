
import React, { useState, useEffect, useCallback } from 'react';
import { socketSim } from '../lib/socketSim';
import { EncryptedDataPacket, FHEAlgorithm, KeyInfo, ServerPublicKey } from '../types';

const formatCountdown = (totalSeconds: number) => {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (safe % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
};

const FHE: React.FC = () => {
  const [inputVal, setInputVal] = useState<string>('');
  const [dataPackets, setDataPackets] = useState<EncryptedDataPacket[]>([]);
  const [cloudResult, setCloudResult] = useState<string | null>(null);
  const [decryptedResult, setDecryptedResult] = useState<number | null>(null);

  // 状态
  const [algorithm, setAlgorithm] = useState<FHEAlgorithm>('PAILLIER');
  const [serverPubKey, setServerPubKey] = useState<ServerPublicKey | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [keyInfo, setKeyInfo] = useState<KeyInfo | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [serverClock, setServerClock] = useState<string>('---');
  const [serverOffset, setServerOffset] = useState<number | null>(null);

  // Loading States
  const [isConnecting, setIsConnecting] = useState(false);
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [isComputing, setIsComputing] = useState(false);

  // 获取密钥
  const fetchKey = useCallback(async (algo: FHEAlgorithm) => {
    setIsConnecting(true);
    setServerPubKey(null);
    setKeyInfo(null);
    setRemainingSeconds(0);
    setDataPackets([]);
    setCloudResult(null);
    setDecryptedResult(null);

    try {
      await socketSim.connect();
      setIsConnected(true);
      socketSim.send({ type: 'GET_FHE_KEY', algorithm: algo });
      socketSim.log('CLIENT', `请求 ${algo} 公钥...`, 'INFO');
    } catch (e) {
      setIsConnected(false);
      setIsConnecting(false);
      socketSim.log('CLIENT', '连接失败', 'Error');
    }
  }, []);

  // 监听算法切换
  useEffect(() => {
    fetchKey(algorithm);
  }, [algorithm, fetchKey]);

  useEffect(() => {
    if (!isConnected) return;
    socketSim.send({ type: 'GET_SERVER_TIME' });
    const timer = setInterval(() => socketSim.send({ type: 'GET_SERVER_TIME' }), 15000);
    return () => clearInterval(timer);
  }, [isConnected]);

  useEffect(() => {
    if (serverOffset === null) return;
    const updateClock = () => {
      const now = new Date(Date.now() + serverOffset * 1000);
      setServerClock(now.toLocaleString());
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, [serverOffset]);

  useEffect(() => {
    if (!keyInfo) return;
    setRemainingSeconds(keyInfo.remaining_seconds ?? 0);
    const timer = setInterval(() => {
      setRemainingSeconds(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [keyInfo]);

  // WebSocket 消息处理
  useEffect(() => {
    const handler = (data: any) => {
      if (data.type === 'FHE_KEY') {
        if (data.algorithm !== algorithm) return;
        setServerPubKey(data.pub_key);
        setKeyInfo(data.key_info ?? null);
        setIsConnecting(false);
        socketSim.log('SERVER', `收到 ${data.algorithm} 公钥`, 'Handshake');
      }

      if (data.type === 'ENCRYPTED_BATCH') {
        setIsEncrypting(false);
        const newPackets = data.items.map((item: any) => ({
          id: Math.random().toString(36).substr(2, 5).toUpperCase(),
          originalValue: item.original,
          ciphertext: item.ciphertext
        }));
        setDataPackets(prev => [...prev, ...newPackets]);
        socketSim.log('SERVER', `批量加密完成 (${newPackets.length} 个)`, 'DATA');
      }

      if (data.type === 'COMPUTE_RESULT') {
        setIsComputing(false);
        setCloudResult(data.ciphertext);
        if (data.plaintext !== undefined) setDecryptedResult(data.plaintext);
        const op = data.operation || (algorithm === 'PAILLIER' ? 'SUM' : 'PRODUCT');
        socketSim.log('SERVER', `云端计算完成 (${op})`, 'DATA');
      }

      if (data.type === 'KEY_STATUS' || data.type === 'FHE_KEYS' || data.type === 'KEY_ROTATED') {
        const bundle = data.keys ? data.keys[algorithm] : data.key_info ? { key_info: data.key_info } : null;
        if (bundle) {
          if (data.keys && data.keys[algorithm]?.pub_key) {
            setServerPubKey(data.keys[algorithm].pub_key);
          }
          setKeyInfo(bundle.key_info ?? null);
        }
        if (data.type === 'KEY_ROTATED') {
          socketSim.log('SERVER', `${algorithm} 密钥已轮换`, 'WARN');
          if (typeof data.timestamp === 'number') {
            const offset = data.timestamp - Date.now() / 1000;
            setServerOffset(offset);
            setServerClock(new Date(data.timestamp * 1000).toLocaleString());
          }
        }
      }

      if (data.type === 'SERVER_TIME') {
        if (typeof data.timestamp === 'number') {
          const offset = data.timestamp - Date.now() / 1000;
          setServerOffset(offset);
          setServerClock(new Date(data.timestamp * 1000).toLocaleString());
        }
        if (data.keys && data.keys[algorithm]) {
          setServerPubKey(data.keys[algorithm].pub_key);
          setKeyInfo(data.keys[algorithm].key_info ?? null);
        }
      }

      if (data.type === 'FHE_ERROR') {
        setIsConnecting(false);
        setIsEncrypting(false);
        setIsComputing(false);
        socketSim.log('SERVER', data.error || '同态服务错误', 'Error');
      }
    };

    socketSim.onMessage(handler);
    return () => socketSim.clearMessageHandlers();
  }, [algorithm]);

  // 批量随机加密
  const handleBatchEncrypt = async () => {
    if (!isConnected) return;
    setIsEncrypting(true);
    const randomValues = Array.from({ length: 5 }, () => Math.floor(Math.random() * 10) + 1); // 生成1-10的随机数避免乘法溢出太大
    socketSim.log('CLIENT', `请求批量加密: [${randomValues.join(', ')}]`, 'INFO');
    socketSim.send({
      type: 'BATCH_ENCRYPT',
      values: randomValues,
      algorithm: algorithm
    });
  };

  // 单个加密
  const handleSingleEncrypt = async () => {
    if (!inputVal) return;
    const num = parseInt(inputVal);
    if (isNaN(num)) return;
    setIsEncrypting(true);
    socketSim.send({
      type: 'BATCH_ENCRYPT',
      values: [num],
      algorithm: algorithm
    });
    setInputVal('');
  }

  // 全部计算
  const handleCompute = async () => {
    if (dataPackets.length === 0) return;
    setIsComputing(true);
    setCloudResult(null);
    setDecryptedResult(null);

    const operation = algorithm === 'PAILLIER' ? 'SUM' : 'PRODUCT';
    socketSim.log('CLIENT', `发送计算任务: ${operation}`, 'DATA');

    socketSim.send({
      type: 'COMPUTE_FHE',
      algorithm: algorithm,
      ciphertexts: dataPackets.map(p => p.ciphertext)
    });
  };

  return (
    <div className="space-y-6">
      {/* 顶部控制栏 */}
      <div className="bg-cyber-800 border border-cyber-700 rounded-lg p-6 shadow-xl">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">

          {/* 算法选择 */}
          <div>
            <h3 className="text-gray-400 text-xs font-bold uppercase mb-2">选择同态算法</h3>
            <div className="flex bg-cyber-900 rounded p-1 border border-cyber-600">
              <button
                onClick={() => setAlgorithm('PAILLIER')}
                className={`px-4 py-2 rounded text-sm font-bold transition-all ${algorithm === 'PAILLIER' ? 'bg-green-500 text-cyber-900 shadow' : 'text-gray-400 hover:text-white'}`}
              >
                Paillier (加法)
              </button>
              <button
                onClick={() => setAlgorithm('RSA')}
                className={`px-4 py-2 rounded text-sm font-bold transition-all ${algorithm === 'RSA' ? 'bg-blue-500 text-white shadow' : 'text-gray-400 hover:text-white'}`}
              >
                RSA (乘法)
              </button>
              <button
                onClick={() => setAlgorithm('ELGAMAL')}
                className={`px-4 py-2 rounded text-sm font-bold transition-all ${algorithm === 'ELGAMAL' ? 'bg-purple-500 text-white shadow' : 'text-gray-400 hover:text-white'}`}
              >
                ElGamal (乘法)
              </button>
            </div>
          </div>

          {/* 公钥与状态 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
            <div className="bg-black/30 rounded p-3 border border-white/5 font-mono text-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-cyber-accent font-bold">PUBLIC KEY ({algorithm})</span>
                <div className="flex items-center gap-2">
                  {isConnecting && <span className="animate-spin h-3 w-3 border-2 border-cyber-accent border-t-transparent rounded-full"></span>}
                  <span className={isConnected ? 'text-green-500' : 'text-red-500'}>{isConnected ? '● Online' : '● Offline'}</span>
                </div>
              </div>
              {serverPubKey ? (
                <div className="space-y-1 overflow-hidden">
                  {algorithm !== 'ELGAMAL' ? (
                    <>
                      <div className="flex gap-2">
                        <span className="text-gray-500 w-4">N:</span>
                        <span className="text-gray-300 truncate" title={serverPubKey.n || ''}>{serverPubKey.n ? `${serverPubKey.n.substring(0, 40)}...` : 'N/A'}</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-gray-500 w-4">{algorithm === 'PAILLIER' ? 'g' : 'e'}:</span>
                        <span className="text-yellow-500">
                          {algorithm === 'PAILLIER' ? serverPubKey.g : serverPubKey.e}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex gap-2">
                        <span className="text-gray-500 w-4">P:</span>
                        <span className="text-gray-300 truncate" title={serverPubKey.p || ''}>{serverPubKey.p ? `${serverPubKey.p.substring(0, 40)}...` : 'N/A'}</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-gray-500 w-4">g:</span>
                        <span className="text-yellow-500">{serverPubKey.g}</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-gray-500 w-4">y:</span>
                        <span className="text-cyan-400">{serverPubKey.y ? `${serverPubKey.y.substring(0, 40)}...` : 'N/A'}</span>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="text-gray-600 italic">正在获取密钥...</div>
              )}
            </div>

            <div className="bg-black/30 rounded p-4 border border-white/5 text-xs">
              <div className="text-gray-400 font-bold uppercase tracking-wide mb-2">Server Clock</div>
              <div className="text-white text-lg font-mono mb-4">{serverClock}</div>
              <div className="text-gray-400 text-[10px] leading-relaxed space-y-1">
                <div>当前操作: <span className="text-cyber-accent font-semibold">{keyInfo?.operation || '--'}</span></div>
                <div>密钥位数: <span className="text-white">{keyInfo?.bit_length || '--'} bit</span></div>
                <div>下一轮换: <span className="text-white">{keyInfo?.next_rotation_at || '--'}</span></div>
                <div>倒计时: <span className="text-green-400 font-bold">{formatCountdown(remainingSeconds)}</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 数据输入区 */}
        <div className="bg-cyber-800 rounded-lg border border-cyber-700 flex flex-col">
          <div className="p-4 border-b border-cyber-700 bg-cyber-700/50 flex justify-between items-center">
            <h3 className="font-bold text-white">加密数据池</h3>
            <button
              onClick={handleBatchEncrypt}
              disabled={!isConnected || isEncrypting}
              className="text-xs bg-cyber-600 hover:bg-cyber-500 px-3 py-1.5 rounded text-white flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              {isEncrypting && <span className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full"></span>}
              批量随机加密
            </button>
          </div>

          <div className="p-4 border-b border-cyber-700">
            <div className="flex gap-2">
              <input
                type="number"
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                placeholder="输入数字"
                className="flex-1 bg-cyber-900 border border-cyber-600 rounded px-3 py-2 text-white text-sm"
              />
              <button
                onClick={handleSingleEncrypt}
                disabled={!isConnected || isEncrypting}
                className="bg-cyber-accent text-cyber-900 px-4 py-2 rounded text-sm font-bold hover:bg-white disabled:opacity-50"
              >
                加密
              </button>
            </div>
          </div>

          <div className="flex-1 p-0 overflow-y-auto max-h-[300px]">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-cyber-900 text-gray-500 sticky top-0">
                <tr>
                  <th className="p-3">ID</th>
                  <th className="p-3">明文</th>
                  <th className="p-3">密文 (前缀)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cyber-700">
                {dataPackets.map(pkt => (
                  <tr key={pkt.id} className="hover:bg-cyber-700/50">
                    <td className="p-3 text-cyber-dim">{pkt.id}</td>
                    <td className="p-3 text-green-400 font-bold">{pkt.originalValue}</td>
                    <td className="p-3 text-gray-400 break-all">{pkt.ciphertext.substring(0, 20)}...</td>
                  </tr>
                ))}
                {dataPackets.length === 0 && (
                  <tr><td colSpan={3} className="p-8 text-center text-gray-600">暂无数据</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 计算结果区 */}
        <div className="flex flex-col gap-6">
          <div className="bg-gradient-to-br from-cyber-800 to-cyber-900 p-8 rounded-lg border border-cyber-600 shadow-2xl flex flex-col items-center justify-center flex-1 text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyber-accent to-transparent opacity-50"></div>

            <h3 className="text-2xl font-bold text-white mb-2">云端同态计算</h3>
            <p className="text-gray-400 text-sm mb-6">
              操作: <span className="text-cyber-purple font-mono bg-black/30 px-2 py-1 rounded">
                {(keyInfo?.operation ?? (algorithm === 'PAILLIER' ? 'SUM' : 'PRODUCT')) === 'SUM'
                  ? 'Σ E(xi) (累加)'
                  : 'Π E(xi) (累乘)'}
              </span>
            </p>

            <button
              onClick={handleCompute}
              disabled={dataPackets.length === 0 || isComputing}
              className="group relative inline-flex items-center justify-center px-8 py-3 font-bold text-white transition-all duration-200 bg-cyber-accent text-cyber-900 font-bold rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyber-accent hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isComputing ? (
                <>
                  <span className="animate-spin h-5 w-5 border-2 border-cyber-900 border-t-transparent rounded-full mr-3"></span>
                  云端计算中...
                </>
              ) : (
                "执行全部计算"
              )}
            </button>
          </div>

          <div className="bg-black rounded-lg border border-cyber-700 p-4 font-mono text-xs">
            <div className="text-gray-500 mb-2 uppercase tracking-wider">Computation Result</div>
            {cloudResult ? (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="bg-cyber-900 p-3 rounded border border-cyber-800">
                  <div className="text-[10px] text-blue-400 mb-1">ENCRYPTED RESULT (Ciphertext)</div>
                  <div className="text-yellow-600 break-all max-h-24 overflow-y-auto">{cloudResult}</div>
                </div>
                {decryptedResult !== null && (
                  <div className="bg-cyber-900 p-3 rounded border border-green-900/50 flex justify-between items-center">
                    <div className="text-[10px] text-green-500">DECRYPTED PLAINTEXT</div>
                    <div className="text-3xl font-bold text-green-400">{decryptedResult}</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-6 text-gray-700">等待计算结果...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FHE;
