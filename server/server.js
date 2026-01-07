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
  isOfficial: { type: Boolean, default: false }, // 新增：是否官方任务
  createdAt: Number, 
  expiresAt: Number  
});
const ActiveTask = mongoose.model('ActiveTask', ActiveTaskSchema);

// === 官方任务配置 ===
const OFFICIAL_TASKS = [
  {
    id: 'official_001',
    title: '📢 咔哒官方反馈 & 交流群',
    contact: 'data:image/jpeg;base64,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',
    tag: 'GENERAL',
    attributes: ['官方', '长期有效'],
    isOfficial: true,
    createdAt: Date.now(),
    expiresAt: 9999999999999 // 永不过期
  },
  {
    id: 'official_002',
    title: '🎮 LOL开黑群：一起开黑，快乐上分！',
    contact: 'data:image/jpeg;base64,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',
    tag: 'LOL',
    attributes: ['官方', '长期有效'],
    isOfficial: true,
    createdAt: Date.now(),
    expiresAt: 9999999999999
  }
];

// === 内存数据库 ===
// 结构: { id: { data, timer, ownerToken } }
const memoryDb = {}; 
const DEFAULT_TTL = 900; // 15分钟

// 确保官方任务存在
const ensureOfficialTasks = async () => {
  const now = Date.now();
  
  for (const task of OFFICIAL_TASKS) {
    // 1. 放入内存
    if (!memoryDb[task.id]) {
      memoryDb[task.id] = {
        data: task,
        ownerToken: 'OFFICIAL_TOKEN', // 特殊 token
        timer: null // 官方任务没有定时器
      };
    }

    // 2. 放入数据库 (如果连接了 Mongo 且不存在)
    if (mongoose.connection.readyState === 1) {
      const exists = await ActiveTask.findOne({ id: task.id });
      if (!exists) {
        await ActiveTask.create({ ...task, ownerToken: 'OFFICIAL_TOKEN' });
        console.log(`初始化官方任务: ${task.title}`);
      }
    }
  }
};

// --- 从 MongoDB 恢复数据 ---
const restoreFromMongo = async () => {
  if (mongoose.connection.readyState !== 1) return;

  try {
    const tasks = await ActiveTask.find({});
    const now = Date.now();
    let restoredCount = 0;

    tasks.forEach(task => {
      // 特殊处理官方任务
      if (task.isOfficial) {
         memoryDb[task.id] = {
            data: {
              id: task.id,
              title: task.title,
              contact: task.contact,
              tag: task.tag,
              attributes: task.attributes,
              isOfficial: true,
              createdAt: task.createdAt,
              expiresAt: task.expiresAt
            },
            ownerToken: task.ownerToken,
            timer: null
         };
         return;
      }

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
    // 官方任务永不过期
    if (memoryDb[id].data.isOfficial) return;

    delete memoryDb[id];
    io.emit('remove_task', id); // 广播过期
    
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
      ensureOfficialTasks();
    })
    .catch(err => console.error('Mongo Error:', err));
} else {
  // 即使没有 Mongo，也要加载内存版官方任务
  ensureOfficialTasks();
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
  
  // 官方任务不删除，直接返回
  if (data.isOfficial) {
    return res.json({ success: true, contact: realContact });
  }

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