// client/src/App.jsx
import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import axios from 'axios';

// 如果配置了环境变量 VITE_API_URL 就用它，否则（本地开发）自动判断
const BACKEND_URL = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:3001`;

const socket = io(BACKEND_URL);

function App() {
  const [tasks, setTasks] = useState([]);
  const [form, setForm] = useState({ title: '', contact: '' });
  
  // 搜索关键词状态
  const [searchTerm, setSearchTerm] = useState(''); 

  useEffect(() => {
    socket.emit('request_active_tasks');

    socket.on('new_task', (task) => {
      setTasks((prev) => [task, ...prev]);
    });

    socket.on('init_tasks', (initTasks) => {
      setTasks(initTasks);
    });

    socket.on('remove_task', (id) => {
      setTasks((prev) => prev.filter(t => t.id !== id));
    });

    return () => socket.off();
  }, []);

  // 倒计时刷新器 (UI显示用)
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const postTask = async () => {
    if(!form.title || !form.contact) return alert("请填写完整");
    try {
      await axios.post(`${BACKEND_URL}/api/post`, form);
      setForm({ title: '', contact: '' });
    } catch (e) { alert("发布失败，后端没开？"); }
  };

  const grabTask = async (taskId) => {
    try {
      const res = await axios.post(`${BACKEND_URL}/api/grab`, { taskId });
      if (res.data.success) {
        alert(`抢单成功！\n对方联系方式: ${res.data.contact}\n(请尽快联系，数据已销毁)`);
      } else {
        alert(res.data.message);
      }
    } catch (e) { alert("网络错误"); }
  };
  
  // 过滤逻辑 (核心)
  // 只要标题里包含了搜索词（不区分大小写），就留下来
  const filteredTasks = tasks.filter(task => {
    if (!searchTerm) return true; // 没搜东西显示全部
    return task.title.toLowerCase().includes(searchTerm.toLowerCase());
  });
  
  return (
    <div className="min-h-screen bg-slate-900 text-white p-4 font-sans">
      <div className="max-w-md mx-auto">
        <h1 className="text-3xl font-black mb-6 text-center text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600">
          咔哒 ⚡ 闪电搭子
        </h1>
        
        {/* 发布框 */}
        <div className="bg-slate-800 p-4 rounded-xl mb-6 shadow-xl border border-slate-700">
          <input 
            className="w-full p-3 mb-3 bg-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="找什么搭子？(例: 大乱斗缺1)" 
            value={form.title}
            onChange={e => setForm({...form, title: e.target.value})}
          />
          <input 
            className="w-full p-3 mb-3 bg-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="你的联系方式 (别人抢单后可见)" 
            value={form.contact}
            onChange={e => setForm({...form, contact: e.target.value})}
          />
          <button 
            onClick={postTask}
            className="w-full bg-blue-600 active:bg-blue-700 text-white font-bold py-3 rounded-lg transition-colors"
          >
            发布 (5分钟后消失)
          </button>
        </div>

        {/* 搜索框区域 */}
        <div className="mb-4 relative sticky top-2 z-50 shadow-lg">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            {/* 放大镜图标 */}
            <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input 
            type="text"
            className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-full text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            placeholder="🔍 搜大区、模式... (例: 黑色玫瑰)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {/* 如果有内容，显示清空按钮 */}
          {searchTerm && (
            <button 
              onClick={() => setSearchTerm('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white"
            >
              ✕
            </button>
          )}
        </div>


        {/* 任务列表 */}
        <div className="space-y-4">
          {filteredTasks.map(task => {
            const timeLeft = Math.max(0, Math.floor((task.expiresAt - now) / 1000));
            if (timeLeft === 0) return null; // 前端双重过滤

            return (
              <div key={task.id} className="bg-slate-800 rounded-xl p-4 shadow-lg relative overflow-hidden border-l-4 border-green-400 animate-fade-in-down">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-lg pr-2">{task.title}</h3>
                  <span className="text-xs bg-slate-700 px-2 py-1 rounded text-red-400 font-mono">
                    {timeLeft}s
                  </span>
                </div>
                <button 
                  onClick={() => grabTask(task.id)}
                  className="w-full bg-green-500 active:bg-green-600 text-slate-900 font-bold py-2 rounded-lg mt-2"
                >
                  ⚡ 立即回应
                </button>
              </div>
            )
          })}
          {filteredTasks.length === 0 && (
            <div className="text-center text-slate-500 py-10">
              {searchTerm ? `没有找到 "${searchTerm}" 相关的搭子` : '这里空空如也...'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
export default App;