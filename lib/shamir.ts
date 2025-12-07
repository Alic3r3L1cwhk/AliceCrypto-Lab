/**
 * Shamir's Secret Sharing Scheme Implementation
 * 基于 GF(2^8) 或简单的素数域运算
 */

// 简单的素数域实现 (mod 257) 用于演示
const PRIME = 257;

export interface Share {
    x: number;
    y: number;
}

// 生成随机系数多项式 f(x) = secret + a1*x + ... + a(t-1)*x^(t-1)
function generatePolynomial(secret: number, threshold: number): number[] {
    const coeffs = [secret];
    for (let i = 1; i < threshold; i++) {
        coeffs.push(Math.floor(Math.random() * (PRIME - 1)) + 1);
    }
    return coeffs;
}

// 计算 f(x)
function evaluatePolynomial(coeffs: number[], x: number): number {
    let result = 0;
    for (let i = coeffs.length - 1; i >= 0; i--) {
        result = (result * x + coeffs[i]) % PRIME;
    }
    return result;
}

export function splitSecret(secret: number, n: number, t: number): Share[] {
    const coeffs = generatePolynomial(secret, t);
    const shares: Share[] = [];
    
    for (let i = 1; i <= n; i++) {
        shares.push({
            x: i,
            y: evaluatePolynomial(coeffs, i)
        });
    }
    return shares;
}

// Lagrange 插值恢复秘密 f(0)
export function recoverSecret(shares: Share[], prime: number = PRIME): number {
    let secret = 0;
    
    for (let i = 0; i < shares.length; i++) {
        const { x: xi, y: yi } = shares[i];
        let numerator = 1;
        let denominator = 1;
        
        for (let j = 0; j < shares.length; j++) {
            if (i === j) continue;
            const xj = shares[j].x;
            
            // L_i(0) calculation
            numerator = (numerator * (0 - xj + prime)) % prime;
            denominator = (denominator * (xi - xj + prime)) % prime;
        }
        
        // 模逆元计算 (fermat's little theorem: a^(p-2) mod p)
        const lagrange = (numerator * modInverse(denominator, prime)) % prime;
        secret = (secret + yi * lagrange) % prime;
    }
    
    return secret;
}

function modPow(base: number, exp: number, mod: number): number {
    let res = 1;
    base = base % mod;
    while (exp > 0) {
        if (exp % 2 === 1) res = (res * base) % mod;
        exp = Math.floor(exp / 2);
        base = (base * base) % mod;
    }
    return res;
}

function modInverse(n: number, mod: number): number {
    return modPow(n, mod - 2, mod);
}