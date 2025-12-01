<div align="center">

# 🔐 AliceCrypto 实验平台

[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Python-3.8+-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

**一个用于网络安全与密码学课程的综合实验演示平台**

前后端分离架构 | 安全通信 | 隐私保护外包计算

</div>

---

## 📖 项目简介

**AliceCrypto** 是一个交互式的密码学实验平台，旨在帮助学习者在浏览器中直观地理解和体验"安全通信"与"隐私保护外包计算"的核心流程。通过模拟真实的加密通信场景，学习者可以深入了解现代密码学协议的工作原理。

### ✨ 特性亮点

- 🌐 **全浏览器运行**：前端使用原生 WebCrypto API，无需安装额外软件
- 🔒 **真实加密算法**：ECDH 密钥交换、AES-256-GCM 加密、Paillier 同态加密
- 📡 **实时通信演示**：基于 WebSocket 的双向通信，展示完整握手流程
- 🎓 **教学友好**：清晰的代码结构，适合课程教学和自学

---

## 🧪 实验功能

### 实验一：安全通信仿真终端 (中级)

模拟 Alice 和 Bob（服务器）之间的即时通信，展示完整的安全握手流程：

| 功能 | 技术实现 | 说明 |
|------|---------|------|
| 🔗 通信协议 | WebSocket | 全双工实时通信 |
| 🔑 密钥协商 | ECDH (P-256) | 在不安全信道上协商共享密钥 |
| 🔐 数据加密 | AES-256-GCM | 确保消息的机密性和完整性 |
| 🧬 密钥派生 | HKDF (SHA-256) | 从共享秘密派生会话密钥 |

### 实验二：隐私保护外包计算 (高级)

模拟客户端将加密数据发送至云端进行计算，而云端无法获知原始数据：

| 功能 | 技术实现 | 说明 |
|------|---------|------|
| 🔢 同态加密 | Paillier | 支持密文上的加法运算 |
| ☁️ 外包计算 | 密文聚合 | 服务端仅处理密文，无法获取明文 |
| 🔓 结果解密 | 私钥解密 | 仅客户端可解密最终计算结果 |

---

## 🛠️ 技术栈

### 前端
- **框架**: React 18 + TypeScript
- **构建工具**: Vite 5
- **样式**: Tailwind CSS
- **加密**: 
  - WebCrypto API (ECDH / AES-GCM)
  - 自研 BigInt 实现 (Paillier 演示)

### 后端
- **语言**: Python 3.8+
- **通信**: websockets
- **加密**: cryptography, phe
- **存储**: SQLite3

---

## 🚀 快速开始

### 环境要求

- Node.js >= 18.0.0
- Python >= 3.8
- npm 或 yarn

### 本地开发

```bash
# 1. 克隆仓库
git clone https://github.com/Alic3r3L1cwhk/AliceCrypto-Lab.git
cd AliceCrypto-Lab

# 2. 启动后端
cd backend
pip install -r requirements.txt
python main.py

# 3. 启动前端（新终端）
cd ..
npm install
npm run dev
```

访问 `http://localhost:5173` 即可体验。

---

## ☁️ 服务器部署指南 (Ubuntu/Linux)

### 第一步：环境安装

```bash
# 更新系统并安装基础工具
sudo apt update && sudo apt upgrade -y

# 安装 Python3 和 pip
sudo apt install -y python3 python3-pip python3-venv

# 安装 Node.js v20 (LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 验证安装
node -v  # 应输出 v20.x.x
python3 --version  # 应输出 Python 3.8+
```

### 第二步：部署后端

```bash
cd backend

# 创建虚拟环境（推荐）
python3 -m venv venv
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 后台运行
nohup python3 main.py > backend.log 2>&1 &

# 检查运行状态
ps -ef | grep main.py
```

### 第三步：部署前端

```bash
cd ..

# 安装依赖并构建
npm install
npm run build

# 启动预览服务（监听 3000 端口）
nohup npm run preview > frontend.log 2>&1 &
```

### 第四步：配置防火墙

在云服务器控制台（安全组）中开放以下 **TCP** 端口：

| 端口 | 用途 |
|------|------|
| 3000 | 前端网页访问 |
| 8080 | 后端 WebSocket 通信 |

---

## ⚠️ 常见问题

<details>
<summary><b>🔴 浏览器提示 "密钥生成失败" 或 WebCrypto 报错</b></summary>

**原因**：现代浏览器禁止在非 HTTPS 协议下使用 `window.crypto.subtle` API。

**解决方法**：
1.  在 Chrome/Edge 地址栏输入：`chrome://flags/#unsafely-treat-insecure-origin-as-secure`
2. 在文本框中添加服务器地址，如：`http://你的服务器IP:3000`
3. 设置为 **Enabled** 并点击 **Relaunch** 重启浏览器

</details>

<details>
<summary><b>🔴 无法连接服务器</b></summary>

请依次检查：
- [ ] `backend.log` 是否有报错信息
- [ ] 云服务器安全组是否已放行 8080 端口
- [ ] 前端 `config.ts` 中的 IP 配置是否正确

</details>

<details>
<summary><b>🔴 同态加密解密结果错误</b></summary>

**原因**：JavaScript 处理超大整数时存在性能限制。

**建议**：单次输入数值不超过 **15 位数字**，以确保计算准确性。

</details>

---

## 📂 项目结构

```
AliceCrypto-Lab/
├── 📁 backend/              # Python 后端
│   ├── main.py              # 主程序入口
│   ├── requirements.txt     # Python 依赖
│   └── crypto_lab.db        # SQLite 数据库 (自动生成)
├── 📁 components/           # React UI 组件
├── 📁 lib/                  # 前端核心库
│   ├── paillier.ts          # Paillier 同态加密实现
│   └── socketSim.ts         # WebSocket 客户端封装
├── App.tsx                  # React 应用入口
├── config.ts                # 网络配置
├── index.html               # HTML 入口
├── package.json             # 前端依赖
├── tsconfig.json            # TypeScript 配置
├── vite.config.ts           # Vite 构建配置
└── README.md                # 项目文档
```

---

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支：`git checkout -b feature/AmazingFeature`
3. 提交更改：`git commit -m 'Add some AmazingFeature'`
4.  推送分支：`git push origin feature/AmazingFeature`
5. 提交 Pull Request

---

## 📄 开源协议

本项目采用 [MIT License](LICENSE) 开源协议。

---

<div align="center">

**Frontend powered by**

<img width="200" alt="Google AI Studio" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

Made with ❤️ for Cryptography Education

</div>
