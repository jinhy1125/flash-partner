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
  cors: { origin: "*" } 
});

// === MongoDB 定义 ===
// 1. 日志模型 (原有)
const LogSchema = new mongoose.Schema({
  action: String,   
  title: String,
  tag: String,      // 新增
  attributes: [String], // 新增
  tags: [String],   // 保留旧字段兼容，或废弃
  duration: Number, 
  timestamp: { type: Date, default: Date.now }
});
const AnalyticsLog = mongoose.model('AnalyticsLog', LogSchema);

// 2. 活跃任务模型 (新增，用于持久化)
const ActiveTaskSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: String,
  contact: String, // 真实联系方式存数据库
  ownerToken: String,
  tag: String,      // 新增：游戏/分类 Key
  attributes: [String], // 新增：属性数组
  createdAt: Number, 
  expiresAt: Number  
});
const ActiveTask = mongoose.model('ActiveTask', ActiveTaskSchema);

// === 内存数据库 ===
// 结构: { id: { data, timer, ownerToken } }
const memoryDb = {}; 
const DEFAULT_TTL = 900; // 15分钟

// --- 从 MongoDB 恢复数据 ---
const restoreFromMongo = async () => {
  if (mongoose.connection.readyState !== 1) return;

  try {
    const tasks = await ActiveTask.find({});
    const now = Date.now();
    let restoredCount = 0;

    tasks.forEach(task => {
      // 检查是否过期
      if (task.expiresAt <= now) {
        // 已过期，从库里删掉
        ActiveTask.deleteOne({ id: task.id }).catch(console.error);
        return;
      }

      // 恢复到内存
      const remainingTime = task.expiresAt - now;
      const timer = setTimeout(() => {
        handleExpire(task.id);
      }, remainingTime);

      memoryDb[task.id] = {
        data: {
          id: task.id,
          title: task.title,
          contact: task.contact,
          tag: task.tag,             // 恢复
          attributes: task.attributes, // 恢复
          createdAt: task.createdAt,
          expiresAt: task.expiresAt
        },
        ownerToken: task.ownerToken,
        timer: timer
      };
      restoredCount++;
    });
    console.log(`从 MongoDB 恢复了 ${restoredCount} 个活跃任务`);
  } catch (e) {
    console.error("恢复数据失败:", e);
  }
};

// 抽离过期处理逻辑
const handleExpire = (id) => {
  if (memoryDb[id]) {
    delete memoryDb[id];
    io.emit('remove_task', id); // 广播过期
    console.log(`任务 ${id} 自然过期`);
    
    // 同步从 Mongo 删除
    if (mongoose.connection.readyState === 1) {
      ActiveTask.deleteOne({ id }).catch(console.error);
    }
  }
};

// 连接数据库并启动恢复
if (process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI)
    .then(() => {
      console.log('MongoDB Connected');
      restoreFromMongo();
    })
    .catch(err => console.error('Mongo Error:', err));
}

io.on('connection', (socket) => {
  console.log('新用户连接:', socket.id);

  const broadcastUserCount = () => {
    const count = io.engine.clientsCount;
    io.emit('online_count', count);
  };
  broadcastUserCount();

  socket.on('request_active_tasks', () => {
    const tasks = Object.values(memoryDb).map(item => {
        const { contact, ...publicInfo } = item.data; 
        return { ...publicInfo, contact: "***" };
    });
    tasks.sort((a, b) => b.createdAt - a.createdAt);
    socket.emit('init_tasks', tasks);
  });

  socket.on('disconnect', () => {
    broadcastUserCount();
  });
});

