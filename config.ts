
// === 服务器配置 ===
// 自动根据浏览器地址栏识别后端 IP
// 这样部署到云服务器后，无需修改代码即可正常连接
export const getWsUrl = () => {
  // 如果是 https/http 协议，自动匹配对应的 ws/wss
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // 获取当前访问的主机名 (localhost 或 IP)
  const host = window.location.hostname;
  // 后端固定端口 8080
  const port = 8080;
  
  return `${protocol}//${host}:${port}`;
};
