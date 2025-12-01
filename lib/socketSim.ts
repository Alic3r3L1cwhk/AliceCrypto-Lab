import { SocketLog } from '../types';
import { getWsUrl } from '../config';

type Listener = (log: SocketLog) => void;

class RealSocketClient {
  private ws: WebSocket | null = null;
  private listeners: Listener[] = [];
  private messageHandlers: ((data: any) => void)[] = [];
  
  subscribe(listener: Listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  onMessage(handler: (data: any) => void) {
    this.messageHandlers.push(handler);
    // 返回取消订阅函数
    return () => {
      this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
    };
  }

  // 清除所有消息处理器
  clearMessageHandlers() {
    this.messageHandlers = [];
  }

  private emitLog(
    sender: 'CLIENT' | 'SERVER', 
    message: string, 
    type: 'INFO' | 'DATA' | 'Handshake' | 'Error' | 'WARN' = 'INFO', 
    details?: string
  ) {
    this.listeners.forEach(l => l({
      id: Math.random(). toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      sender,
      type,
      message,
      details
    }));
  }

  isConnected(): boolean {
    return this. ws !== null && this.ws.readyState === WebSocket. OPEN;
  }

  connect(): Promise<void> {
    // 如果已经连接，直接返回
    if (this.isConnected()) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const url = getWsUrl();
      this.emitLog('CLIENT', `尝试连接到服务器: ${url}... `, 'Handshake');
      
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.emitLog('CLIENT', 'WebSocket 连接成功建立', 'Handshake');
        resolve();
      };

      this.ws.onerror = (err) => {
        this.emitLog('CLIENT', '连接失败，请检查服务器是否启动', 'Error');
        reject(err);
      };

      this.ws.onclose = () => {
        this.emitLog('CLIENT', '连接已断开', 'Error');
        this.ws = null;
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON. parse(event.data);
          this. messageHandlers.forEach(h => h(data));
        } catch (e) {
          console.error('Parse error', e);
        }
      };
    });
  }

  disconnect() {
    if (this.ws) {
      this. ws.close();
      this.ws = null;
    }
  }

  send(data: any) {
    if (this.ws && this.ws.readyState === WebSocket. OPEN) {
      this.ws. send(JSON.stringify(data));
    } else {
      this.emitLog('CLIENT', '发送失败：未连接到服务器', 'Error');
    }
  }

  log(
    sender: 'CLIENT' | 'SERVER', 
    message: string, 
    type: 'INFO' | 'DATA' | 'Handshake' | 'Error' | 'WARN' = 'INFO', 
    details?: string
  ) {
    this.emitLog(sender, message, type, details);
  }
}

export const socketSim = new RealSocketClient();
