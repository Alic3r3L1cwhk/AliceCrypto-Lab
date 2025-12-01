import React, { useState, useEffect, useRef } from 'react';
import { socketSim } from './lib/socketSim';
import { SocketLog, ChatMessage } from '../types';
import { CryptoPolyfill } from './lib/cryptoPolyfill';

const MAX_LOGS = 30;

const SecureChat: React.FC = () => {
    const [logs, setLogs] = useState<SocketLog[]>([]);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [connected, setConnected] = useState(false);

    // 原生 WebCrypto 对象
    const [nativeKeyPair, setNativeKeyPair] = useState<CryptoKeyPair | null>(null);
    const [nativeSecureKey, setNativeSecureKey] = useState<CryptoKey | null>(null);

    // Polyfill 对象 (用于 HTTP 降级)
    const [polyfill, setPolyfill] = useState<CryptoPolyfill | null>(null);
    const [usingPolyfill, setUsingPolyfill] = useState(false);

    const scrollRef = useRef<HTMLDivElement>(null);
    const logScrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (logScrollRef.current) logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
    }, [logs]);

    useEffect(() => {
        const unsubLog = socketSim.subscribe((log) => {
            setLogs(prev => {
                const newLogs = [...prev, log];
                return newLogs.slice(-MAX_LOGS);
            });
        });

        socketSim.onMessage(async (data) => {
            if (data.type === 'HANDSHAKE_REPLY') {
                socketSim.log('SERVER', '收到服务端公钥', 'Handshake', data.publicKey.substring(0, 20) + '...');
                await completeHandshake(data.publicKey);
            } else if (data.type === 'CHAT_REPLY') {
                socketSim.log('SERVER', '收到加密回复', 'DATA', data.content.substring(0, 15) + '...');
                await decryptIncomingMessage(data);
            }
        });

        return () => unsubLog();
    }, [nativeKeyPair, polyfill]);

    const connectToSocket = async () => {
        try {
            await socketSim.connect();
            setConnected(true);
            await performKeyExchangeInit();
        } catch (e) {
            setConnected(false);
        }
    };

    const performKeyExchangeInit = async () => {
        // 尝试使用原生 WebCrypto
        if (window.crypto && window.crypto.subtle) {
            try {
                const kp = await window.crypto.subtle.generateKey(
                    { name: "ECDH", namedCurve: "P-256" },
                    true,
                    ["deriveKey"]
                );
                setNativeKeyPair(kp);
                const exportedKey = await window.crypto.subtle.exportKey("spki", kp.publicKey);
                const b64Key = btoa(String.fromCharCode(...new Uint8Array(exportedKey)));

                socketSim.log('CLIENT', 'ECDH 密钥对已生成 (原生)', 'Handshake', b64Key.substring(0, 15) + '...');
                socketSim.send({ type: 'HANDSHAKE_INIT', publicKey: b64Key });
                return;
            } catch (e) {
                console.warn("Native crypto failed, falling back to polyfill", e);
            }
        }

        // 降级方案
        setUsingPolyfill(true);
        const pf = new CryptoPolyfill();
        setPolyfill(pf);
        const pubKey = await pf.exportPublicKey();

        socketSim.log('CLIENT', '⚠️ 浏览器限制: 已启用软件模拟加密', 'WARN');
        socketSim.log('CLIENT', 'Polyfill 密钥对已生成', 'Handshake');
        socketSim.send({ type: 'HANDSHAKE_INIT', publicKey: pubKey });
    };

    const completeHandshake = async (serverPubB64: string) => {
        try {
            if (usingPolyfill && polyfill) {
                // Polyfill 握手
                const success = await polyfill.deriveKey(serverPubB64);
                if (success) {
                    socketSim.log('CLIENT', '握手完成 (Polyfill)', 'Handshake');
                    socketSim.log('CLIENT', '安全通道已建立 (模拟 AES)', 'INFO');
                } else {
                    throw new Error("Polyfill derivation failed");
                }
            } else if (nativeKeyPair) {
                // 原生握手
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

                const sharedBits = await window.crypto.subtle.deriveBits(
                    { name: "ECDH", public: serverKey },
                    nativeKeyPair.privateKey,
                    256
                );

                const material = await window.crypto.subtle.importKey(
                    "raw", sharedBits, { name: "HKDF" }, false, ["deriveKey"]
                );

                const aesKey = await window.crypto.subtle.deriveKey(
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

                setNativeSecureKey(aesKey);
                socketSim.log('CLIENT', '握手完成 (原生 ECDH)', 'Handshake');
                socketSim.log('CLIENT', '安全通道已建立 (AES-GCM-256)', 'INFO');
            }
        } catch (err: any) {
            console.error(err);
            const errorMessage = err instanceof Error ? err.message : String(err);
            socketSim.log('CLIENT', '握手失败: ' + errorMessage, 'Error');
        }
    };

    const handleSend = async () => {
        if (!input.trim()) return;

        let base64Cipher = '';
        let base64IV = '';
        const plaintext = input;
        setInput('');

        try {
            if (usingPolyfill && polyfill) {
                const result = await polyfill.encrypt(plaintext);
                base64Cipher = result.ciphertext;
                base64IV = result.iv;
            } else if (nativeSecureKey) {
                const enc = new TextEncoder();
                const iv = window.crypto.getRandomValues(new Uint8Array(12));
                const ciphertextBuffer = await window.crypto.subtle.encrypt(
                    { name: "AES-GCM", iv: iv },
                    nativeSecureKey,
                    enc.encode(plaintext)
                );
                base64Cipher = btoa(String.fromCharCode(...new Uint8Array(ciphertextBuffer)));
                base64IV = btoa(String.fromCharCode(...iv));
            } else {
                return;
            }

            const newMessage: ChatMessage = {
                id: Date.now().toString(),
                sender: 'Alice',
                decryptedContent: plaintext,
                encryptedContent: base64Cipher,
                iv: base64IV,
                timestamp: Date.now()
            };
            setMessages(prev => [...prev, newMessage]);

            socketSim.log('CLIENT', '发送加密载荷', 'DATA', `IV: ${base64IV.substring(0, 6)}...`);
            socketSim.send({
                type: 'CHAT_MESSAGE',
                content: base64Cipher,
                iv: base64IV
            });

        } catch (e) {
            socketSim.log('CLIENT', '加密失败', 'Error');
        }
    };

    const decryptIncomingMessage = async (data: any) => {
        try {
            let plaintext = '';

            if (usingPolyfill && polyfill) {
                plaintext = await polyfill.decrypt(data.content, data.iv);
            } else if (nativeSecureKey) {
                const iv = Uint8Array.from(atob(data.iv), c => c.charCodeAt(0));
                const ciphertext = Uint8Array.from(atob(data.content), c => c.charCodeAt(0));
                const decryptedBuffer = await window.crypto.subtle.decrypt(
                    { name: "AES-GCM", iv: iv },
                    nativeSecureKey,
                    ciphertext
                );
                plaintext = new TextDecoder().decode(decryptedBuffer);
            }

            const msg: ChatMessage = {
                id: Date.now().toString(),
                sender: 'Bob',
                decryptedContent: plaintext,
                encryptedContent: data.content,
                iv: data.iv,
                timestamp: Date.now()
            };
            setMessages(prev => [...prev, msg]);

        } catch (e) {
            socketSim.log('CLIENT', '解密失败', 'Error');
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-160px)]">
            <div className="lg:col-span-2 bg-cyber-800 rounded-lg border border-cyber-700 flex flex-col overflow-hidden shadow-2xl">
                <div className="p-4 bg-cyber-700 border-b border-cyber-600 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                        <span className="font-mono text-sm">
                            {connected
                                ? (nativeSecureKey || (usingPolyfill && polyfill)
                                    ? (usingPolyfill ? '安全连接 (软件模拟)' : '安全连接 (AES-GCM)')
                                    : '协商密钥中...')
                                : '未连接'}
                        </span>
                    </div>
                    {!connected && (
                        <button onClick={connectToSocket} className="px-3 py-1 bg-cyber-accent text-cyber-900 text-xs font-bold rounded hover:bg-white transition-colors">连接服务器</button>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-opacity-50 bg-cyber-900 relative" ref={scrollRef}>
                    {!connected && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <p className="text-cyber-dim opacity-20 text-xl md:text-4xl font-bold uppercase">离线模式</p>
                        </div>
                    )}
                    {messages.map((msg) => (
                        <div key={msg.id} className={`flex flex-col ${msg.sender === 'Alice' ? 'items-end' : 'items-start'}`}>
                            <div className={`max-w-[80%] rounded-lg p-3 ${msg.sender === 'Alice' ? 'bg-cyber-500 text-white' : 'bg-cyber-700 text-cyber-text'}`}>
                                <p className="text-sm">{msg.decryptedContent}</p>
                            </div>
                            <div className="mt-1 text-[10px] text-cyber-dim font-mono max-w-[80%] break-all">
                                密文: {msg.encryptedContent.substring(0, 30)}...
                            </div>
                        </div>
                    ))}
                </div>

                <div className="p-4 bg-cyber-800 border-t border-cyber-700">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                            placeholder="输入消息..."
                            className="flex-1 bg-cyber-900 border border-cyber-600 rounded px-4 py-2 text-sm focus:outline-none focus:border-cyber-accent transition-colors disabled:opacity-50 text-white"
                        />
                        <button
                            onClick={handleSend}
                            className="bg-cyber-accent text-cyber-900 px-6 py-2 rounded font-bold text-sm hover:bg-white transition-colors"
                        >
                            发送
                        </button>
                    </div>
                </div>
            </div>

            <div className="lg:col-span-1 bg-black rounded-lg border border-cyber-700 flex flex-col overflow-hidden font-mono text-xs">
                <div className="p-2 bg-gray-900 border-b border-gray-800 text-gray-400 font-bold flex justify-between items-center">
                    <span>流量日志</span>
                    <button onClick={() => setLogs([])} className="text-[10px] hover:text-white">清空</button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2" ref={logScrollRef}>
                    {logs.map((log) => (
                        <div key={log.id} className="border-l-2 border-gray-700 pl-2 py-1">
                            <div className="flex gap-2 mb-1">
                                <span className="text-gray-500">[{log.timestamp}]</span>
                                <span className={`${log.sender === 'CLIENT' ? 'text-green-400' : 'text-blue-400'}`}>{log.sender === 'CLIENT' ? 'C' : 'S'}</span>
                                <span className={`uppercase font-bold ${log.type === 'Error' ? 'text-red-500' : 'text-gray-400'}`}>{log.type}</span>
                            </div>
                            <div className="text-gray-300 break-words">{log.message}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default SecureChat;