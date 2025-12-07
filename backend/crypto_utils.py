"""保留文件以兼容旧导入。

安全通信模块已在 v2.2 中移除，本文件仅用于提示开发者。
"""


class CryptoManager:  # pragma: no cover - legacy placeholder
    def __init__(self) -> None:
        raise RuntimeError(
            "Secure chat pipeline 已下线，如需 ECDH/AES 功能请查看历史版本标签。"
        )
