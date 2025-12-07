
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

// FHE 算法类型
export type FHEAlgorithm = 'PAILLIER' | 'RSA' | 'ELGAMAL';

// 密钥信息
export interface KeyInfo {
  generated_at: string;
  next_rotation_at: string;
  remaining_seconds: number;
  rotation_interval: number;
  server_time: string;
  bit_length: number;
  operation: 'SUM' | 'PRODUCT';
}

export interface ServerPublicKey {
  n?: string;
  g?: string;
  e?: string;
  p?: string;
  y?: string;
}
