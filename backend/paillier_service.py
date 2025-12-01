from phe import paillier, EncryptedNumber

def generate_keypair(key_size=2048):
    """
    生成 Paillier 密钥对
    :param key_size: 密钥位数，推荐 2048 或 3072
    :return: (public_key, private_key)
    """
    public_key, private_key = paillier.generate_paillier_keypair(n_length=key_size)
    return {
        'public': {
            'n': str(public_key. n),
            'g': str(public_key.g)
        },
        'private': {
            'p': str(private_key.p),
            'q': str(private_key. q)
        }
    }

def compute_homomorphic_sum(pub_n_str, pub_g_str, ciphertexts):
    """
    执行同态加法
    """
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
            return str(encrypted_sum. ciphertext())
        return "0"
        
    except Exception as e:
        print(f"[Paillier] 计算错误: {e}")
        import traceback
        traceback.print_exc()
        return None
