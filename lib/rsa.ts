
/**
 * RSA 乘法同态仿真实现 (Textbook RSA)
 * 注意：Textbook RSA 不具备语义安全性，仅用于演示同态性质
 * E(m1) * E(m2) = (m1^e)*(m2^e) = (m1*m2)^e = E(m1*m2)
 */

// 简单的模幂运算
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

export const encryptRSA = (m: number, eStr: string, nStr: string): string => {
  const bigM = BigInt(m);
  const bigE = BigInt(eStr);
  const bigN = BigInt(nStr);
  
  // c = m^e mod n
  const c = modPow(bigM, bigE, bigN);
  return c.toString();
}

export const multiplyRSA = (c1: string, c2: string, nStr: string): string => {
  const bigC1 = BigInt(c1);
  const bigC2 = BigInt(c2);
  const bigN = BigInt(nStr);

  // c_new = c1 * c2 mod n
  const c = (bigC1 * bigC2) % bigN;
  return c.toString();
}
