import React, { useState, useEffect } from 'react';
import { splitSecret, recoverSecret, Share } from './lib/shamir';
import { socketSim } from './lib/socketSim';

const MPC: React.FC = () => {
    const [mode, setMode] = useState<'shamir' | 'compare'>('shamir');

    // Shamir States
    const [secret, setSecret] = useState<number>(123);
    const [partsN, setPartsN] = useState<number>(5);
    const [thresholdT, setThresholdT] = useState<number>(3);
    const [shares, setShares] = useState<Share[]>([]);
    const [recoveredSecret, setRecoveredSecret] = useState<number | null>(null);
    const [selectedShares, setSelectedShares] = useState<number[]>([]);

    // Millionaires States
    const [myWealth, setMyWealth] = useState<number>(0);
    const [compareResult, setCompareResult] = useState<string>('');
    const [isComparing, setIsComparing] = useState(false);
    const [serverSecretGenerated, setServerSecretGenerated] = useState(false);

    useEffect(() => {
        const handler = (data: any) => {
            if (data.type === 'MPC_SECRET_GENERATED') {
                setServerSecretGenerated(true);
                socketSim.log('SERVER', 'Bob (服务器) 已生成隐私数值', 'INFO');
            }
            if (data.type === 'MPC_COMPARE_RESULT') {
                setIsComparing(false);
                setCompareResult(data.result); // "Alice is Richer" or "Bob is Richer"
                socketSim.log('SERVER', '收到安全比对结果', 'DATA');
            }
        };
        socketSim.onMessage(handler);
        return () => socketSim.clearMessageHandlers();
    }, []);

    // --- Shamir Logic ---
    const handleSplit = () => {
        const generated = splitSecret(secret, partsN, thresholdT);
        setShares(generated);
        setRecoveredSecret(null);
        setSelectedShares([]);
        socketSim.log('CLIENT', `秘密已拆分为 ${partsN} 份 (门限: ${thresholdT})`, 'INFO');
    };

    const toggleShare = (x: number) => {
        if (selectedShares.includes(x)) {
            setSelectedShares(prev => prev.filter(s => s !== x));
        } else {
            setSelectedShares(prev => [...prev, x]);
        }
    };

    const handleRecover = () => {
        const sharesToUse = shares.filter(s => selectedShares.includes(s.x));
        if (sharesToUse.length < thresholdT) {
            alert(`至少需要 ${thresholdT} 个碎片才能恢复!`);
            return;
        }
        const rec = recoverSecret(sharesToUse);
        setRecoveredSecret(rec);
        socketSim.log('CLIENT', `秘密已恢复: ${rec}`, 'INFO');
    };

    // --- Millionaires Logic ---
    const generateServerSecret = () => {
        socketSim.connect();
        socketSim.send({ type: 'MPC_GENERATE_SECRET' });
    };

    const startCompare = () => {
        if (!serverSecretGenerated) return;
        setIsComparing(true);
        setCompareResult('');
        // Protocol: 
        // 1. Client encrypts Wealth -> E(a)
        // 2. Client sends E(a) to Server
        // 3. Server computes E(a) - E(b) = E(a-b)
        // 4. Server decrypts (a-b) internally (in a real MPC, this step is split)
        // 5. Server returns sign(a-b)
        socketSim.send({ type: 'MPC_COMPARE_INIT', value: myWealth });
        socketSim.log('CLIENT', '正在初始化安全比对协议...', 'DATA');
    };

    return (
        <div className="space-y-6">
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
                    百万富翁问题 (仿真)
                </button>
            </div>

            {mode === 'shamir' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-cyber-800 p-6 rounded border border-cyber-700">
                        <h3 className="text-white font-bold mb-4">1. 拆分秘密</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs text-gray-400 block mb-1">秘密值 (整数)</label>
                                <input type="number" value={secret} onChange={e => setSecret(parseInt(e.target.value))} className="w-full bg-cyber-900 border border-cyber-600 rounded px-3 py-2 text-white" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">总份数 (n)</label>
                                    <input type="number" value={partsN} onChange={e => setPartsN(parseInt(e.target.value))} className="w-full bg-cyber-900 border border-cyber-600 rounded px-3 py-2 text-white" />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">恢复门限 (t)</label>
                                    <input type="number" value={thresholdT} onChange={e => setThresholdT(parseInt(e.target.value))} className="w-full bg-cyber-900 border border-cyber-600 rounded px-3 py-2 text-white" />
                                </div>
                            </div>
                            <button onClick={handleSplit} className="w-full bg-cyber-purple text-cyber-900 font-bold py-2 rounded hover:bg-white transition-colors">
                                生成碎片
                            </button>
                        </div>
                    </div>

                    <div className="bg-cyber-800 p-6 rounded border border-cyber-700">
                        <h3 className="text-white font-bold mb-4">2. 恢复秘密</h3>
                        <div className="space-y-4">
                            <div className="text-sm text-gray-400">至少选择 {thresholdT} 个碎片进行恢复:</div>
                            <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                                {shares.map((s) => (
                                    <div
                                        key={s.x}
                                        onClick={() => toggleShare(s.x)}
                                        className={`p-2 rounded cursor-pointer border ${selectedShares.includes(s.x) ? 'bg-cyber-purple/20 border-cyber-purple text-white' : 'bg-cyber-900 border-cyber-700 text-gray-500'}`}
                                    >
                                        <div className="text-xs font-mono">碎片 #{s.x}</div>
                                        <div className="text-xs truncate">{s.y}</div>
                                    </div>
                                ))}
                            </div>
                            <button onClick={handleRecover} disabled={selectedShares.length < thresholdT} className="w-full bg-cyber-600 disabled:opacity-50 text-white font-bold py-2 rounded hover:bg-cyber-500 transition-colors">
                                重构秘密
                            </button>
                            {recoveredSecret !== null && (
                                <div className="p-4 bg-green-900/30 border border-green-500/50 rounded text-center">
                                    <div className="text-xs text-green-400 uppercase">恢复结果</div>
                                    <div className="text-2xl font-mono text-white">{recoveredSecret}</div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {mode === 'compare' && (
                <div className="bg-cyber-800 p-8 rounded border border-cyber-700 max-w-2xl mx-auto">
                    <h3 className="text-xl font-bold text-white mb-2 text-center">安全比对协议 (Secure Comparison)</h3>
                    <p className="text-gray-400 text-sm text-center mb-8">比较 Alice (x) 和 Bob (y) 的大小，且不泄露具体数值。</p>

                    <div className="flex justify-between items-center mb-8 relative">
                        {/* Alice */}
                        <div className="text-center w-1/3">
                            <div className="text-cyber-accent font-bold mb-2">Alice (你)</div>
                            <input
                                type="number"
                                placeholder="数值 A"
                                value={myWealth}
                                onChange={e => setMyWealth(parseInt(e.target.value))}
                                className="w-full bg-cyber-900 border border-cyber-600 p-2 rounded text-center text-white"
                            />
                        </div>

                        {/* Connector */}
                        <div className="flex-1 border-t border-dashed border-gray-600 relative top-2 mx-4"></div>

                        {/* Bob */}
                        <div className="text-center w-1/3">
                            <div className="text-cyber-purple font-bold mb-2">Bob (服务器)</div>
                            {serverSecretGenerated ? (
                                <div className="bg-cyber-900 border border-green-500 p-2 rounded text-green-500 text-xs font-mono">
                                    [已生成 B]
                                </div>
                            ) : (
                                <button onClick={generateServerSecret} className="bg-cyber-600 hover:bg-cyber-500 text-white text-xs px-3 py-2 rounded">
                                    生成 B
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="text-center">
                        <button
                            onClick={startCompare}
                            disabled={!serverSecretGenerated || isComparing}
                            className="bg-gradient-to-r from-cyber-accent to-cyber-purple text-cyber-900 font-bold px-8 py-3 rounded-full shadow-lg hover:scale-105 transition-transform disabled:opacity-50 disabled:scale-100"
                        >
                            {isComparing ? '计算 E(a-b) 中...' : '开始安全比对'}
                        </button>
                    </div>

                    {compareResult && (
                        <div className="mt-8 p-4 bg-black/40 rounded border border-white/10 text-center animate-pulse">
                            <div className="text-gray-500 text-xs uppercase mb-1">协议输出</div>
                            <div className="text-2xl font-bold text-white">{compareResult}</div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default MPC;