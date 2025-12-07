/**
 * Paillier 同态加密系统的简化模拟实现 (使用 BigInt)。
 * 注意：在真实的生产环境中，请使用 WebCrypto 或专用的 WASM 库来生成大素数。
 * 本实现为了在浏览器中演示速度和稳定性，使用了较小的硬编码素数。
 */

// 演示用的小素数 (在 Python 'phe' 库中，这些通常是 2048 位的)
const p = 61n;
const q = 53n;
const n = p * q; // 3233 (模数)
const n2 = n * n; // 10452289 (模数的平方)
const g = n + 1n; // 3234 (简化变体，g = n + 1)
const lambda = (p - 1n) * (q - 1n); // LCM(p-1, q-1) 在 p,q 互质时简化为 (p-1)(q-1)
const mu = modInverse(lambda, n);

// 工具函数：模幂运算 (base^exp % mod)
function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let res = 1n;
  base = base % mod;
  while (exp > 0n) {
    if (exp % 2n === 1n) res = (res * base) % mod;
    exp = exp / 2n;
    base = (base * base) % mod;
  }
  return res;
}

// 工具函数：模逆元
function modInverse(a: bigint, m: bigint): bigint {
  let [m0, x, y] = [m, 1n, 0n];
  if (m === 1n) return 0n;
  while (a > 1n) {
    const q = a / m;
    [a, m] = [m, a % m];
    [x, y] = [y, x - q * y];
  }
  return x < 0n ? x + m0 : x;
}

// 工具函数：生成范围 [1, n-1] 内的随机大整数
function randomBigInt(max: bigint): bigint {
  // 演示用简单随机数
  const rand = Math.floor(Math.random() * Number(max));
  return BigInt(rand) || 1n;
}

/**
 * 加密整数 m
 * c = g^m * r^n mod n^2
 */
export const encrypt = (value: number): string => {
  const m = BigInt(value);
  const r = randomBigInt(n - 1n) + 1n; // 随机盲化因子
  
  // c = (g^m mod n^2) * (r^n mod n^2) mod n^2
  const gm = modPow(g, m, n2);
  const rn = modPow(r, n, n2);
  const c = (gm * rn) % n2;
  
  return c.toString();
};

/**
 * 解密密文 c
 * m = L(c^lambda mod n^2) * mu mod n
 * 其中 L(x) = (x - 1) / n
 */
export const decrypt = (ciphertext: string): number => {
  const c = BigInt(ciphertext);
  
  const u = modPow(c, lambda, n2);
  const l = (u - 1n) / n;
  const m = (l * mu) % n;
  
  return Number(m);
};

/**
 * 同态加法
 * E(m1 + m2) = E(m1) * E(m2) mod n^2
 * 原理：两个密文相乘，解密后等于两个明文相加
 */
export const addEncrypted = (c1: string, c2: string): string => {
  const bigC1 = BigInt(c1);
  const bigC2 = BigInt(c2);
  const sum = (bigC1 * bigC2) % n2;
  return sum.toString();
};

export const getPublicKey = () => ({ n: n.toString(), g: g.toString() });