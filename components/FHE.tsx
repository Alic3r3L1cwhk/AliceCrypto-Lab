import React, { useState, useEffect, useCallback } from 'react';
import { socketSim } from './lib/socketSim';
import { EncryptedDataPacket } from '../types';

interface KeyInfo {
  generated_at: string;
  next_rotation_at: string;
  remaining_seconds: number;
  rotation_interval: number;
}

interface ServerPublicKey {
  n: string;
  g: string;
}

const FHE: React.FC = () => {
  const [inputVal, setInputVal] = useState<string>('');
  const [dataPackets, setDataPackets] = useState<EncryptedDataPacket[]>([]);
  const [cloudResult, setCloudResult] = useState<string | null>(null);
  const [decryptedSum, setDecryptedSum] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);

  const [serverPubKey, setServerPubKey] = useState<ServerPublicKey | null>(null);
  const [keyInfo, setKeyInfo] = useState<KeyInfo | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // SEAL 参数模拟
  const [polyModulusDegree, setPolyModulusDegree] = useState("4096");
  const [coeffModulus, setCoeffModulus] = useState("128 bits");

  const fetchServerKey = useCallback(async () => {
    try {
      await socketSim.connect();
      setIsConnected(true);
      socketSim.send({ type: 'GET_PAILLIER_KEY' });
      socketSim.log('CLIENT', '正在获取 FHE 上下文与密钥...', 'INFO');
    } catch (e) {
      setIsConnected(false);
      socketSim.log('CLIENT', '连接失败', 'Error');
    }
  }, []);

  const encryptWithServer = async (value: number): Promise<string | null> => {
    return new Promise((resolve) => {
      let resolved = false;
      const handler = (data: any) => {
        if (data.type === 'ENCRYPTED_VALUE' && data.original === value.toString()) {
          if (!resolved) {
            resolved = true;
            resolve(data.ciphertext);
          }
        }
      };
      socketSim.onMessage(handler);
      socketSim.send({ type: 'ENCRYPT_VALUE', value: value });
      setTimeout(() => { if (!resolved) { resolved = true; resolve(null); } }, 10000);
    });
  };

  useEffect(() => {
    const messageHandler = (data: any) => {
      if (data.type === 'PAILLIER_KEY' || data.type === 'KEY_ROTATED') {
        setServerPubKey(data.pub_key);
        setKeyInfo(data.key_info);
        if (data.type === 'KEY_ROTATED') {
          setDataPackets([]);
          setCloudResult(null);
          setDecryptedSum(null);
          socketSim.log('SERVER', '上下文已轮换，重线性化密钥已更新。', 'WARN');
        } else {
          setIsConnected(true);
          socketSim.log('SERVER', 'FHE 上下文已接收', 'DATA', `PolyDeg: ${polyModulusDegree}`);
        }
      }

      if (data.type === 'COMPUTE_RESULT_SERVER_KEY' || data.type === 'COMPUTE_RESULT') {
        setProcessing(false);
        setCloudResult(data.ciphertext || data.result);
        if (data.plaintext !== undefined) setDecryptedSum(data.plaintext);
        socketSim.log('SERVER', '同态评估完成', 'DATA');
      }

      if (data.type === 'DECRYPTED_VALUE') {
        setDecryptedSum(data.plaintext);
        socketSim.log('SERVER', `解密结果: ${data.plaintext}`, 'DATA');
      }
    };

    socketSim.onMessage(messageHandler);
    fetchServerKey();
  }, [fetchServerKey]);

  const handleEncryptAndStore = async () => {
    const num = parseInt(inputVal);
    if (isNaN(num)) return;

    socketSim.log('CLIENT', `正在加密向量: [${num}]`, 'INFO');
    const ciphertext = await encryptWithServer(num);

    if (ciphertext) {
      const packet: EncryptedDataPacket = {
        id: Math.random().toString(36).substr(2, 5).toUpperCase(),
        originalValue: num,
        ciphertext: ciphertext
      };
      setDataPackets(prev => [...prev, packet]);
    }
    setInputVal('');
  };

  const handleCompute = async () => {
    if (dataPackets.length === 0) return;
    setProcessing(true);
    setCloudResult(null);
    setDecryptedSum(null);

    socketSim.log('CLIENT', `分发评估任务 (向量求和)`, 'DATA');
    socketSim.send({
      type: 'COMPUTE_SUM_SERVER_KEY',
      values: dataPackets.map(p => p.ciphertext),
      return_plaintext: true
    });
  };

  return (
    <div className="space-y-6">
      {/* SEAL 参数控制台 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 bg-cyber-800 rounded border border-cyber-700 p-4">
          <h3 className="text-cyber-accent font-bold mb-3 text-sm uppercase tracking-widest">加密参数 (SEAL)</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-cyber-900 p-3 rounded border border-cyber-600">
              <label className="text-xs text-gray-500 block mb-1">多项式模数度 (PolyModulusDegree)</label>
              <select
                value={polyModulusDegree}
                onChange={e => setPolyModulusDegree(e.target.value)}
                className="bg-transparent text-white font-mono w-full focus:outline-none"
              >
                <option value="4096">4096 (标准)</option>
                <option value="8192">8192 (高安全)</option>
              </select>
            </div>
            <div className="bg-cyber-900 p-3 rounded border border-cyber-600">
              <label className="text-xs text-gray-500 block mb-1">系数模数位宽 (CoeffModulus)</label>
              <div className="text-white font-mono">{coeffModulus}</div>
            </div>
            <div className="bg-cyber-900 p-3 rounded border border-cyber-600">
              <label className="text-xs text-gray-500 block mb-1">加密方案</label>
              <div className="text-cyber-purple font-mono">CKKS / BFV</div>
            </div>
            <div className="bg-cyber-900 p-3 rounded border border-cyber-600">
              <label className="text-xs text-gray-500 block mb-1">安全等级</label>
              <div className="text-green-400 font-mono">128-bit TC</div>
            </div>
          </div>
        </div>

        <div className="bg-cyber-800 rounded border border-cyber-700 p-4 flex flex-col justify-between">
          <div>
            <h3 className="text-gray-400 font-bold mb-2 text-xs uppercase">服务器连接</h3>
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="text-sm">{isConnected ? '上下文已加载' : '未连接'}</span>
            </div>
          </div>
          <button
            onClick={fetchServerKey}
            className="w-full py-2 bg-cyber-600 hover:bg-cyber-500 text-white rounded text-xs uppercase font-bold transition-colors"
          >
            重载上下文
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 输入区 */}
        <div className="bg-cyber-800 rounded border border-cyber-700 p-1">
          <div className="bg-cyber-900 p-4 rounded-t border-b border-cyber-700">
            <div className="flex gap-2">
              <input
                type="number"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder="输入整数值"
                className="flex-1 bg-cyber-800 border border-cyber-600 rounded px-4 py-2 focus:outline-none focus:border-cyber-accent text-white font-mono"
              />
              <button
                onClick={handleEncryptAndStore}
                disabled={!isConnected}
                className="bg-cyber-accent text-cyber-900 px-4 py-2 rounded font-bold hover:bg-white transition-colors disabled:opacity-50"
              >
                加密
              </button>
            </div>
          </div>
          <div className="p-2 h-64 overflow-y-auto font-mono text-xs">
            <table className="w-full text-left">
              <thead className="text-gray-500 border-b border-cyber-700">
                <tr>
                  <th className="pb-2 pl-2">ID</th>
                  <th className="pb-2">明文</th>
                  <th className="pb-2">密文 (截断)</th>
                </tr>
              </thead>
              <tbody>
                {dataPackets.map((pkt) => (
                  <tr key={pkt.id} className="border-b border-cyber-700/50 hover:bg-cyber-700/30">
                    <td className="py-2 pl-2 text-cyber-dim">{pkt.id}</td>
                    <td className="py-2 text-green-400">{pkt.originalValue}</td>
                    <td className="py-2 text-gray-600 break-all">{pkt.ciphertext.substring(0, 32)}...</td>
                  </tr>
                ))}
                {dataPackets.length === 0 && (
                  <tr><td colSpan={3} className="py-8 text-center text-gray-600">暂无向量数据</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 结果区 */}
        <div className="flex flex-col gap-4">
          <div className="bg-cyber-800 rounded border border-cyber-700 p-6 flex-1 flex flex-col justify-center items-center text-center">
            <div className="mb-6">
              <h3 className="text-xl font-bold text-white mb-2">同态评估</h3>
              <p className="text-sm text-gray-400">操作: <span className="text-cyber-purple font-mono">Add(Vector[]) (向量求和)</span></p>
            </div>

            <button
              onClick={handleCompute}
              disabled={processing || dataPackets.length === 0}
              className={`px-8 py-3 rounded border border-cyber-accent text-cyber-accent hover:bg-cyber-accent hover:text-cyber-900 font-bold transition-all ${processing ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {processing ? "计算中..." : "云端执行"}
            </button>
          </div>

          <div className="bg-black rounded border border-cyber-700 p-4 font-mono">
            <div className="text-gray-500 text-xs mb-2">结果缓冲区</div>
            {cloudResult ? (
              <div className="space-y-3">
                <div className="bg-cyber-900 p-2 rounded border border-cyber-800">
                  <div className="text-[10px] text-gray-600 mb-1">加密结果 (ENCRYPTED RESULT)</div>
                  <div className="text-yellow-600 text-[10px] break-all max-h-20 overflow-hidden">{cloudResult}</div>
                </div>
                {decryptedSum !== null && (
                  <div className="flex justify-between items-center bg-cyber-900 p-2 rounded border border-cyber-800">
                    <div className="text-[10px] text-gray-600">客户端解密结果 (DECRYPTED)</div>
                    <div className="text-2xl text-green-400 font-bold">{decryptedSum}</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-gray-700 text-center py-4">空闲</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FHE;