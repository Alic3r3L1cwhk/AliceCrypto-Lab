# AliceCrypto v2.2

AliceCrypto v2.2 重新整理了前后端架构，移除了早期的 SecureChat 模拟通道，转而集中展示 **FHE（多算法全同态加密）** 与 **MPC（百万富翁协议 & Shamir 门限方案）** 的端到端链路。所有敏感操作均通过统一的 WebSocket 服务完成，并附带系统时钟与密钥轮换广播，便于课堂或演示场景实时追踪。

---

## 🔑 核心能力

- **多算法 FHE 引擎**：Paillier、RSA、ElGamal 三种算法同时在线，由 `backend/fhe_service.py` 统一调度，支持批量加密与云端 SUM/PRODUCT 计算。
- **5 分钟密钥轮换**：后台线程固定间隔刷新密钥对并广播 `KEY_ROTATED` 事件，同时返回服务器时钟，前端以倒计时方式可视化轮换周期。
- **MPC 控制台**：Shamir 秘密拆分/重构本地演示 + 通过 WebSocket 启动百万富翁协议，结果与传输层日志实时同步。
- **统一状态面板**：前端 FHE、MPC 页面均能订阅 `SERVER_TIME` 与最新公钥信息，展示 bit-length、Operation、下一次轮换时间等指标。

---

## 🧱 架构速览

```
┌──────────────┐     WebSocket (JSON 消息)     ┌────────────────────┐
│ React + Vite │  <-------------------------->  │ Python asyncio svc │
│ components/* │                                │ backend/main.py    │
└──────────────┘                                └────────────────────┘
     ▲   ▲                                               │
     │   └── socketSim.ts 统一管理连接与日志             │
     └──── FHE.tsx / MPC.tsx 共享服务时钟和密钥状态  ───┘
```

- 监听端口：`ws://<host>:8080`
- 主要模块：`backend/main.py`（WebSocket 路由）、`backend/fhe_service.py`（FHE 引擎）、`components/FHE.tsx`、`components/MPC.tsx`

---

## 🛰️ WebSocket 消息速查

| 类型                  | 方向        | 说明                                                                    |
| --------------------- | ----------- | ----------------------------------------------------------------------- |
| `GET_FHE_KEY`         | 前端 → 后端 | 请求指定算法的公钥与 `key_info`（包含倒计时）。                         |
| `BATCH_ENCRYPT`       | 前端 → 后端 | 发送 `{algorithm, values[]}`，返回 `ENCRYPTED_BATCH`。                  |
| `COMPUTE_FHE`         | 前端 → 后端 | 发送同态密文数组，收到 `COMPUTE_RESULT`（含 `operation` 与可选明文）。  |
| `SERVER_TIME`         | 后端 → 前端 | `GET_SERVER_TIME` 或轮换广播触发，提供 `timestamp` 与 `keys` 全量信息。 |
| `KEY_ROTATED`         | 后端 → 前端 | 每 5 分钟推送一次，提醒 UI 更新公钥、倒计时。                           |
| `MPC_GENERATE_SECRET` | 前端 → 后端 | 请求服务器生成 Bob 的秘密数值。                                         |
| `MPC_COMPARE_INIT`    | 前端 → 后端 | 发送 Alice 金额，返回 `MPC_COMPARE_RESULT`。                            |

SecureChat/ECDH/AES 相关消息已全部移除；若历史版本仍有 `CHAT_MESSAGE` 请求，请升级前端或停止调用。

---

## ⚙️ 部署步骤

### 1. 后端服务

```bash
cd backend
python -m venv .venv && .venv\Scripts\activate  # Windows 示例，可自行选择环境
pip install -r requirements.txt
python main.py  # 默认监听 0.0.0.0:8080，并输出 backend.log
# 或
nohup python3 main.py > backend.log 2>&1 & # 后台运行
```

### 2. 前端（Vite）

```bash
npm install
npm run dev     # 开发模式
# 或
npm run build && npm run preview
# 或
nohup npm run preview > frontend.log 2>&1 & # 后台运行
```

默认前端运行在 `http://localhost:5173/`（dev）或 `http://localhost:4173/`（preview）。如需对外访问，可通过 nginx 或 `npm run preview -- --host` 暴露。

---

## 📌 运维提醒

