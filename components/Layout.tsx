
import React from 'react';
import { LogOut, User } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: 'fhe' | 'mpc';
  onTabChange: (tab: 'fhe' | 'mpc') => void;
  currentUser?: { username: string; token: string } | null;
  onLogout?: () => void;
}

const Layout: React.FC<LayoutProps> = ({ 
  children, 
  activeTab, 
  onTabChange,
  currentUser,
  onLogout
}) => {
  return (
    <div className="min-h-screen bg-cyber-900 text-cyber-text font-sans flex flex-col md:flex-row">
      {/* 侧边栏 */}
      <aside className="w-full md:w-64 bg-cyber-800 border-r border-cyber-700 flex-shrink-0">
        <div className="p-6 border-b border-cyber-700">
          <h1 className="text-xl font-bold text-cyber-accent tracking-tighter italic">
            AliceCrypto <span className="text-white not-italic text-sm bg-cyber-700 px-1 rounded">v2.2</span>
          </h1>
          <p className="text-xs text-cyber-dim mt-2">安全多方计算实验平台</p>
        </div>
        
        <nav className="p-4 space-y-2">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 pl-2">核心模块</div>

          <button
            onClick={() => onTabChange('mpc')}
            className={`w-full text-left px-4 py-3 rounded-md transition-all duration-200 flex items-center gap-3 ${
              activeTab === 'mpc' 
                ? 'bg-cyber-500 text-cyber-purple border-l-4 border-cyber-purple' 
                : 'hover:bg-cyber-700 text-cyber-dim'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <div>
              <div className="font-semibold">MPC 多方计算</div>
              <div className="text-[10px] opacity-70">隐私比对 / WebSocket传输</div>
            </div>
          </button>

          <button
            onClick={() => onTabChange('fhe')}
            className={`w-full text-left px-4 py-3 rounded-md transition-all duration-200 flex items-center gap-3 ${
              activeTab === 'fhe' 
                ? 'bg-cyber-500 text-green-400 border-l-4 border-green-400' 
                : 'hover:bg-cyber-700 text-cyber-dim'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <div>
              <div className="font-semibold">FHE 同态引擎</div>
              <div className="text-[10px] opacity-70">Paillier (加) / RSA (乘)</div>
            </div>
          </button>
        </nav>

        <div className="p-6 mt-auto space-y-4">
          {/* 用户信息面板 */}
          {currentUser && (
            <div className="bg-cyber-700 rounded p-4 text-xs border border-cyber-500 bg-opacity-40 backdrop-blur">
              <div className="flex items-center gap-2 mb-3">
                <User className="h-4 w-4 text-cyber-accent" />
                <span className="text-cyber-accent font-bold uppercase">用户信息</span>
              </div>
              <div className="mb-3">
                <div className="text-cyber-dim text-[10px]">账号</div>
                <div className="text-cyber-text font-mono break-words">{currentUser.username}</div>
              </div>
              <button
                onClick={onLogout}
                className="w-full bg-red-900/30 hover:bg-red-900/50 border border-red-500/50 text-red-400 hover:text-red-300 rounded px-2 py-1 text-[11px] font-semibold transition flex items-center justify-center gap-1"
              >
                <LogOut className="h-3 w-3" />
                登出
              </button>
            </div>
          )}

          {/* 系统状态面板 */}
          <div className="bg-cyber-700 rounded p-4 text-xs border border-cyber-500 bg-opacity-40 backdrop-blur">
            <h3 className="text-cyber-accent font-bold mb-2 uppercase">系统状态</h3>
            <div className="flex justify-between mb-1">
              <span>协议:</span>
              <span className="text-green-400 font-mono">MPC / FHE</span>
            </div>
            <div className="flex justify-between mb-1">
              <span>后端:</span>
              <span className="text-blue-400 font-mono">Python 3.10</span>
            </div>
            <div className="flex justify-between">
              <span>认证:</span>
              <span className="text-yellow-400 font-mono">SQLite</span>
            </div>
          </div>
        </div>
      </aside>

      {/* 主内容区域 */}
      <main className="flex-1 overflow-auto bg-cyber-900 p-4 md:p-8">
        <header className="mb-8 flex justify-between items-center border-b border-cyber-700 pb-4">
          <div>
            <h2 className="text-3xl font-bold text-white flex items-center gap-3">
              {activeTab === 'mpc' && 'MPC: 安全多方计算平台'}
              {activeTab === 'fhe' && 'FHE: 全同态加密引擎'}
              <span className="text-xs bg-cyber-700 text-cyber-accent px-2 py-0.5 rounded border border-cyber-600">v2.2</span>
            </h2>
            <p className="text-cyber-dim mt-1 font-mono text-sm">
              {activeTab === 'mpc' && '> 集成 WebSocket 通信层的多方安全比对协议'}
              {activeTab === 'fhe' && '> 支持加法同态 (Paillier) 与乘法同态 (RSA)，自动 5 分钟密钥轮换'}
            </p>
          </div>
          <div className="hidden md:flex items-center space-x-2 bg-cyber-800 px-3 py-1 rounded-full border border-cyber-700">
            <span className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></span>
            <span className="text-xs font-mono text-green-500">Node 在线</span>
          </div>
        </header>
        
        {children}
      </main>
    </div>
  );
};

export default Layout;
