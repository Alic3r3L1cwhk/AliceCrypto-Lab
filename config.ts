
// === 服务器配置 ===

//*修改服务ip地址
export const SERVER_HOST = 'localhost';

export const SERVER_PORT = 8080;
export const HTTP_PORT = 8081;

const API_PROTOCOL = (import.meta as any)?.env?.VITE_API_PROTOCOL || 'http:';

export const getWsUrl = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // 如果是本地开发 (localhost)，依然尝试连接远程服务器
  // 如果是在服务器上访问，直接使用当前 host
  return `${protocol}//${SERVER_HOST}:${SERVER_PORT}`;
};

export const getHttpUrl = () => {
  const protocol = API_PROTOCOL.endsWith(':') ? API_PROTOCOL : `${API_PROTOCOL}:`;
  return `${protocol}//${SERVER_HOST}:${HTTP_PORT}`;
};
