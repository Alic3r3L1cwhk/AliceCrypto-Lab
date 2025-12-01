export enum EncryptionMode {
  PLAIN = 'PLAIN',
  AES = 'AES',
  HOMOMORPHIC = 'HOMOMORPHIC',
}

export interface SocketLog {
  id: string;
  timestamp: string;
  sender: 'CLIENT' | 'SERVER';
  type: 'INFO' | 'DATA' | 'Handshake' | 'Error' | 'WARN';
  message: string;
  details?: string;
}

export interface EncryptedDataPacket {
  id: string;
  originalValue?: number;
  ciphertext: string;
}

export interface ChatMessage {
  id: string;
  sender: 'Alice' | 'Bob';
  encryptedContent: string;
  decryptedContent: string;
  iv: string;
  timestamp: number;
}

// Paillier 密钥信息
export interface KeyInfo {
  generated_at: string;
  generated_at_timestamp: number;
  next_rotation_at: string;
  next_rotation_timestamp: number;
  remaining_seconds: number;
  rotation_interval: number;
  server_time: string;
  server_timestamp: number;
}

export interface ServerPublicKey {
  n: string;
  g: string;
}
