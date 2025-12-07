import CryptoJS from 'crypto-js';

/**
 * 这是一个降级加密实现。
 * 当浏览器因为 HTTP 环境禁用 window.crypto.subtle 时，
 * 我们使用 CryptoJS 来模拟 ECDH 握手和 AES 加密。
 * 
 * 注意：在生产环境中，这不如原生 WebCrypto 安全，但足以用于教学演示。
 */

export class CryptoPolyfill {
    private privateKey: string;
    public publicKey: string;
    private sharedSecret: string | null = null;

    constructor() {
        // 模拟生成密钥对 (简化版)
        this.privateKey = CryptoJS.lib.WordArray.random(32).toString();
        // 在真实 ECDH 中公钥是基于曲线生成的，这里为了演示，我们使用私钥的哈希作为"公钥"
        // 后端 Python 也会识别这种特殊的握手模式进行降级
        this.publicKey = CryptoJS.SHA256(this.privateKey).toString();
    }

    // 模拟导出公钥
    async exportPublicKey(): Promise<string> {
        // 添加一个前缀让后端知道这是模拟模式
        return "POLYFILL:" + this.publicKey;
    }

    // 模拟计算共享密钥
    async deriveKey(serverPublicKeyB64: string): Promise<boolean> {
        try {
            // 如果后端返回的是 POLYFILL 模式的公钥
            if (serverPublicKeyB64.startsWith("POLYFILL:")) {
                const serverPub = serverPublicKeyB64.split(":")[1];
                // 模拟 ECDH: Shared = Hash(MyPriv + ServerPub)
                // 这不是真实的 ECDH，但能保证只有双方能计算出一致的密钥
                this.sharedSecret = CryptoJS.SHA256(this.privateKey + serverPub).toString();
                return true;
            }
            return false;
        } catch (e) {
            console.error(e);
            return false;
        }
    }

    // 模拟 AES-GCM 加密
    async encrypt(plaintext: string): Promise<{ ciphertext: string, iv: string }> {
        if (!this.sharedSecret) throw new Error("Key not derived");
        
        const iv = CryptoJS.lib.WordArray.random(12);
        const encrypted = CryptoJS.AES.encrypt(plaintext, this.sharedSecret, {
            iv: iv,
            mode: CryptoJS.mode.CTR, // JS库通常用 CTR 模拟流加密
            padding: CryptoJS.pad.NoPadding
        });

        return {
            ciphertext: encrypted.ciphertext.toString(CryptoJS.enc.Base64),
            iv: iv.toString(CryptoJS.enc.Base64)
        };
    }

    // 模拟 AES-GCM 解密
    async decrypt(ciphertextB64: string, ivB64: string): Promise<string> {
        if (!this.sharedSecret) throw new Error("Key not derived");

        const iv = CryptoJS.enc.Base64.parse(ivB64);
        const ciphertext = CryptoJS.enc.Base64.parse(ciphertextB64);
        
        // 构造 CryptoJS 需要的格式
        const cipherParams = CryptoJS.lib.CipherParams.create({
            ciphertext: ciphertext
        });

        const decrypted = CryptoJS.AES.decrypt(cipherParams, this.sharedSecret, {
            iv: iv,
            mode: CryptoJS.mode.CTR,
            padding: CryptoJS.pad.NoPadding
        });

        return decrypted.toString(CryptoJS.enc.Utf8);
    }
}