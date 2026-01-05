# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在处理此代码库时提供指导。

## 项目概述

这是一个**实时任务匹配平台**，名为"咔哒 ⚡ 闪电搭子"。这是一个全栈应用，前端使用 React/Vite，后端使用 Express/Socket.io，用户可以发布有时效性的任务，其他人可以"抢单"。任务会在 5 分钟后自动过期，一旦被抢，就会从系统中永久删除。

### 核心功能
- **实时任务发布**：任务发布后立即显示给所有连接的用户
- **5分钟过期**：任务会在 5 分钟（300 秒）后自动删除
- **一次性抢单**：任务被抢后销毁，只有抢单者能看到联系方式
- **在线人数显示**：显示当前连接的人数
- **数据分析**：可选的 MongoDB 集成，用于记录操作（发布、抢单、过期），不存储敏感联系信息

## 架构

### 项目结构
```
partner-app/
├── client/          # React + Vite 前端
│   ├── src/
│   │   ├── App.jsx  # 主组件，包含所有 UI 逻辑
│   │   └── main.jsx # 入口文件
│   └── package.json
└── server/          # Express + Socket.io 后端
    ├── server.js    # 主服务器，包含 socket 处理器和 API
    └── package.json
```

### 技术栈

**前端:**
- React 19.2.0
- Vite 7.2.4 (构建工具)
- Tailwind CSS 3.4.17 (样式)
- Socket.io-client 4.8.3 (实时通信)
- Axios 1.13.2 (HTTP 请求)

**后端:**
- Express 5.2.1 (Web 框架)
- Socket.io 4.8.3 (WebSocket 服务器)
- MongoDB/Mongoose 9.0.2 (可选数据分析)
- UUID 13.0.0 (任务 ID 生成)
- CORS 2.8.5
- Dotenv 17.2.3

## 开发命令

### 启动应用

**后端 (Server):**
```bash
cd server
# 确保 .env 文件存在，如果使用数据分析需要配置 MONGO_URI
node server.js
# 服务器默认运行在 PORT 3001 (或 process.env.PORT)
```

**前端 (Client):**
```bash
cd client
npm run dev
# 默认运行在 http://localhost:5173
# 开发服务器绑定到 192.168.1.15 (在 package.json 中配置)
```

### 其他命令

**Client:**
```bash
cd client
npm run build      # 生产环境构建
npm run lint       # 运行 ESLint
npm run preview    # 预览生产构建
```

**Server:**
```bash
cd server
# 没有配置构建/测试脚本
# 直接运行: node server.js
```

## 数据流与架构细节

### 内存数据库 (In-Memory Store)
服务器使用 JavaScript 对象作为内存数据库，替代 Redis：
```javascript
// 结构: { id: { data, timer } }
const memoryDb = {};
```

**任务数据结构:**
```javascript
{
  id: "uuid",
  title: "任务标题",
  contact: "联系方式",  // 敏感信息，对其他用户隐藏
  createdAt: timestamp,
  expiresAt: timestamp
}
```

### 实时通信 (Socket.io)

**事件:**
- `connection` - 用户连接，触发 `online_count` 广播
- `request_active_tasks` - 客户端请求当前任务列表
- `new_task` - 任务发布时广播 (联系方式隐藏为 `"***"`)
- `init_tasks` - 发送给请求客户端的初始任务列表
- `remove_task` - 任务被抢或过期时广播
- `online_count` - 当前连接的客户端数量

### API 端点

**POST /api/post**
- 请求体: `{ title, contact }`
- 创建 5 分钟 TTL 的任务
- 向所有客户端广播 `new_task`
- 可选：记录到 MongoDB (action: 'post')

**POST /api/grab**
- 请求体: `{ taskId }`
- 返回 `{ success, contact }` 或 `{ success: false, message }`
- 从内存中删除任务
- 广播 `remove_task`
- 可选：记录到 MongoDB (action: 'grab', duration: 等待时间)

### 安全与隐私

**联系方式保护:**
1. **永不存储在数据库** - 仅保存在内存中直到被抢
2. **广播中隐藏** - 所有 socket 广播使用 `contact: "***"`
3. **一次性显示** - 只有抢单者能看到真实联系方式
4. **自动删除** - 任务在 5 分钟后自动过期

**MongoDB 数据分析:**
- 仅存储: `action`, `title`, `tags`, `duration`, `timestamp`
- **永不存储** 联系方式
- 用于分析使用模式和平均抢单时间

### 环境变量

**Server (.env):**
```
MONGO_URI=mongodb+srv://...  # 可选，用于数据分析
PORT=3001                     # 可选，默认 3001
```

**Client (.env):**
```
VITE_API_URL=...  # 可选，默认 http://localhost:3001
```

## 关键实现说明

### 前端 (App.jsx)

**状态管理:**
- `tasks` - 活跃任务数组
- `form` - 发布表单数据 (标题, 联系方式)
- `isPublishing` - 发布按钮的加载状态
- `grabResult` - 存储抢到的联系方式用于弹窗显示
- `onlineCount` - 实时用户计数
- `showIntro` - 首次用户教程弹窗

**UI 组件:**
1. **介绍弹窗** - 通过 localStorage 只显示一次
2. **抢单成功弹窗** - 显示抢到的联系方式和复制按钮
3. **发布表单** - 标题 + 联系方式输入框，带加载状态
4. **搜索筛选** - 实时筛选任务
5. **任务列表** - 带倒计时和抢单按钮的任务卡片

### 后端 (server.js)

**TTL 管理:**
```javascript
// 5 分钟后自动过期
const timer = setTimeout(() => {
  delete memoryDb[id];
  io.emit('remove_task', id);
}, DEFAULT_TTL * 1000);
```

**抢单逻辑:**
1. 检查任务是否存在
2. 清除过期定时器
3. 提取真实联系方式
4. 从内存中删除
5. 广播移除
6. 记录数据分析 (如果 MongoDB 已连接)
7. 返回联系方式给请求者

## 常见开发任务

### 添加新功能
- **游戏标签/分类**: 添加到任务数据结构和 UI 筛选器
- **用户认证**: 需要会话管理
- **速率限制**: 在 `/api/post` 和 `/api/grab` 上实现
- **持久化存储**: 用 Redis 替换 memoryDb 以支持多服务器

### 调试
- 检查服务器控制台的 socket 连接日志
- 监控服务器内存中的 `memoryDb` 对象
- 使用浏览器开发工具观察 Socket.io 事件
- 验证 MongoDB 连接状态: `mongoose.connection.readyState === 1`

### 测试
- 未配置测试套件
- 手动测试：打开多个浏览器标签模拟多个用户
- 测试过期：发布任务，等待 5 分钟
- 测试抢单竞争：多个用户尝试抢同一个任务

## 重要文件

- `server/server.js` - 所有后端逻辑 (socket 处理器, API, 内存 DB)
- `client/src/App.jsx` - 所有前端逻辑 (UI, 状态, socket 事件)
- `client/tailwind.config.js` - 样式配置
- `server/.env` - MongoDB 连接字符串 (不提交)

## 未来开发注意事项

1. **无 TypeScript** - 全是 JavaScript，考虑添加类型以提高可扩展性
2. **无验证** - 标题/联系方式字段没有输入清理
3. **单文件架构** - 每边所有逻辑在一个文件中，考虑拆分
4. **无错误边界** - 客户端错误可能导致应用崩溃
5. **Socket.io 版本** - 使用 v4.8.3，检查更新
6. **React 19** - 最新 React，确保与库兼容
