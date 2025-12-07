from phe import paillier, EncryptedNumber
import threading
import time
from datetime import datetime, timedelta

# 全局密钥对
_public_key = None
_private_key = None
_key_generated_at = None
_key_lock = threading.Lock()

# 密钥更新间隔（秒）
KEY_ROTATION_INTERVAL = 5 * 60  # 5分钟

def init_paillier_keys(key_size=2048):
    """初始化 Paillier 密钥对"""
    global _public_key, _private_key, _key_generated_at
    
    with _key_lock:
        print(f"[Paillier] 正在生成 {key_size} 位密钥对，请稍候...")
        start_time = time.time()
        _public_key, _private_key = paillier.generate_paillier_keypair(n_length=key_size)
        _key_generated_at = datetime.now()
        elapsed = time.time() - start_time
        print(f"[Paillier] 密钥对生成完成！耗时: {elapsed:.2f}秒")
        print(f"[Paillier] N 的位数: {_public_key.n.bit_length()} bits")
        print(f"[Paillier] 生成时间: {_key_generated_at.strftime('%Y-%m-%d %H:%M:%S')}")

def start_key_rotation(key_size=2048, interval=KEY_ROTATION_INTERVAL, on_rotate=None):
    """启动密钥轮换定时器"""

    def rotation_loop():
        while True:
            time.sleep(interval)
            print("\n[Paillier] ===== 密钥轮换开始 =====")
            init_paillier_keys(key_size)
            if on_rotate:
                try:
                    on_rotate()
                except Exception as exc:  # noqa: BLE001
                    print(f"[Paillier] 广播密钥轮换失败: {exc}")
            print("[Paillier] ===== 密钥轮换完成 =====\n")

    rotation_thread = threading.Thread(target=rotation_loop, daemon=True)
    rotation_thread.start()
    print(f"[Paillier] 密钥轮换服务已启动，间隔: {interval}秒")

def get_key_info():
    """获取当前密钥的信息"""
    with _key_lock:
        if _key_generated_at is None:
            return None
        
        now = datetime.now()
        next_rotation = _key_generated_at + timedelta(seconds=KEY_ROTATION_INTERVAL)
        remaining_seconds = max(0, (next_rotation - now).total_seconds())
        
        return {
            'generated_at': _key_generated_at.strftime('%Y-%m-%d %H:%M:%S'),
            'generated_at_timestamp': _key_generated_at.timestamp(),
            'next_rotation_at': next_rotation.strftime('%Y-%m-%d %H:%M:%S'),
            'next_rotation_timestamp': next_rotation.timestamp(),
            'remaining_seconds': int(remaining_seconds),
            'rotation_interval': KEY_ROTATION_INTERVAL,
            'server_time': now.strftime('%Y-%m-%d %H:%M:%S'),
            'server_timestamp': now.timestamp()
        }

def get_public_key():
    """获取公钥信息"""
    with _key_lock:
        if _public_key is None:
            init_paillier_keys()
        
        return {
            'n': str(_public_key.n),
            'g': str(_public_key.g)
        }

def get_public_key_with_info():
    """获取公钥信息和时间信息"""
    pub_key = get_public_key()
    key_info = get_key_info()
    
    return {
        'pub_key': pub_key,
        'key_info': key_info
    }

def encrypt_value(plaintext):
    """服务端加密"""
    with _key_lock:
        if _public_key is None:
            init_paillier_keys()
        
        encrypted = _public_key.encrypt(plaintext)
        return str(encrypted.ciphertext())

def decrypt_value(ciphertext_str):
    """服务端解密"""
    with _key_lock:
        if _private_key is None:
            raise Exception("私钥未初始化")
        
        ciphertext_int = int(ciphertext_str)
        encrypted_number = EncryptedNumber(_public_key, ciphertext_int)
        return _private_key.decrypt(encrypted_number)

def compute_homomorphic_sum(pub_n_str, pub_g_str, ciphertexts):
    """执行同态加法（使用前端传来的公钥）"""
    try:
        pub_n = int(pub_n_str)
        public_key = paillier.PaillierPublicKey(n=pub_n)
        
        encrypted_sum = None
        
        for c_str in ciphertexts:
            c_int = int(c_str)
            enc_num = EncryptedNumber(public_key, c_int)
            
            if encrypted_sum is None:
                encrypted_sum = enc_num
            else:
                encrypted_sum = encrypted_sum + enc_num
        
        if encrypted_sum:
            return str(encrypted_sum.ciphertext())
        return "0"
        
    except Exception as e:
        print(f"[Paillier] 计算错误: {e}")
        import traceback
        traceback.print_exc()
        return None

def compute_with_server_key(ciphertexts, return_plaintext=False):
    """使用服务端密钥进行同态计算"""
    try:
        with _key_lock:
            if _public_key is None or _private_key is None:
                raise Exception("密钥未初始化")
            
            encrypted_sum = None
            
            for c_str in ciphertexts:
                c_int = int(c_str)
                enc_num = EncryptedNumber(_public_key, c_int)
                
                if encrypted_sum is None:
                    encrypted_sum = enc_num
                else:
                    encrypted_sum = encrypted_sum + enc_num
            
            if encrypted_sum:
                result = {
                    'ciphertext': str(encrypted_sum.ciphertext())
                }
                if return_plaintext:
                    result['plaintext'] = _private_key.decrypt(encrypted_sum)
                return result
            return None
        
    except Exception as e:
        print(f"[Paillier] 计算错误: {e}")
        import traceback
        traceback.print_exc()
        return None
