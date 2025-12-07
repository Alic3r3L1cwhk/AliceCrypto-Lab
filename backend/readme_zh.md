# AliceCrypto 后端服务使用指南

这是一个基于 Python 的 WebSocket 服务器，用于配合前端进行安全通信、FHE 同态求和与 MPC 演示实验。

## 1. 环境准备

- Python 3.8 及以上（推荐使用虚拟环境）。
- 安装依赖：

```bash
cd backend
pip install -r requirements.txt
```

## 2. 运行服务器

```bash
python main.py
```

- 默认监听 `0.0.0.0:8080`。
- 日志写入 `backend.log`，所有加密聊天消息会落库至 `crypto_lab.db`。

## 3. 协议能力

| 模块        | 事件                                          | 说明                                                              |
| ----------- | --------------------------------------------- | ----------------------------------------------------------------- |
| Secure Chat | `HANDSHAKE_INIT` / `HANDSHAKE_REPLY`          | 服务器为每个连接生成临时 ECDH 密钥并协商 AES-GCM 会话密钥。       |
| Secure Chat | `CHAT_MESSAGE` / `CHAT_REPLY`                 | 通过协商的密钥对消息加解密，密文与 IV 被保存以便审计。            |
| FHE         | `GET_PAILLIER_KEY` / `COMPUTE_SUM_SERVER_KEY` | 提供 2048-bit Paillier 公钥与云端向量求和，并可返回同态结果明文。 |
| FHE         | `KEY_ROTATED`                                 | 每 5 分钟触发一次密钥轮换并广播最新公钥+时间信息。                |
| MPC         | `MPC_GENERATE_SECRET`                         | 为当前连接生成 Bob 的秘密值，返回 `MPC_SECRET_GENERATED`。        |
| MPC         | `MPC_COMPARE_INIT`                            | 比较 Alice 与 Bob 的值，返回 `MPC_COMPARE_RESULT`。               |

## 4. 配置提示

- 如需修改轮换周期，请更新 `paillier_service.KEY_ROTATION_INTERVAL`。
- 前端通过 `config.ts` 中的 `SERVER_HOST` / `SERVER_PORT` 指定 WebSocket 地址，部署到云端时记得同步修改并开放 8080 端口。

## 5. 部署到云服务器

1. 上传 `backend/` 目录并安装依赖。
2. 使用 `systemd`、`pm2` 或 `supervisor` 常驻运行 `python main.py`。
3. 确保外网能访问 `ws://<你的IP>:8080`，或配置反向代理提供 `wss://` 服务。
4. 在前端重新构建后即可通过浏览器体验完整的安全多方计算流程。
