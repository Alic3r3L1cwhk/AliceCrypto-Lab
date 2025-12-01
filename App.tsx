
import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import FHE from './components/FHE';
import MPC from './components/MPC';
import Login from './components/Login';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'fhe' | 'mpc'>('mpc');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ username: string; token: string } | null>(null);

  // 初始化时检查是否已登录
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    const username = localStorage.getItem('username');
    if (token && username) {
      setIsLoggedIn(true);
      setCurrentUser({ username, token });
    }
  }, []);

  const handleLoginSuccess = (token: string, username: string) => {
    // 保存到本地存储
    localStorage.setItem('auth_token', token);
    localStorage.setItem('username', username);
    
    // 更新应用状态
    setIsLoggedIn(true);
    setCurrentUser({ username, token });
  };

  const handleLogout = () => {
    // 清除本地存储
    localStorage.removeItem('auth_token');
    localStorage.removeItem('username');
    
    // 重置应用状态
    setIsLoggedIn(false);
    setCurrentUser(null);
    setActiveTab('mpc');
  };

  // 如果未登录，显示登录界面
  if (!isLoggedIn) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <Layout 
      activeTab={activeTab} 
      onTabChange={setActiveTab}
      currentUser={currentUser}
      onLogout={handleLogout}
    >
      {activeTab === 'fhe' && <FHE />}
      {activeTab === 'mpc' && <MPC />}
    </Layout>
  );
};

export default App;
