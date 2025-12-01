import base64
import os
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat. primitives.kdf. hkdf import HKDF
from cryptography.hazmat.primitives.ciphers. aead import AESGCM

class CryptoManager:
    def __init__(self):
        self.client_sessions = {}

    def _generate_keypair(self):
        """为每个连接生成新的临时 ECDH 密钥对"""
        private_key = ec.generate_private_key(ec.SECP256R1())
        return private_key

    def get_public_key_b64(self, websocket):
        """导出服务器公钥为 Base64 字符串"""
        if websocket not in self.client_sessions:
            private_key = self._generate_keypair()
            self.client_sessions[websocket] = {'private_key': private_key, 'aes_key': None}
        
        private_key = self. client_sessions[websocket]['private_key']
        public_key = private_key.public_key()
        
        pub_bytes = public_key. public_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        )
        return base64.b64encode(pub_bytes).decode('utf-8')

    def handle_handshake(self, websocket, client_pub_b64):
        """处理来自客户端的公钥，计算共享密钥"""
        try:
            if websocket not in self.client_sessions:
                private_key = self._generate_keypair()
                self.client_sessions[websocket] = {'private_key': private_key, 'aes_key': None}
            
            server_private_key = self. client_sessions[websocket]['private_key']
            
            client_pub_bytes = base64.b64decode(client_pub_b64)
            client_public_key = serialization.load_der_public_key(client_pub_bytes)

            shared_secret = server_private_key. exchange(ec.ECDH(), client_public_key)

            aes_key = HKDF(
                algorithm=hashes.SHA256(),
                length=32,
                salt=None,
                info=b'handshake data',
            ).derive(shared_secret)

            self.client_sessions[websocket]['aes_key'] = aes_key
            print(f"[Crypto] 与客户端建立安全连接，AES 密钥已生成")
            return True
        except Exception as e:
            print(f"[Crypto] 密钥协商失败: {e}")
            import traceback
            traceback.print_exc()
            return False

    def decrypt_message(self, websocket, iv_b64, ciphertext_b64):
        """使用协商好的密钥解密消息"""
        if websocket not in self.client_sessions or self.client_sessions[websocket]['aes_key'] is None:
            raise Exception("未找到该连接的密钥，请先握手")
        
        key = self.client_sessions[websocket]['aes_key']
        aesgcm = AESGCM(key)
        
        iv = base64.b64decode(iv_b64)
        ciphertext = base64.b64decode(ciphertext_b64)
        
        plaintext_bytes = aesgcm.decrypt(iv, ciphertext, None)
        return plaintext_bytes. decode('utf-8')

    def encrypt_reply(self, websocket, plaintext_text):
        """加密回复消息"""
        if websocket not in self.client_sessions or self.client_sessions[websocket]['aes_key'] is None:
            raise Exception("未找到该连接的密钥")

        key = self. client_sessions[websocket]['aes_key']
        aesgcm = AESGCM(key)
        
        iv = os.urandom(12)
        plaintext_bytes = plaintext_text.encode('utf-8')
        
        ciphertext = aesgcm.encrypt(iv, plaintext_bytes, None)
        
        return {
            'content': base64.b64encode(ciphertext).decode('utf-8'),
            'iv': base64.b64encode(iv).decode('utf-8')
        }

    def remove_client(self, websocket):
        if websocket in self. client_sessions:
            del self.client_sessions[websocket]
