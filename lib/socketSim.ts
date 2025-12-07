import { SocketLog } from '../types';
import { getWsUrl } from '../config';

type LogType = 'INFO' | 'DATA' | 'Handshake' | 'Error' | 'WARN';
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
    return () => {
      this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
    };
  }

  clearMessageHandlers() {
    this.messageHandlers = [];
  }

  private emitLog(
    sender: 'CLIENT' | 'SERVER',
    message: string,
    type: LogType = 'INFO',
    details?: string
  ) {
    // 统一处理日志类型（兼容 ERROR -> Error）
    const normalizedType = type === 'ERROR' as any ? 'Error' : type;

    this.listeners.forEach(l => l({
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      sender,
      type: normalizedType as any,
      message,
      details
    }));
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  connect(): Promise<void> {
    if (this.isConnected()) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const url = getWsUrl();
      this.emitLog('CLIENT', `尝试连接到服务器: ${url}... `, 'Handshake');

      try {
        this.ws = new WebSocket(url);
      } catch (e) {
        this.emitLog('CLIENT', '创建 WebSocket 连接失败', 'Error');
        reject(e);
        return;
      }

      const timeout = setTimeout(() => {
        if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.close();
          this.emitLog('CLIENT', '连接超时', 'Error');
          reject(new Error('Connection timeout'));
        }
      }, 10000);

      this.ws.onopen = () => {
        clearTimeout(timeout);
        this.emitLog('CLIENT', 'WebSocket 连接成功建立', 'Handshake');
        resolve();
      };

      this.ws.onerror = (err) => {
        clearTimeout(timeout);
        this.emitLog('CLIENT', '连接失败，请检查服务器是否启动', 'Error');
        reject(err);
      };

      this.ws.onclose = () => {
        this.emitLog('CLIENT', '连接已断开', 'Error');
        this.ws = null;
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.messageHandlers.forEach(h => h(data));
        } catch (e) {
          console.error('Parse error', e);
        }
      };
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      this.emitLog('CLIENT', '发送失败：未连接到服务器', 'Error');
    }
  }

  log(
    sender: 'CLIENT' | 'SERVER',
    message: string,
    type: LogType | 'ERROR' = 'INFO',
    details?: string
  ) {
    this.emitLog(sender, message, type === 'ERROR' ? 'Error' : type as LogType, details);
  }
}

export const socketSim = new RealSocketClient();
