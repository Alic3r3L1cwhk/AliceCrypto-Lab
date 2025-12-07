import React, { useState, useEffect, useCallback } from 'react';
import { socketSim } from '../lib/socketSim';
import { EncryptedDataPacket } from '../types';

interface KeyInfo {
  generated_at: string;
  next_rotation_at: string;
  remaining_seconds: number;
  rotation_interval: number;
  server_time: string;
}

interface ServerPublicKey {
  n: string;
  g: string;
}

const PrivacyComputing: React.FC = () => {
  const [inputVal, setInputVal] = useState<string>('');
  const [dataPackets, setDataPackets] = useState<EncryptedDataPacket[]>([]);
  const [cloudResult, setCloudResult] = useState<string | null>(null);
  const [decryptedSum, setDecryptedSum] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);
  
  const [serverPubKey, setServerPubKey] = useState<ServerPublicKey | null>(null);
  const [keyInfo, setKeyInfo] = useState<KeyInfo | null>(null);
  const [countdown, setCountdown] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [keyLoading, setKeyLoading] = useState(true);
  const [useServerKey, setUseServerKey] = useState(true);
  const [isConnected, setIsConnected] = useState(false);

  const formatCountdown = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins. toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const fetchServerKey = useCallback(async () => {
    setKeyLoading(true);
    try {
      await socketSim.connect();
      setIsConnected(true);
      socketSim.send({ type: 'GET_PAILLIER_KEY' });
      socketSim.log('CLIENT', '请求服务端 Paillier 公钥', 'INFO');
    } catch (e) {
      setIsConnected(false);
      setKeyLoading(false);
      socketSim.log('CLIENT', '连接服务器失败', 'Error');  // 修复: ERROR -> Error
    }
  }, []);

  const encryptWithServer = async (value: number): Promise<string | null> => {
    return new Promise((resolve) => {
      let resolved = false;
      
      const handler = (data: any) => {
        if (data.type === 'ENCRYPTED_VALUE' && data.original === value. toString()) {
          if (!resolved) {
            resolved = true;
            resolve(data.ciphertext);
          }
        }
      };
      
      socketSim.onMessage(handler);
      socketSim.send({ type: 'ENCRYPT_VALUE', value: value });
      
      setTimeout(() => {
        if (! resolved) {
          resolved = true;
          resolve(null);
        }
      }, 10000);
    });
  };

  useEffect(() => {
    const messageHandler = (data: any) => {
      if (data. type === 'PAILLIER_KEY') {
        setServerPubKey(data.pub_key);
        setKeyInfo(data.key_info);
        setCountdown(data.key_info?. remaining_seconds || 0);
        setKeyLoading(false);
        setIsConnected(true);
        socketSim.log('SERVER', '收到服务端公钥', 'DATA', `N长度: ${data. pub_key.n.length} 位`);
      }
      
      if (data.type === 'KEY_ROTATED') {
        setServerPubKey(data.pub_key);
        setKeyInfo(data.key_info);
        setCountdown(data. key_info?.remaining_seconds || 0);
        setDataPackets([]);
        setCloudResult(null);
        setDecryptedSum(null);
        socketSim.log('SERVER', '🔄 密钥已轮换，数据已重置', 'WARN');
      }
      
      if (data.type === 'COMPUTE_RESULT_SERVER_KEY') {
        setProcessing(false);
        setCloudResult(data.ciphertext);
        if (data.plaintext !== undefined) {
          setDecryptedSum(data.plaintext);
        }
        socketSim.log('SERVER', '收到云端计算结果', 'DATA');
      }
      
      if (data.type === 'COMPUTE_RESULT') {
        setProcessing(false);
        setCloudResult(data.result);
        socketSim.log('SERVER', '收到云端计算结果', 'DATA');
      }

      if (data.type === 'ENCRYPTED_VALUE') {
        socketSim.log('SERVER', '加密完成', 'DATA');
      }

      if (data. type === 'DECRYPTED_VALUE') {
        setDecryptedSum(data.plaintext);
        socketSim.log('SERVER', `解密结果: ${data. plaintext}`, 'DATA');
      }
    };

    socketSim. onMessage(messageHandler);
    fetchServerKey();

    const countdownTimer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          if (isConnected) {
            fetchServerKey();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    const timeTimer = setInterval(() => {
      setCurrentTime(new Date().toLocaleString('zh-CN'));
    }, 1000);

    return () => {
      clearInterval(countdownTimer);
      clearInterval(timeTimer);
    };
  }, [fetchServerKey, isConnected]);

  const handleEncryptAndStore = async () => {
    const num = parseInt(inputVal);
    if (isNaN(num)) return;

    if (useServerKey && serverPubKey) {
      socketSim.log('CLIENT', `请求加密数值: ${num}`, 'INFO');
      const ciphertext = await encryptWithServer(num);
      
      if (ciphertext) {
        const packet: EncryptedDataPacket = {
          id: Math.random().toString(36).substr(2, 5),
          originalValue: num,
          ciphertext: ciphertext
        };
        setDataPackets(prev => [...prev, packet]);
        socketSim.log('CLIENT', `加密成功，密文长度: ${ciphertext.length}`, 'INFO');
      } else {
        socketSim. log('CLIENT', '加密超时', 'Error');  // 修复: ERROR -> Error
      }
    } else {
      socketSim.log('CLIENT', '本地加密模式暂不可用', 'Error');  // 修复: ERROR -> Error
    }
    
    setInputVal('');
  };

  const handleOutsourceCalculation = async () => {
    if (dataPackets.length === 0) return;
    setProcessing(true);
    setCloudResult(null);
    setDecryptedSum(null);

    try {
      await socketSim.connect();
    } catch (e) {
      setProcessing(false);
      return;
    }

    socketSim.log('CLIENT', `发送 ${dataPackets.length} 条密文到云端求和`, 'DATA');
    
    if (useServerKey) {
      socketSim.send({
        type: 'COMPUTE_SUM_SERVER_KEY',
        values: dataPackets. map(p => p.ciphertext),
        return_plaintext: true
      });
    } else {
      socketSim.send({
        type: 'COMPUTE_SUM',
        pub_key: serverPubKey,
        values: dataPackets.map(p => p.ciphertext)
      });
    }
  };

  const handleDecryptResult = () => {
    if (! cloudResult) return;
    if (useServerKey) {
      socketSim. send({
        type: 'DECRYPT_VALUE',
        ciphertext: cloudResult
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* 密钥状态卡片 */}
      <div className="bg-gradient-to-r from-cyber-800 to-cyber-900 rounded-lg p-4 border border-cyber-500 shadow-lg">
        <div className="flex justify-between items-center flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="text-cyber-dim text-sm">
              <span className="text-gray-400">系统时间:</span>
              <span className="text-white ml-2 font-mono">{currentTime}</span>
            </div>
            <div className="h-4 w-px bg-cyber-600"></div>
            <div className="text-cyber-dim text-sm">
              <span className="text-gray-400">密钥生成于:</span>
              <span className="text-cyber-accent ml-2 font-mono">
                {keyInfo?.generated_at || (keyLoading ? '加载中.. .' : '未连接')}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-sm">
              <span className="text-gray-400">下次轮换倒计时:</span>
              <span className={`ml-2 font-mono font-bold text-lg ${countdown < 60 ? 'text-red-400 animate-pulse' : 'text-green-400'}`}>
                {isConnected ? formatCountdown(countdown) : '--:--'}
              </span>
            </div>
            <button
              onClick={fetchServerKey}
              disabled={keyLoading}
              className="px-3 py-1 bg-cyber-600 hover:bg-cyber-500 text-white rounded text-sm transition-colors disabled:opacity-50"
            >
              {keyLoading ?  '连接中...' : (isConnected ? '刷新密钥' : '连接服务器')}
            </button>
          </div>
        </div>
        
        {/* 进度条 */}
        <div className="mt-3 h-1 bg-cyber-700 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-cyber-accent to-green-400 transition-all duration-1000"
            style={{ width: `${isConnected ? (countdown / (keyInfo?.rotation_interval || 300)) * 100 : 0}%` }}
          ></div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-cyber-800 rounded-lg p-6 border border-cyber-700 shadow-lg">
          <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <span className="text-cyber-accent">01. </span> 数据输入
          </h3>
          
          {/* 模式切换 */}
          <div className="mb-4 flex items-center gap-2">
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={useServerKey}
                onChange={(e) => setUseServerKey(e.target.checked)}
                className="sr-only"
              />
              <div className={`w-10 h-5 rounded-full transition-colors ${useServerKey ? 'bg-cyber-accent' : 'bg-gray-600'}`}>
                <div className={`w-4 h-4 rounded-full bg-white transform transition-transform mt-0.5 ${useServerKey ?  'translate-x-5' : 'translate-x-1'}`}></div>
              </div>
              <span className="ml-2 text-sm text-gray-300">
                {useServerKey ? '服务端密钥 (2048位)' : '本地密钥 (演示)'}
              </span>
            </label>
          </div>
          
          <div className="flex gap-2 mb-6">
            <input
              type="number"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder="输入数值 (支持任意大小)"
              className="flex-1 bg-cyber-900 border border-cyber-600 rounded px-4 py-2 focus:outline-none focus:border-cyber-accent text-white"
            />
            <button 
              onClick={handleEncryptAndStore} 
              disabled={(! serverPubKey && useServerKey) || ! isConnected}
              className="bg-cyber-500 hover:bg-cyber-400 text-white px-4 py-2 rounded font-semibold transition-colors border border-cyber-500 disabled:opacity-50"
            >
              加密并添加
            </button>
          </div>
          
          <div className="bg-cyber-900 rounded p-4 h-48 overflow-y-auto border border-cyber-700">
            {dataPackets.length === 0 ?  (
              <div className="text-gray-500 text-center py-8">
                {isConnected ? '暂无数据，请输入数值并加密' : '请先连接服务器'}
              </div>
            ) : (
              dataPackets.map((pkt) => (
                <div key={pkt.id} className="grid grid-cols-3 gap-2 text-xs font-mono border-b border-cyber-800 py-2 hover:bg-cyber-800">
                  <span className="text-gray-400">{pkt.id}</span>
                  <span className="text-green-400">{pkt.originalValue}</span>
                  <span className="text-gray-500 truncate">{pkt.ciphertext. substring(0, 15)}... </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-cyber-800 rounded-lg p-6 border border-cyber-700 shadow-lg flex flex-col justify-center">
          <h3 className="text-xl font-bold text-white mb-4 text-center">同态加密参数</h3>
          <div className="space-y-4 text-center">
            <div className="p-2 bg-cyber-900 rounded">
              <div className="text-cyber-dim text-xs">模数 N (长度)</div>
              <div className="text-cyber-accent font-mono">
                {serverPubKey ?  `${serverPubKey.n.length} 位数字` : (isConnected ? '加载中...' : '未连接')}
              </div>
            </div>
            <div className="p-2 bg-cyber-900 rounded">
              <div className="text-cyber-dim text-xs">N 前20位</div>
              <div className="text-cyber-accent font-mono text-sm truncate">
                {serverPubKey ? serverPubKey.n.substring(0, 20) + '...' : (isConnected ? '加载中...' : '未连接')}
              </div>
            </div>
            <div className="p-2 bg-cyber-900 rounded">
              <div className="text-cyber-dim text-xs">密钥强度</div>
              <div className="text-green-400 font-mono font-bold">
                {serverPubKey ? '2048 bits (安全)' : (isConnected ? '加载中...' : '未连接')}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-center my-4">
        <button
          onClick={handleOutsourceCalculation}
          disabled={processing || dataPackets.length === 0 || !isConnected}
          className={`px-8 py-4 rounded-full font-bold text-lg shadow-lg transition-all transform hover:scale-105 ${
            processing ?  'bg-cyber-700 text-gray-400' : 'bg-cyber-accent text-cyber-900 hover:bg-white'
          } disabled:opacity-50 disabled:hover:scale-100`}
        >
          {processing ?  "云端计算中..." : "发起安全云端外包计算"}
        </button>
      </div>

      {(cloudResult || decryptedSum !== null) && (
        <div className="bg-gradient-to-r from-cyber-800 to-cyber-900 rounded-lg p-6 border border-cyber-500 shadow-lg text-center">
          <h3 className="text-xl font-bold text-white mb-4">收到云端结果</h3>
          <div className="bg-black/50 p-3 rounded font-mono text-xs break-all border border-cyber-700 mb-4 text-yellow-500 max-h-24 overflow-auto">
            {cloudResult ? cloudResult. substring(0, 200) + (cloudResult.length > 200 ? '...' : '') : '等待中...'}
          </div>
          {decryptedSum === null ?  (
            <button 
              onClick={handleDecryptResult} 
              className="px-6 py-2 border-2 border-cyber-accent text-cyber-accent rounded hover:bg-cyber-accent hover:text-cyber-900 transition-colors uppercase font-bold"
            >
              请求服务端解密
            </button>
          ) : (
            <div className="text-4xl font-mono font-bold text-green-400 animate-pulse">
              {decryptedSum}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PrivacyComputing;