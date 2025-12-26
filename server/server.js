// server/server.js
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" } // 允许任何来源连接
});

// === 内存数据库 (替代 Redis) ===
// 结构: { id: { data, timer } }
const memoryDb = {}; 
const DEFAULT_TTL = 300; // 300秒

io.on('connection', (socket) => {
  console.log('新用户连接:', socket.id);
  
  // 发送当前存活任务
  socket.on('request_active_tasks', () => {
    const tasks = Object.values(memoryDb).map(item => {
        // 过滤掉敏感信息
        const { contact, timer, ...publicInfo } = item.data; 
        return { ...publicInfo, contact: "***" };
    });
    socket.emit('init_tasks', tasks);
  });
});

app.post('/api/post', (req, res) => {
  const { title, contact } = req.body;
  const id = uuidv4();
  const expiresAt = Date.now() + (DEFAULT_TTL * 1000);

  const taskData = {
    id,
    title,
    contact,
    createdAt: Date.now(),
    expiresAt
  };

  // 设置自动过期定时器
  const timer = setTimeout(() => {
    if (memoryDb[id]) {
      delete memoryDb[id];
      io.emit('remove_task', id); // 广播过期
      console.log(`任务 ${id} 自然过期`);
    }
  }, DEFAULT_TTL * 1000);

  // 存入内存
  memoryDb[id] = { data: taskData, timer };

  // 广播新任务 (隐藏联系方式)
  io.emit('new_task', { ...taskData, contact: "***" });

  res.json({ success: true });
});

app.post('/api/grab', (req, res) => {
  const { taskId } = req.body;
  const record = memoryDb[taskId];

  if (!record) {
    return res.json({ success: false, message: "手慢了，任务已不存在！" });
  }

  // === 核心：抢单成功，销毁数据 ===
  clearTimeout(record.timer); // 清除定时器
  const realContact = record.data.contact; // 获取真实联系方式
  
  delete memoryDb[taskId]; // 从内存删除
  
  // 广播移除
  io.emit('remove_task', taskId);

  res.json({ success: true, contact: realContact });
});

// 读取环境变量里的 PORT，如果没有（比如本地）则用 3001
const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});