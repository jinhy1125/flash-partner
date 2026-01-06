# Partner App (咔哒 ⚡ 闪电搭子)

**项目概述**

这是一个用于短期互动的实时任务匹配平台。用户可以发布任务（例如寻找游戏搭子），这些任务会立即广播给所有连接的用户。
*   **时效性:** 任务在 5 分钟（300 秒）后自动过期并删除。
*   **一次性:** 一旦任务被用户“抢单”，它将立即从系统中移除，联系方式仅向抢单者展示。
*   **隐私保护:** 联系方式永远不会永久存储，并且在公共列表中是隐藏的。
*   **标签系统:** 支持基于游戏（LOL、瓦等）及大区、模式的多维度筛选。
*   **响应式设计:** 完美适配手机端与 PC 端（网格布局）。

**技术栈**

**前端 (`client/`)**
*   **框架:** React 19.2.0 + Vite 7.2.4
*   **样式:** Tailwind CSS 3.4.17
*   **通信:** Socket.io-client 4.8.3 (实时事件), Axios 1.13.2 (HTTP 请求)

**后端 (`server/`)**
*   **运行时:** Node.js
*   **框架:** Express 5.2.1
*   **实时通信:** Socket.io 4.8.3
*   **数据库:**
    *   **主存储:** 内存中的 JavaScript 对象 (用于活跃任务)。
    *   **分析 (可选):** MongoDB (Mongoose) 用于记录操作日志 (发布、抢单统计)，不存储敏感用户数据。

**项目结构**

```
partner-app/
├── client/                 # React 前端
│   ├── src/
│   │   ├── App.jsx         # 主要 UI 逻辑 (状态, Socket 监听, 弹窗)
│   │   ├── main.jsx        # 入口文件
│   │   └── assets/
│   ├── package.json
│   └── vite.config.js
├── server/                 # Express 后端
│   ├── server.js           # 单文件服务器 (API + Socket 逻辑)
│   ├── package.json
│   └── .env                # 环境变量 (PORT, MONGO_URI)
└── CLAUDE.md               # 原始项目上下文 (中文)
```

**设置与开发**

**1. 后端设置**
进入 `server` 目录并安装依赖：
```bash
cd server
npm install
```
*   **环境变量:** 创建一个 `.env` 文件 (可选)。
    *   `PORT`: 服务器端口 (默认: 3001)
    *   `MONGO_URI`: MongoDB 连接字符串 (可选，用于分析日志)

启动服务器：
```bash
node server.js
```

**2. 前端设置**
进入 `client` 目录并安装依赖：
```bash
cd client
npm install
```

启动开发服务器：
```bash
npm run dev
```
*   前端配置为将 API 请求代理到 `http://localhost:3001` (或配置的后端 URL)。
*   访问应用地址通常为 `http://localhost:5173` (或终端中显示的 IP)。

**核心功能与逻辑**

*   **任务生命周期:**
    1.  **发布 (Post):** 用户发送标题 + 联系方式。服务器生成 UUID，存入内存并开启 5 分钟计时器，同时向所有客户端广播（联系方式隐藏为 `***`）。
    2.  **过期 (Expire):** 如果 5 分钟过去，服务器删除任务并广播移除消息。
    3.  **抢单 (Grab):** 用户点击“立即回应”。服务器将联系方式返回给该用户，删除任务，取消计时器，并广播移除消息。
*   **实时更新:**
    *   `online_count`: 在用户加入/离开时广播当前连接总人数。
    *   `new_task`: 立即推送新发布的任务。
    *   `remove_task`: 立即移除已被抢或过期的任务。

**命令参考**

| 范围 | 命令 | 描述 |
| :--- | :--- | :--- |
| **Client** | `npm run dev` | 启动 Vite 开发服务器 |
| **Client** | `npm run build` | 构建生产版本 |
| **Client** | `npm run lint` | 运行 ESLint 代码检查 |
| **Server** | `node server.js` | 启动后端服务器 |