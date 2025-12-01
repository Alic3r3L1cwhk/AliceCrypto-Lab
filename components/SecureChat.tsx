import React, { useState, useEffect, useRef } from 'react';
import { socketSim } from '../lib/socketSim';
import { SocketLog, ChatMessage } from '../types';

const MAX_LOGS = 30; // 最多显示的日志条数
const LOG_CLEAR_INTERVAL = 30 * 60 * 1000; // 30分钟清除一次（毫秒）

const SecureChat: React.FC = () => {
  const [logs, setLogs] = useState<SocketLog[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState(false);
  const [secureKey, setSecureKey] = useState<CryptoKey | null>(null);
  const [keyPair, setKeyPair] = useState<CryptoKeyPair | null>(null);
  const [nextClearTime, setNextClearTime] = useState<Date | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const logScrollRef = useRef<HTMLDivElement>(null);

  // 自动滚动
  useEffect(() => {
    if (logScrollRef.current) logScrollRef.current. scrollTop = logScrollRef.current.scrollHeight;
  }, [logs]);

  // 定时清除日志
  useEffect(() => {
    // 计算下次清除时间（下一个整 30 分钟点）
    const calculateNextClearTime = () => {
      const now = new Date();
      const minutes = now.getMinutes();
      const nextMinutes = minutes < 30 ? 30 : 60;
      const next = new Date(now);
      next. setMinutes(nextMinutes % 60);
      next.setSeconds(0);
      next. setMilliseconds(0);
      if (nextMinutes === 60) {
        next.setHours(next.getHours() + 1);
      }
      return next;
    };

    // 设置初始下次清除时间
    setNextClearTime(calculateNextClearTime());

    // 每秒检查是否到达清除时间
    const checkInterval = setInterval(() => {
      const now = new Date();
      const minutes = now.getMinutes();
      const seconds = now.getSeconds();
      
      // 在整 30 分钟时清除（00:00, 00:30, 01:00, 01:30... ）
      if ((minutes === 0 || minutes === 30) && seconds === 0) {
        setLogs([]);
        socketSim.log('CLIENT', '📋 日志已自动清除（每30分钟）', 'INFO');
        setNextClearTime(calculateNextClearTime());
      }
    }, 1000);

    return () => clearInterval(checkInterval);
  }, []);

  useEffect(() => {
    const unsubLog = socketSim. subscribe((log) => {
      setLogs(prev => {
        // 添加新日志，保持最多 MAX_LOGS 条
        const newLogs = [... prev, log];
        if (newLogs. length > MAX_LOGS) {
          return newLogs.slice(-MAX_LOGS); // 保留最新的 30 条
        }
        return newLogs;
      });
    });
    
    // 监听服务器消息
    socketSim.onMessage(async (data) => {
        if (data.type === 'HANDSHAKE_REPLY') {
            socketSim.log('SERVER', '收到服务端公钥', 'Handshake', data.publicKey. substring(0, 20) + '...');
            await completeHandshake(data.publicKey);
        } else if (data. type === 'CHAT_REPLY') {
            socketSim.log('SERVER', '收到加密回复', 'DATA', data.content. substring(0, 15) + '...');
            await decryptIncomingMessage(data);
        }
    });

    return () => unsubLog();
  }, [keyPair]);

  // 1. 发起连接并开始握手
  const connectToSocket = async () => {
    try {
      await socketSim.connect();
      setConnected(true);
      await performKeyExchangeInit();
    } catch (e) {
      setConnected(false);
    }
  };

  // 2.  生成自身公钥并发送 (ECDH)
  const performKeyExchangeInit = async () => {
    try {
      const kp = await window.crypto.subtle. generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        true,
        ["deriveKey"]
      );
      setKeyPair(kp);

      const exportedKey = await window.crypto.subtle. exportKey("spki", kp. publicKey);
      const b64Key = btoa(String.fromCharCode(... new Uint8Array(exportedKey)));
      
      socketSim. log('CLIENT', '生成 ECDH 密钥对，发送公钥... ', 'Handshake', b64Key. substring(0, 20) + '.. .');
      
      socketSim.send({
          type: 'HANDSHAKE_INIT',
          publicKey: b64Key
      });

    } catch (e) {
      console.error(e);
      socketSim.log('CLIENT', '密钥生成失败', 'Error');
    }
  };

  // 3. 收到服务端公钥，计算共享密钥
  const completeHandshake = async (serverPubB64: string) => {
      if (!keyPair) return;

      try {
        const binaryDerString = atob(serverPubB64);
        const binaryDer = new Uint8Array(binaryDerString.length);
        for (let i = 0; i < binaryDerString.length; i++) {
            binaryDer[i] = binaryDerString.charCodeAt(i);
        }
        
        const serverKey = await window.crypto.subtle.importKey(
            "spki",
            binaryDer,
            { name: "ECDH", namedCurve: "P-256" },
            false,
            []
        );

        const sharedBits = await window. crypto.subtle.deriveBits(
            { name: "ECDH", public: serverKey },
            keyPair.privateKey,
            256
        );

        const material = await window.crypto.subtle.importKey(
            "raw", 
            sharedBits, 
            { name: "HKDF" }, 
            false, 
            ["deriveKey"]
        );

        const aesKey = await window.crypto.subtle. deriveKey(
            {
                name: "HKDF",
                hash: "SHA-256",
                salt: new Uint8Array(),
                info: new TextEncoder().encode("handshake data")
            },
            material,
            { name: "AES-GCM", length: 256 },
            true,
            ["encrypt", "decrypt"]
        );

        setSecureKey(aesKey);
        socketSim.log('CLIENT', '密钥协商完成 (ECDH + HKDF)', 'Handshake');
        socketSim.log('CLIENT', '安全通道已建立 (AES-256-GCM)', 'INFO');
      } catch (err: any) {
          console.error(err);
          socketSim.log('CLIENT', '协商失败: ' + err.message, 'Error');
      }
  };

  const handleSend = async () => {
    if (!input.trim() || !secureKey) return;

    const plaintext = input;
    setInput('');

    const enc = new TextEncoder();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    
    const ciphertextBuffer = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      secureKey,
      enc.encode(plaintext)
    );

    const ciphertextArray = new Uint8Array(ciphertextBuffer);
    const base64Cipher = btoa(String.fromCharCode(... ciphertextArray));
    const base64IV = btoa(String.fromCharCode(... iv));

    const newMessage: ChatMessage = {
      id: Date.now(). toString(),
      sender: 'Alice',
      decryptedContent: plaintext,
      encryptedContent: base64Cipher,
      iv: base64IV,
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, newMessage]);

    socketSim.log('CLIENT', '发送加密消息', 'DATA', `IV: ${base64IV.substring(0,6)}... Payload: ${base64Cipher.substring(0,10)}...`);
    socketSim. send({
        type: 'CHAT_MESSAGE',
        content: base64Cipher,
        iv: base64IV
    });
  };

  const decryptIncomingMessage = async (data: any) => {
      if (!secureKey) return;
      try {
        const iv = Uint8Array.from(atob(data.iv), c => c. charCodeAt(0));
        const ciphertext = Uint8Array.from(atob(data. content), c => c.charCodeAt(0));

        const decryptedBuffer = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv },
            secureKey,
            ciphertext
        );
        
        const dec = new TextDecoder();
        const plaintext = dec.decode(decryptedBuffer);

        const msg: ChatMessage = {
            id: Date.now().toString(),
            sender: 'Bob',
            decryptedContent: plaintext,
            encryptedContent: data.content,
            iv: data. iv,
            timestamp: Date.now()
        };
        setMessages(prev => [...prev, msg]);

      } catch (e) {
          socketSim.log('CLIENT', '解密消息失败', 'Error');
      }
  };

  // 手动清除日志
  const handleClearLogs = () => {
    setLogs([]);
    socketSim.log('CLIENT', '📋 日志已手动清除', 'INFO');
  };

  // 格式化下次清除时间
  const formatNextClearTime = () => {
    if (! nextClearTime) return '--:--';
    return nextClearTime.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-160px)]">
      <div className="lg:col-span-2 bg-cyber-800 rounded-lg border border-cyber-700 flex flex-col overflow-hidden shadow-2xl">
        <div className="p-4 bg-cyber-700 border-b border-cyber-600 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className="font-mono text-sm">状态: {connected ? (secureKey ? '安全连接 (AES-GCM)' : '协商密钥中... ') : '未连接'}</span>
          </div>
          {! connected && (
             <button onClick={connectToSocket} className="px-3 py-1 bg-cyber-accent text-cyber-900 text-xs font-bold rounded hover:bg-white transition-colors">连接服务器</button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-opacity-50 bg-cyber-900 relative" ref={scrollRef}>
            {! connected && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <p className="text-cyber-dim opacity-20 text-xl md:text-4xl font-bold uppercase">离线模式 (请连接服务器)</p>
                </div>
            )}
            {messages.map((msg) => (
            <div key={msg.id} className={`flex flex-col ${msg.sender === 'Alice' ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[80%] rounded-lg p-3 ${msg.sender === 'Alice' ? 'bg-cyber-500 text-white' : 'bg-cyber-700 text-cyber-text'}`}>
                    <p className="text-sm">{msg.decryptedContent}</p>
                </div>
                <div className="mt-1 text-[10px] text-cyber-dim font-mono max-w-[80%] break-all">
                    密文: {msg. encryptedContent. substring(0, 30)}...
                </div>
            </div>
            ))}
        </div>

        <div className="p-4 bg-cyber-800 border-t border-cyber-700">
            <div className="flex gap-2">
                <input
                    type="text"
                    disabled={! secureKey}
                    value={input}
                    onChange={(e) => setInput(e.target. value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    placeholder={secureKey ? "输入安全消息..." : "等待密钥协商... "}
                    className="flex-1 bg-cyber-900 border border-cyber-600 rounded px-4 py-2 text-sm focus:outline-none focus:border-cyber-accent transition-colors disabled:opacity-50 text-white"
                />
                <button 
                    disabled={!secureKey}
                    onClick={handleSend}
                    className="bg-cyber-accent text-cyber-900 px-6 py-2 rounded font-bold text-sm hover:bg-white disabled:opacity-50 transition-colors"
                >
                    发送
                </button>
            </div>
        </div>
      </div>

      <div className="lg:col-span-1 bg-black rounded-lg border border-cyber-700 flex flex-col overflow-hidden font-mono text-xs">
        <div className="p-2 bg-gray-900 border-b border-gray-800 text-gray-400 font-bold flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span>流量日志</span>
              <span className="text-gray-600">({logs.length}/{MAX_LOGS})</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-600 text-[10px]">
                下次清除: {formatNextClearTime()}
              </span>
              <button 
                onClick={handleClearLogs}
                className="px-2 py-0.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded text-[10px] transition-colors"
                title="手动清除日志"
              >
                清除
              </button>
            </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2" ref={logScrollRef}>
            {logs.length === 0 ? (
              <div className="text-gray-600 text-center py-4">暂无日志</div>
            ) : (
              logs.map((log) => (
                <div key={log. id} className="border-l-2 border-gray-700 pl-2 py-1">
                    <div className="flex gap-2 mb-1">
                        <span className="text-gray-500">[{log.timestamp}]</span>
                        <span className={`${log.sender === 'CLIENT' ? 'text-green-400' : 'text-blue-400'}`}>{log.sender === 'CLIENT' ?  'C' : 'S'}</span>
                        <span className={`uppercase font-bold ${
                            log.type === 'Handshake' ?  'text-yellow-500' : 
                            log.type === 'Error' ? 'text-red-500' :
                            log. type === 'WARN' ? 'text-orange-500' : 'text-gray-400'
                        }`}>{log.type}</span>
                    </div>
                    <div className="text-gray-300 break-words">{log.message}</div>
                    {log.details && <div className="mt-1 text-gray-600 bg-gray-900 p-1 rounded break-all">{log.details}</div>}
                </div>
              ))
            )}
        </div>
      </div>
    </div>
  );
};

export default SecureChat;
