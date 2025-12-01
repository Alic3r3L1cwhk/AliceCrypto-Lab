import math
import secrets
import threading
import time
from datetime import datetime, timedelta
from typing import Any, Dict, Iterable, List, Tuple

from phe import EncryptedNumber, paillier


def _utc_now() -> datetime:
    return datetime.utcnow()


def _format(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def _is_probable_prime(n: int, rounds: int = 8) -> bool:
    if n < 2:
        return False
    small_primes = [2, 3, 5, 7, 11, 13, 17, 19, 23]
    if any(n % p == 0 for p in small_primes):
        return n in small_primes

    d = n - 1
    r = 0
    while d % 2 == 0:
        d //= 2
        r += 1

    for _ in range(rounds):
        a = secrets.randbelow(n - 3) + 2
        x = pow(a, d, n)
        if x in (1, n - 1):
            continue
        for _ in range(r - 1):
            x = pow(x, 2, n)
            if x == n - 1:
                break
        else:
            return False
    return True


def _generate_prime(bits: int) -> int:
    while True:
        candidate = secrets.randbits(bits)
        candidate |= (1 << (bits - 1)) | 1
        if _is_probable_prime(candidate):
            return candidate


def _generate_safe_prime(bits: int) -> Tuple[int, int]:
    while True:
        q = _generate_prime(bits - 1)
        p = 2 * q + 1
        if _is_probable_prime(p):
            return p, q


def _find_generator(p: int, q: int) -> int:
    while True:
        g = secrets.randbelow(p - 3) + 2
        if pow(g, 2, p) != 1 and pow(g, q, p) != 1:
            return g


class BaseEngine:
    name: str
    operation: str

    def __init__(self, bit_length: int) -> None:
        self.bit_length = bit_length
        self.generated_at = _utc_now()

    def rotate_keys(self) -> None:
        raise NotImplementedError

    def public_key_payload(self) -> Dict[str, str]:
        raise NotImplementedError

    def encrypt_values(self, values: Iterable[int]) -> List[Dict[str, Any]]:
        raise NotImplementedError

    def homomorphic_compute(self, ciphertexts: Iterable[str]) -> Dict[str, Any]:
        raise NotImplementedError

    def _remaining_seconds(self, interval: int) -> int:
        next_rotation = self.generated_at + timedelta(seconds=interval)
        remaining = int((next_rotation - _utc_now()).total_seconds())
        return max(0, remaining)

    def key_info(self, interval: int) -> Dict[str, Any]:
        next_rotation = self.generated_at + timedelta(seconds=interval)
        return {
            "generated_at": _format(self.generated_at),
            "next_rotation_at": _format(next_rotation),
            "remaining_seconds": self._remaining_seconds(interval),
            "rotation_interval": interval,
            "server_time": _format(_utc_now()),
            "bit_length": self.bit_length,
            "operation": self.operation,
        }


class PaillierEngine(BaseEngine):
    name = "PAILLIER"
    operation = "SUM"

    def __init__(self, bit_length: int = 2048) -> None:
        super().__init__(bit_length)
        self.rotate_keys()

    def rotate_keys(self) -> None:
        self.public_key, self.private_key = paillier.generate_paillier_keypair(
            n_length=self.bit_length
        )
        self.generated_at = _utc_now()
        self.bit_length = self.public_key.n.bit_length()

    def public_key_payload(self) -> Dict[str, str]:
        return {"n": str(self.public_key.n), "g": str(self.public_key.g)}

    def encrypt_values(self, values: Iterable[int]) -> List[Dict[str, Any]]:
        items: List[Dict[str, Any]] = []
        for value in values:
            number = int(value)
            ciphertext = self.public_key.encrypt(number)
            items.append(
                {
                    "original": number,
                    "ciphertext": str(ciphertext.ciphertext()),
                }
            )
        return items

    def homomorphic_compute(self, ciphertexts: Iterable[str]) -> Dict[str, Any]:
        acc: EncryptedNumber | None = None
        for item in ciphertexts:
            enc = EncryptedNumber(self.public_key, int(item))
            acc = enc if acc is None else acc + enc

        if acc is None:
            raise ValueError("同态计算需要至少一个密文")

        plaintext = self.private_key.decrypt(acc)
        return {
            "ciphertext": str(acc.ciphertext()),
            "plaintext": int(plaintext),
        }


class RSAEngine(BaseEngine):
    name = "RSA"
    operation = "PRODUCT"

    def __init__(self, bit_length: int = 1024) -> None:
        super().__init__(bit_length)
        self.rotate_keys()

    def rotate_keys(self) -> None:
        half = max(2, self.bit_length // 2)
        while True:
            p = _generate_prime(half)
            q = _generate_prime(half)
            if p != q:
                break
        self.n = p * q
        phi = (p - 1) * (q - 1)
        self.e = 65537
        while math.gcd(self.e, phi) != 1:
            self.e += 2
        self.d = pow(self.e, -1, phi)
        self.generated_at = _utc_now()
        self.bit_length = self.n.bit_length()

    def public_key_payload(self) -> Dict[str, str]:
        return {"n": str(self.n), "e": str(self.e)}

    def _normalize(self, value: int) -> int:
        val = int(value) % self.n
        return val if val > 0 else 1

    def encrypt_values(self, values: Iterable[int]) -> List[Dict[str, Any]]:
        items: List[Dict[str, Any]] = []
        for value in values:
            normalized = self._normalize(int(value))
            ciphertext = pow(normalized, self.e, self.n)
            items.append({"original": normalized, "ciphertext": str(ciphertext)})
        return items

    def homomorphic_compute(self, ciphertexts: Iterable[str]) -> Dict[str, Any]:
        product = 1
        for item in ciphertexts:
            product = (product * (int(item) % self.n)) % self.n
        plaintext = pow(product, self.d, self.n)
        return {"ciphertext": str(product), "plaintext": int(plaintext)}


class ElGamalEngine(BaseEngine):
    name = "ELGAMAL"
    operation = "PRODUCT"

    def __init__(self, bit_length: int = 384) -> None:
        super().__init__(bit_length)
        self.rotate_keys()

    def rotate_keys(self) -> None:
        self.p, self.q = _generate_safe_prime(self.bit_length)
        self.g = _find_generator(self.p, self.q)
        self.x = secrets.randbelow(self.p - 2) + 1
        self.y = pow(self.g, self.x, self.p)
        self.generated_at = _utc_now()
        self.bit_length = self.p.bit_length()

    def public_key_payload(self) -> Dict[str, str]:
        return {"p": str(self.p), "g": str(self.g), "y": str(self.y)}

    def _encode_cipher(self, c1: int, c2: int) -> str:
        return f"{c1}:{c2}"

    def _decode_cipher(self, payload: str) -> Tuple[int, int]:
        left, right = payload.split(":")
        return int(left), int(right)

    def encrypt_values(self, values: Iterable[int]) -> List[Dict[str, Any]]:
        items: List[Dict[str, Any]] = []
        for value in values:
            normalized = int(value) % self.p
            normalized = normalized if normalized > 0 else 1
            k = secrets.randbelow(self.p - 2) + 1
            c1 = pow(self.g, k, self.p)
            c2 = (normalized * pow(self.y, k, self.p)) % self.p
            items.append(
                {
                    "original": normalized,
                    "ciphertext": self._encode_cipher(c1, c2),
                }
            )
        return items

    def homomorphic_compute(self, ciphertexts: Iterable[str]) -> Dict[str, Any]:
        c1, c2 = 1, 1
        for item in ciphertexts:
            left, right = self._decode_cipher(item)
            c1 = (c1 * left) % self.p
            c2 = (c2 * right) % self.p

        s = pow(c1, self.x, self.p)
        s_inv = pow(s, self.p - 2, self.p)
        plaintext = (c2 * s_inv) % self.p
        return {"ciphertext": self._encode_cipher(c1, c2), "plaintext": int(plaintext)}


class FHEManager:
    def __init__(self, rotation_interval: int = 300) -> None:
        self.rotation_interval = rotation_interval
        self.engines: Dict[str, BaseEngine] = {
            engine.name: engine
            for engine in (
                PaillierEngine(2048),
                RSAEngine(1024),
                ElGamalEngine(384),
            )
        }
        self._lock = threading.Lock()

    def _get_engine(self, algorithm: str) -> BaseEngine:
        key = algorithm.upper()
        if key not in self.engines:
            raise ValueError(f"不支持的同态算法: {algorithm}")
        return self.engines[key]

    def rotate_now(self) -> None:
        with self._lock:
            for engine in self.engines.values():
                engine.rotate_keys()

    def get_key_bundle(self, algorithm: str) -> Dict[str, Any]:
        engine = self._get_engine(algorithm)
        with self._lock:
            return {
                "algorithm": engine.name,
                "pub_key": engine.public_key_payload(),
                "key_info": engine.key_info(self.rotation_interval),
            }

    def get_all_key_bundles(self) -> Dict[str, Any]:
        return {name: self.get_key_bundle(name) for name in self.engines}

    def encrypt_batch(self, algorithm: str, values: Iterable[int]) -> List[Dict[str, Any]]:
        engine = self._get_engine(algorithm)
        values = list(values)
        if not values:
            raise ValueError("请提供至少一个待加密的数值")
        return engine.encrypt_values(values)

    def compute(self, algorithm: str, ciphertexts: Iterable[str]) -> Dict[str, Any]:
        engine = self._get_engine(algorithm)
        ciphertexts = list(ciphertexts)
        if not ciphertexts:
            raise ValueError("同态计算需要至少一个密文")
        result = engine.homomorphic_compute(ciphertexts)
        result["operation"] = engine.operation
        return result

    def start_auto_rotation(self, on_rotate=None) -> None:
        def loop() -> None:
            while True:
                time.sleep(self.rotation_interval)
                self.rotate_now()
                if on_rotate:
                    on_rotate()

        threading.Thread(target=loop, daemon=True).start()
