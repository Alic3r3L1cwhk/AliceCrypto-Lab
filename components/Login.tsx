// Login.tsx - 更新版本
import React, { useState } from 'react';
import { Eye, EyeOff, Lock, Mail, User } from 'lucide-react';
import { getHttpUrl } from '../config';  // 改为上一级目录

interface LoginProps {
  onLoginSuccess: (token: string, username: string) => void;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [isLogin, setIsLogin] = useState(true); // true: 登录模式，false: 注册模式
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // 处理表单提交
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (isLogin) {
        // 登录请求
        await handleLogin();
      } else {
        // 注册请求
        await handleRegister();
      }
    } catch (err) {
      console.error('操作失败:', err);
      setError('操作失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  // 处理登录
  const handleLogin = async () => {
    if (!username || !password) {
      setError('请输入用户名和密码');
      return;
    }

    try {
      const response = await fetch(`${getHttpUrl()}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess('登录成功！');
        // 短暂延迟后触发成功回调
        setTimeout(() => {
          onLoginSuccess(data.token, data.user.username);
        }, 500);
      } else {
        setError(data.error || '登录失败');
      }
    } catch (err) {
      console.error('登录错误:', err);
      setError('连接服务器失败，请检查网络连接');
    }
  };

  // 处理注册
  const handleRegister = async () => {
    // 验证输入
    if (!username || !password) {
      setError('请填写用户名和密码');
      return;
    }

    if (!isLogin && password.length < 6) {
      setError('密码长度至少6位');
      return;
    }

    try {
      const response = await fetch(`${getHttpUrl()}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          username, 
          email: email || undefined, // 可选字段
          password 
        }),
      });

      const data = await response.json();

      if (response.ok || response.status === 201) {
        setSuccess('注册成功！请使用新账号登录');
        // 自动切换到登录模式
        setTimeout(() => {
          setIsLogin(true);
          setPassword('');
          setEmail('');
        }, 1500);
      } else {
        setError(data.error || '注册失败');
      }
    } catch (err) {
      console.error('注册错误:', err);
      setError('连接服务器失败，请检查网络连接');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyber-900 via-cyber-800 to-cyber-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* 标题 */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-cyber-accent mb-2 tracking-tighter">
            AliceCrypto
          </h1>
          <p className="text-cyber-dim text-sm">
            {isLogin ? '登录你的账号' : '创建新账号'}
          </p>
        </div>

        {/* 卡片 */}
        <div className="bg-cyber-800 border border-cyber-700 rounded-lg shadow-2xl p-8">
          {/* 错误提示 */}
          {error && (
            <div className="mb-4 p-3 bg-red-900/20 border border-red-500/50 rounded text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* 成功提示 */}
          {success && (
            <div className="mb-4 p-3 bg-green-900/20 border border-green-500/50 rounded text-green-300 text-sm">
              {success}
            </div>
          )}

          {/* 表单 */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 用户名 */}
            <div>
              <label className="block text-sm font-medium text-cyber-text mb-2">
                用户名
              </label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-5 w-5 text-cyber-dim" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="输入用户名"
                  disabled={loading}
                  className="w-full bg-cyber-900 border border-cyber-700 rounded pl-10 pr-4 py-2 text-cyber-text placeholder-cyber-dim focus:outline-none focus:border-cyber-accent focus:ring-1 focus:ring-cyber-accent transition disabled:opacity-50"
                  required
                />
              </div>
            </div>

            {/* 邮箱（仅注册时显示） */}
            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-cyber-text mb-2">
                  邮箱 (可选)
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-5 w-5 text-cyber-dim" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="输入邮箱地址"
                    disabled={loading}
                    className="w-full bg-cyber-900 border border-cyber-700 rounded pl-10 pr-4 py-2 text-cyber-text placeholder-cyber-dim focus:outline-none focus:border-cyber-accent focus:ring-1 focus:ring-cyber-accent transition disabled:opacity-50"
                  />
                </div>
              </div>
            )}

            {/* 密码 */}
            <div>
              <label className="block text-sm font-medium text-cyber-text mb-2">
                密码
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-5 w-5 text-cyber-dim" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="输入密码"
                  disabled={loading}
                  className="w-full bg-cyber-900 border border-cyber-700 rounded pl-10 pr-10 py-2 text-cyber-text placeholder-cyber-dim focus:outline-none focus:border-cyber-accent focus:ring-1 focus:ring-cyber-accent transition disabled:opacity-50"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={loading}
                  className="absolute right-3 top-3 text-cyber-dim hover:text-cyber-accent transition disabled:opacity-50"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            {/* 提交按钮 */}
            <button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full bg-gradient-to-r from-cyber-accent to-blue-500 hover:from-cyber-accent/80 hover:to-blue-500/80 text-cyber-900 font-bold py-2 px-4 rounded transition disabled:opacity-50 disabled:cursor-not-allowed mt-6"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  处理中...
                </span>
              ) : isLogin ? (
                '登录'
              ) : (
                '注册'
              )}
            </button>
          </form>

          {/* 切换登录/注册 */}
          <div className="mt-6 text-center">
            <p className="text-cyber-dim text-sm">
              {isLogin ? '没有账号？' : '已有账号？'}
              <button
                type="button"
                onClick={() => {
                  setIsLogin(!isLogin);
                  setError('');
                  setSuccess('');
                  setPassword('');
                  setEmail('');
                }}
                disabled={loading}
                className="ml-2 text-cyber-accent hover:text-cyber-accent/80 font-medium transition disabled:opacity-50"
              >
                {isLogin ? '立即注册' : '返回登录'}
              </button>
            </p>
          </div>

          {/* 连接状态提示 */}
          <div className="mt-4 text-center">
            <div className="inline-flex items-center px-3 py-1 rounded-full bg-cyber-900/50 text-xs text-cyber-dim">
              <div className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse"></div>
              后端服务: {getHttpUrl()}
            </div>
          </div>
        </div>

        {/* 底部提示 */}
        <div className="mt-6 text-center text-xs text-cyber-dim">
          <p>🔐 安全密钥基础设施 - 所有通信已加密</p>
          <p className="mt-1">API 端点: {getHttpUrl()}/api/health</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