- 确认浏览器允许访问 `ws://<host>:8080`，否则 FHE/MPC 页面将保持离线状态并在日志面板提示。
- 如果需要调整密钥轮换周期，可修改 `FHEManager(rotation_interval=...)`，但前端仍会根据 `key_info.rotation_interval` 自动适配倒计时。
- 旧版数据库 (`backend/database.py`) 和 SecureChat 工具仅作为历史兼容占位，不再被 `main.py` 引用。

> 建议通过 Git 标签保留 v2.0 之前的 SecureChat 演示，如需对比教学，可在文档中指向该标签。当前主分支聚焦“多算法 FHE + MPC” 核心能力。

---

## 用户认证与数据库（v2.2 更新）

自 v2.2 起，项目新增了基础的用户认证与持久化存储，用于支持课程演示或多用户体验场景。我们在不改动现有 WebSocket 服务的前提下，引入了一个轻量的 HTTP REST API 层来处理用户注册、登录与会话管理。

- HTTP API 端口：`8081`（开发时与前端分离，生产部署可用反向代理统一域名）
- WebSocket 端口（不变）：`8080`（FHE / MPC 实时业务）

主要改动概要：
- 后端（`backend/`）
     - 新增并扩展 `backend/database.py`：使用 SQLite 存储用户信息（`users`）、会话 (`user_sessions`) 与原有 `messages` 表，密码使用 PBKDF2-SHA256 + 随机盐存储。
     - 在 `backend/main.py` 中可选启动 HTTP API（依赖 `aiohttp`），并新增以下端点：
          - `POST /api/auth/register` — 注册（请求体：`{username,password,email?}`）
          - `POST /api/auth/login` — 登录（请求体：`{username,password}`），返回 `token`
          - `POST /api/auth/logout` — 登出（Header: `Authorization: Bearer <token>`）
          - `GET /api/auth/profile` — 获取用户信息（Header: `Authorization: Bearer <token>`）
          - `GET /api/health` — 健康检查
     - `requirements.txt` 中新增 `aiohttp` 以支持 REST API（可选安装，若未安装程序仍可仅运行 WebSocket 服务）。

- 前端（React）
     - 新增 `getHttpUrl()` 与 `HTTP_PORT = 8081` 到 `config.ts`，前端登录组件会调用 `/api/auth/*` 接口完成注册/登录。
     - `App.tsx` 已集成认证流程：登录成功后将 `token` 与 `username` 保存到 `localStorage`，主界面（`Layout.tsx`）显示登录用户信息并提供登出按钮。

跨域（CORS）说明：
- 为了让前端开发服务器（例如 `http://localhost:3000`）能调用后端 HTTP API，我们在后端加入了简单的 CORS 中间件，允许来自 `http://localhost:3000` 的请求并处理浏览器的 OPTIONS 预检。如果你将前端部署到其他域名，请相应调整 `backend/main.py` 中的允许来源或使用反向代理进行统一域名部署。

安全与兼容性要点：
- 密码使用 PBKDF2-SHA256（100000 次迭代）+ 随机盐保存，避免明文或直接哈希存储。
- 会话使用随机生成的 URL-safe token（32 字节）存于数据库并返回给前端，前端通过 `Authorization: Bearer <token>` 使用受保护的接口。
- WebSocket 部分（FHE/MPC）未作修改，所有实时协议继续通过端口 `8080` 提供服务，保证向后兼容。

快速启动（关于认证的补充）

1. 启动后端（若计划使用 REST API，先安装 `aiohttp`）：

```powershell
cd backend
pip install -r requirements.txt
python main.py
```

2. 启动前端并访问登录界面：

```powershell
# 在项目根目录
npm install
npm run dev
# 访问示例： http://localhost:3000/ 或 README 中提到的 http://localhost:5173/（取决于本地配置）
```

排查提示：
- 如果在浏览器控制台或后端日志看到 `OPTIONS` 返回 405 或 CORS 错误，确认后端已安装并启用 `aiohttp`，并且后端日志中显示 HTTP API 启动（`HTTP API 服务器启动在端口 8081`）。
- 如果不希望使用单独的 HTTP 端口，可在生产中通过 Nginx/反向代理将 `8081` 的路径映射到同一域名下，从而避免 CORS 配置。

---

如果你需要，我可以把 README 中的“部署步骤”段落进一步扩展为分环境（开发 / 生产）说明，或加入 API 示例请求命令块与常见问题排查小节。