app.post('/api/post', async (req, res) => {
  const { title, contact, tag, attributes } = req.body;
  const id = uuidv4();
  const ownerToken = uuidv4(); 
  const expiresAt = Date.now() + (DEFAULT_TTL * 1000);

  const taskData = {
    id,
    title,
    contact,
    tag: tag || 'OTHER', // 默认标签
    attributes: attributes || [],
    createdAt: Date.now(),
    expiresAt
  };

  // 1. 设置内存定时器
  const timer = setTimeout(() => {
    handleExpire(id);
  }, DEFAULT_TTL * 1000);

  // 2. 存入内存
  memoryDb[id] = { data: taskData, timer, ownerToken };

  // 3. 存入 MongoDB (持久化)
  if (mongoose.connection.readyState === 1) {
    try {
      await ActiveTask.create({ ...taskData, ownerToken });
    } catch (e) {
      console.error("Mongo Save Error:", e);
      // 就算存库失败，内存里有了也算成功，不阻断用户
    }
    
    // 记录统计日志
    AnalyticsLog.create({
      action: 'post',
      title: title,
      tag: tag,
      attributes: attributes,
      timestamp: new Date()
    }).catch(e => console.error("Log error", e));
  }

  // 4. 广播
  io.emit('new_task', { ...taskData, contact: "***" });

  res.json({ success: true, id, ownerToken });
});

app.post('/api/renew', async (req, res) => {
  const { taskId, ownerToken } = req.body;
  const record = memoryDb[taskId];

  if (!record) {
    return res.json({ success: false, message: "任务不存在或已过期" });
  }

  if (record.ownerToken !== ownerToken) {
    return res.json({ success: false, message: "无权操作" });
  }

  // 1. 更新内存
  clearTimeout(record.timer); 
  const newExpiresAt = Date.now() + (DEFAULT_TTL * 1000);
  record.data.expiresAt = newExpiresAt; 
  
  record.timer = setTimeout(() => {
    handleExpire(taskId);
  }, DEFAULT_TTL * 1000);

  // 2. 更新 MongoDB
  if (mongoose.connection.readyState === 1) {
    ActiveTask.updateOne({ id: taskId }, { expiresAt: newExpiresAt }).catch(console.error);
    
    // 也可以记录一个 'renew' 日志
    AnalyticsLog.create({
      action: 'renew',
      title: record.data.title,
      timestamp: new Date()
    }).catch(console.error);
  }

  io.emit('new_task', { ...record.data, contact: "***" });

  res.json({ success: true, newExpiresAt });
});

// 新增：主动取消/下架接口
app.post('/api/cancel', async (req, res) => {
  const { taskId, ownerToken } = req.body;
  const record = memoryDb[taskId];

  // 如果内存里没有，可能是已过期或已被抢
  if (!record) {
    return res.json({ success: true, message: "任务已不存在" });
  }

  // 验证身份
  if (record.ownerToken !== ownerToken) {
    return res.json({ success: true, message: "无权操作" });
  }

  // 执行删除
  clearTimeout(record.timer);
  delete memoryDb[taskId];

  if (mongoose.connection.readyState === 1) {
    ActiveTask.deleteOne({ id: taskId }).catch(console.error);
    // 记录日志
    AnalyticsLog.create({
      action: 'cancel',
      title: record.data.title,
      timestamp: new Date()
    }).catch(console.error);
  }

  io.emit('remove_task', taskId);
  res.json({ success: true });
});

app.post('/api/grab', async (req, res) => {
  const { taskId } = req.body;
  const record = memoryDb[taskId];
  const data = record?.data;

  if (!record) {
    return res.json({ success: false, message: "手慢了，任务已不存在！" });
  }

  clearTimeout(record.timer); 
  const realContact = data.contact; 
  
  delete memoryDb[taskId]; 
  
  // 从 MongoDB 删除
  if (mongoose.connection.readyState === 1) {
    ActiveTask.deleteOne({ id: taskId }).catch(console.error);
  }
  
  io.emit('remove_task', taskId);

  if (data) {
     const waitTime = (Date.now() - data.createdAt) / 1000; 
     if (mongoose.connection.readyState === 1) {
       AnalyticsLog.create({
         action: 'grab',
         title: data.title,
         duration: waitTime, 
         timestamp: new Date()
       }).catch(e => console.error("Log error", e));
     }
  }

  res.json({ success: true, contact: realContact });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});