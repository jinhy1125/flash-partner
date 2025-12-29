// server/server.js
require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" } // 允许任何来源连接
});

// 1. 连接 MongoDB
// 只有配置了环境变量才连接，方便本地开发如果不配也不报错
if (process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB Connected for Analytics'))
    .catch(err => console.error('Mongo Error:', err));
}

// 2. 定义一个简单的日志模型 (Schema)
// 注意：这里绝对不包含 contact 字段
const LogSchema = new mongoose.Schema({
  action: String,   // 'post' | 'grab' | 'expire'
  title: String,    // 标题可以存，用于分析关键词
  tags: [String],   // 标签
  duration: Number, // 存活时间(秒)
  timestamp: { type: Date, default: Date.now }
});

const AnalyticsLog = mongoose.model('AnalyticsLog', LogSchema);

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

  // === 旁路记录日志 (不 await，不阻塞主流程) ===
  // 我们只记录发生了“发布”这件事，不记录联系方式
  if (mongoose.connection.readyState === 1) {
    AnalyticsLog.create({
      action: 'post',
      title: title, // 也许你可以把标题里的敏感信息也过滤掉，看你需求
      timestamp: new Date()
    }).catch(e => console.error("Log error", e));
  }

  res.json({ success: true });
});

app.post('/api/grab', (req, res) => {
  const { taskId } = req.body;
  const record = memoryDb[taskId];
  const data = record?.data;

  if (!record) {
    return res.json({ success: false, message: "手慢了，任务已不存在！" });
  }

  // === 核心：抢单成功，销毁数据 ===
  clearTimeout(record.timer); // 清除定时器
  const realContact = data.contact; // 获取真实联系方式
  
  delete memoryDb[taskId]; // 从内存删除
  
  // 广播移除
  io.emit('remove_task', taskId);

  if (data) {
     const waitTime = (Date.now() - data.createdAt) / 1000; // 计算等待了多久

     // === 记录抢单成功数据 ===
     if (mongoose.connection.readyState === 1) {
       AnalyticsLog.create({
         action: 'grab',
         title: data.title,
         duration: waitTime, // 这个数据最值钱！比如 "平均 30s 被抢"
         timestamp: new Date()
       }).catch(e => console.error("Log error", e));
     }
  }

  res.json({ success: true, contact: realContact });
});

// 读取环境变量里的 PORT，如果没有（比如本地）则用 3001
const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});