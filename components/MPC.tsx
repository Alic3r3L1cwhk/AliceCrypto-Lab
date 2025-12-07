
import React, { useState, useEffect, useRef } from 'react';
import { splitSecret, recoverSecret, Share } from '../lib/shamir';
import { socketSim } from '../lib/socketSim';
import { SocketLog, KeyInfo } from '../types';

const formatCountdown = (seconds: number) => {
    const safe = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(safe / 60).toString().padStart(2, '0');
    const secs = (safe % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
};

const MPC: React.FC = () => {
    const [mode, setMode] = useState<'shamir' | 'compare'>('shamir');

    // Logs for Communication Layer
    const [logs, setLogs] = useState<SocketLog[]>([]);
    const logScrollRef = useRef<HTMLDivElement>(null);
    const [isSocketConnected, setIsSocketConnected] = useState(false);
    const [nodeKeyInfo, setNodeKeyInfo] = useState<KeyInfo | null>(null);
    const [rotationCountdown, setRotationCountdown] = useState(0);
    const [serverClock, setServerClock] = useState('---');

    // Shamir States
    const [secret, setSecret] = useState<number>(123);
    const [shares, setShares] = useState<Share[]>([]);
    const [recoveredSecret, setRecoveredSecret] = useState<number | null>(null);
    const [selectedShares, setSelectedShares] = useState<number[]>([]);

    // Millionaires States
    const [myWealth, setMyWealth] = useState<number>(0);
    const [compareResult, setCompareResult] = useState<string>('');
    const [isComparing, setIsComparing] = useState(false);
    const [serverSecretGenerated, setServerSecretGenerated] = useState(false);

    useEffect(() => {
        // Subscribe to socket logs
        const unsubLog = socketSim.subscribe((log) => {
            setLogs(prev => [...prev.slice(-19), log]); // Keep last 20 logs
            if (log.message.includes('WebSocket 连接成功')) {
                setIsSocketConnected(true);
            }
            if (log.message.includes('连接已断开')) {
                setIsSocketConnected(false);
                setServerSecretGenerated(false);
                setServerClock('---');
            }
            if (log.message.includes('连接失败')) {
                setIsSocketConnected(false);
                setServerClock('---');
            }
        });

        const handler = (data: any) => {
            if (data.type === 'MPC_SECRET_GENERATED') {
                setServerSecretGenerated(true);
                socketSim.log('SERVER', 'Bob 已生成秘密数值 (B)', 'INFO');
            }
            if (data.type === 'MPC_COMPARE_RESULT') {
                setIsComparing(false);
                setCompareResult(data.result);
                socketSim.log('SERVER', `协议结束，返回结果: ${data.result}`, 'DATA');
            }
            if (data.type === 'SERVER_TIME') {
                if (typeof data.timestamp === 'number') {
                    setServerClock(new Date(data.timestamp * 1000).toLocaleString());
                } else if (data.time) {
                    setServerClock(data.time);
                }
                if (data.keys?.PAILLIER?.key_info) {
                    setNodeKeyInfo(data.keys.PAILLIER.key_info);
                }
            }
            if (data.type === 'KEY_ROTATED' || data.type === 'KEY_STATUS') {
                const bundle = data.keys?.PAILLIER;
                if (bundle?.key_info) {
                    setNodeKeyInfo(bundle.key_info);
                }
                if (data.type === 'KEY_ROTATED' && typeof data.timestamp === 'number') {
                    setServerClock(new Date(data.timestamp * 1000).toLocaleString());
                    socketSim.log('SERVER', 'Paillier 密钥完成轮换', 'WARN');
                }
            }
        };

        socketSim.onMessage(handler);
        // Ensure connected for logs
        socketSim.connect().then(() => setIsSocketConnected(true)).catch(() => {
            setIsSocketConnected(false);
        });

        return () => {
            unsubLog();
            socketSim.clearMessageHandlers();
        };
    }, []);

    useEffect(() => {
        if (logScrollRef.current) logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
    }, [logs]);

    useEffect(() => {
        if (!isSocketConnected) return;
        socketSim.send({ type: 'GET_SERVER_TIME' });
        const timer = setInterval(() => socketSim.send({ type: 'GET_SERVER_TIME' }), 20000);
        return () => clearInterval(timer);
    }, [isSocketConnected]);

    useEffect(() => {
        if (!nodeKeyInfo) return;
        setRotationCountdown(nodeKeyInfo.remaining_seconds);
        const timer = setInterval(() => {
            setRotationCountdown(prev => (prev > 0 ? prev - 1 : 0));
        }, 1000);
        return () => clearInterval(timer);
    }, [nodeKeyInfo]);

    // --- Shamir Logic ---
    const handleSplit = () => {
        const generated = splitSecret(secret, 5, 3);
        setShares(generated);
        setRecoveredSecret(null);
        setSelectedShares([]);
        socketSim.log('CLIENT', `[本地计算] 秘密 ${secret} 已拆分为 5 个碎片`, 'INFO');
    };

    const handleRecover = () => {
        const sharesToUse = shares.filter(s => selectedShares.includes(s.x));
        const rec = recoverSecret(sharesToUse);
        setRecoveredSecret(rec);
        socketSim.log('CLIENT', `[本地计算] 使用 ${sharesToUse.length} 个碎片重构秘密: ${rec}`, 'INFO');
    };

    // --- Millionaires Logic ---
    const generateServerSecret = () => {
        if (!isSocketConnected) {
            socketSim.log('CLIENT', '尚未连接到服务器，无法生成秘密', 'Error');
            return;
        }
        setServerSecretGenerated(false);
        socketSim.send({ type: 'MPC_GENERATE_SECRET' });
        socketSim.log('CLIENT', '发送指令: 生成 Bob 秘密', 'DATA');
    };

    const startCompare = () => {
        if (!isSocketConnected) {
            socketSim.log('CLIENT', '服务器未连接，无法执行协议', 'Error');
            return;
        }
        if (!serverSecretGenerated) return;
        if (!Number.isFinite(myWealth)) {
            socketSim.log('CLIENT', '请输入合法的资产数值', 'Error');
            return;
        }
        setIsComparing(true);
        setCompareResult('');
        socketSim.log('CLIENT', `启动安全比对协议 (输入 A=${myWealth})`, 'Handshake');
        socketSim.send({ type: 'MPC_COMPARE_INIT', value: myWealth });
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-140px)]">

            {/* 左侧操作区 */}
            <div className="lg:col-span-2 flex flex-col gap-6 overflow-y-auto pr-2">
                <div className="flex gap-4 border-b border-cyber-700 pb-4">
                    <button
                        onClick={() => setMode('shamir')}
                        className={`px-4 py-2 rounded font-bold transition-colors ${mode === 'shamir' ? 'bg-cyber-purple text-cyber-900' : 'text-gray-400 hover:text-white'}`}
                    >
                        Shamir 秘密分享
                    </button>
                    <button
                        onClick={() => setMode('compare')}
                        className={`px-4 py-2 rounded font-bold transition-colors ${mode === 'compare' ? 'bg-cyber-purple text-cyber-900' : 'text-gray-400 hover:text-white'}`}
                    >
                        百万富翁问题 (MPC)
                    </button>
                </div>

                {mode === 'shamir' && (
                    <div className="space-y-6">
                        <div className="bg-cyber-800 p-6 rounded border border-cyber-700">
                            <h3 className="text-white font-bold mb-4">秘密分割 (Split)</h3>
                            <div className="flex gap-4">
                                <input type="number" value={secret} onChange={e => setSecret(parseInt(e.target.value))} className="bg-cyber-900 border border-cyber-600 rounded px-3 py-2 text-white" placeholder="Secret" />
                                <button onClick={handleSplit} className="bg-cyber-purple text-cyber-900 px-4 py-2 rounded font-bold">生成碎片 (n=5, t=3)</button>
                            </div>
                        </div>
                        <div className="bg-cyber-800 p-6 rounded border border-cyber-700">
                            <h3 className="text-white font-bold mb-4">秘密重构 (Reconstruct)</h3>
                            <div className="grid grid-cols-3 gap-2 mb-4">
                                {shares.map((s) => (
                                    <div
                                        key={s.x}
                                        onClick={() => {
                                            if (selectedShares.includes(s.x)) setSelectedShares(prev => prev.filter(x => x !== s.x));
                                            else setSelectedShares(prev => [...prev, s.x]);
                                        }}
                                        className={`p-2 rounded cursor-pointer border text-center ${selectedShares.includes(s.x) ? 'bg-cyber-purple/20 border-cyber-purple text-white' : 'bg-cyber-900 border-cyber-700 text-gray-500'}`}
                                    >
                                        Share #{s.x}
                                    </div>
                                ))}
                            </div>
                            <button onClick={handleRecover} disabled={selectedShares.length < 3} className="w-full bg-cyber-600 disabled:opacity-50 text-white py-2 rounded">重构 (需3个碎片)</button>
                            {recoveredSecret !== null && (
                                <div className="mt-4 text-center text-2xl font-mono text-green-400 font-bold">{recoveredSecret}</div>
                            )}
                        </div>
                    </div>
                )}

                {mode === 'compare' && (
                    <div className="bg-cyber-800 p-8 rounded border border-cyber-700 text-center">
                        <h3 className="text-xl font-bold text-white mb-6">安全比对协议</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 text-left text-xs font-mono">
                            <div className="bg-black/30 border border-white/5 rounded p-4">
                                <div className="text-gray-400 uppercase mb-2">Server Clock</div>
                                <div className="text-white text-lg mb-2">{serverClock}</div>
                                <div className="text-gray-500">状态: <span className={isSocketConnected ? 'text-green-400' : 'text-red-500'}>{isSocketConnected ? '在线' : '离线'}</span></div>
                            </div>
                            <div className="bg-black/30 border border-white/5 rounded p-4">
                                <div className="text-gray-400 uppercase mb-2">Key Rotation</div>
                                <div className="text-gray-500 mb-1">下一轮换: <span className="text-white">{nodeKeyInfo?.next_rotation_at || '--'}</span></div>
                                <div className="text-gray-500 mb-1">剩余: <span className="text-green-400 font-bold">{formatCountdown(rotationCountdown)}</span></div>
                                <div className="text-gray-500">操作: <span className="text-cyber-accent">{nodeKeyInfo?.operation || '--'}</span></div>
                            </div>
                        </div>

                        <div className="flex justify-between items-center mb-8">
                            <div className="w-1/3">
                                <div className="text-cyber-accent font-bold mb-2">Alice (Local)</div>
                                <input type="number" value={myWealth} onChange={e => setMyWealth(parseInt(e.target.value))} className="w-full bg-cyber-900 border border-cyber-600 p-2 rounded text-center text-white" />
                            </div>
                            <div className="flex-1 border-t border-dashed border-gray-600 mx-4"></div>
                            <div className="w-1/3">
                                <div className="text-cyber-purple font-bold mb-2">Bob (Server)</div>
                                {serverSecretGenerated ?
                                    <div className="text-green-500 text-xs font-mono">[Secret Ready]</div> :
                                    <button onClick={generateServerSecret} disabled={!isSocketConnected} className="bg-cyber-600 text-white text-xs px-3 py-1 rounded disabled:opacity-40">生成秘密</button>
                                }
                            </div>
                        </div>

                        <button
                            onClick={startCompare}
                            disabled={!serverSecretGenerated || isComparing || !isSocketConnected}
                            className="bg-gradient-to-r from-cyber-accent to-cyber-purple text-cyber-900 font-bold px-8 py-3 rounded-full shadow-lg disabled:opacity-50"
                        >
                            {isComparing ? '协议执行中...' : '开始安全比对'}
                        </button>

                        {compareResult && (
                            <div className="mt-8 p-4 bg-black/40 rounded border border-white/10 animate-pulse">
                                <div className="text-2xl font-bold text-white">{compareResult}</div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* 右侧通信日志 (传输层) */}
            <div className="lg:col-span-1 bg-black rounded-lg border border-cyber-700 flex flex-col overflow-hidden">
                <div className="p-3 bg-gray-900 border-b border-gray-800 text-gray-400 font-bold text-xs flex justify-between">
                    <span>传输层日志 (Socket Layer)</span>
                    <div className="flex items-center gap-1">
                        <span className={`w-2 h-2 rounded-full ${isSocketConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
                        <span className="text-[10px]">{isSocketConnected ? 'CONNECTED' : 'OFFLINE'}</span>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-[10px]" ref={logScrollRef}>
                    {logs.map((log) => (
                        <div key={log.id} className="border-l-2 border-gray-700 pl-2">
                            <div className="flex gap-2 mb-1">
                                <span className="text-gray-600">{log.timestamp}</span>
                                <span className={`${log.sender === 'CLIENT' ? 'text-cyber-accent' : 'text-cyber-purple'}`}>{log.sender}</span>
                                <span className="text-gray-400">[{log.type}]</span>
                            </div>
                            <div className="text-gray-300 break-all">{log.message}</div>
                        </div>
                    ))}
                    {logs.length === 0 && <div className="text-gray-700 text-center mt-10">等待通信数据...</div>}
                </div>
            </div>
        </div>
    );
};

export default MPC;
