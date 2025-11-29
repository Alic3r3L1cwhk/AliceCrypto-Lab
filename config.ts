
// === 服务器配置 ===

// 你的阿里云服务器公网 IP
export const SERVER_HOST = 'localhost'; 

export const SERVER_PORT = 8080;

export const getWsUrl = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // 如果是本地开发 (localhost)，依然尝试连接远程服务器
  // 如果是在服务器上访问，直接使用当前 host
  return `${protocol}//${SERVER_HOST}:${SERVER_PORT}`;
};
