import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import axios from 'axios';

// 自动判断后端地址
const BACKEND_URL = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:3001`;

const socket = io(BACKEND_URL);

function App() {
  const [tasks, setTasks] = useState([]);
  const [form, setForm] = useState({ title: '', contact: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [now, setNow] = useState(Date.now());
  
  // === 新增：控制介绍框的显示状态 ===
  const [showIntro, setShowIntro] = useState(false);

  // === 1. 初始化逻辑：检查用户是不是第一次来 ===
  useEffect(() => {
    // 从 localStorage 查看是否有标记
    const hasSeen = localStorage.getItem('hasSeenIntro');
    if (!hasSeen) {
      setShowIntro(true); // 没看过，弹窗
    }
  }, []);

  // === 关闭弹窗并记住 ===
  const closeIntro = () => {
    setShowIntro(false);
    localStorage.setItem('hasSeenIntro', 'true'); // 标记为已读
  };

  // ... Socket 和 倒计时 逻辑保持不变 ...
  useEffect(() => {
    socket.emit('request_active_tasks');
    socket.on('new_task', (task) => setTasks((prev) => [task, ...prev]));
    socket.on('init_tasks', (initTasks) => setTasks(initTasks));
    socket.on('remove_task', (id) => setTasks((prev) => prev.filter(t => t.id !== id)));
    return () => socket.off();
  }, []);

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
        alert(`抢单成功！\n联系方式: ${res.data.contact}\n(手慢无，数据已销毁)`);
      } else {
        alert(res.data.message);
      }
    } catch (e) { alert("网络错误"); }
  };

  const filteredTasks = tasks.filter(task => {
    if (!searchTerm) return true;
    return task.title.toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4 font-sans relative">
      
      {/* === 2. 介绍弹窗 (Modal) === */}
      {showIntro && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-800 rounded-2xl max-w-lg w-full border border-slate-700 shadow-2xl overflow-hidden">
            {/* 弹窗头部 */}
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-4">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                👋 欢迎来到闪电搭子
              </h2>
            </div>
            
            {/* 弹窗内容 */}
            <div className="p-6 space-y-6">
              
              {/* 核心玩法 */}
              <div className="space-y-2">
                <h3 className="text-blue-400 font-bold text-sm uppercase tracking-wider">核心玩法</h3>
                <p className="text-slate-300 text-sm leading-relaxed">
                  这是一个<span className="text-white font-bold">“阅后即焚”</span>的实时找人平台。
                  发布的任务 <span className="text-yellow-400">5分钟后自动消失</span>。
                  一旦有人点击“立即回应”，任务也会<span className="text-red-400">瞬间销毁</span>，
                  联系方式仅对抢单者可见。
                </p>
              </div>

              {/* 使用示例 */}
              <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700/50">
                <h3 className="text-green-400 font-bold text-sm uppercase tracking-wider mb-2">使用示例</h3>
                <div className="text-sm space-y-1">
                  <p><span className="text-slate-500">标题：</span> 黑色玫瑰 大乱斗缺1，来个猛男</p>
                  <p><span className="text-slate-500">联系：</span> V: SuperMan123</p>
                </div>
              </div>

              {/* 优化方向 (展示给用户看) */}
              <div className="space-y-2">
                <h3 className="text-purple-400 font-bold text-sm uppercase tracking-wider">🚧 正在施工 / 优化方向</h3>
                <ul className="text-xs text-slate-400 list-disc list-inside space-y-1">
                  <li>增加游戏分类标签 (LOL/瓦/云顶)</li>
                  <li>支持按大区/模式快捷筛选</li>
                  <li>手机端体验深度优化</li>
                  <li>防恶意抢单机制</li>
                </ul>
              </div>

              {/* 开始按钮 */}
              <button 
                onClick={closeIntro}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all active:scale-95"
              >
                我知道了，开始找人！
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-md mx-auto">
        {/* 顶部栏：标题 + 问号按钮 */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600">
            ⚡ 闪电搭子
          </h1>
          {/* 3. 再看一遍的按钮 */}
          <button 
            onClick={() => setShowIntro(true)}
            className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 flex items-center justify-center transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </div>
        
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
            placeholder="联系方式 (抢单后可见)" 
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

        {/* 搜索框 */}
        <div className="mb-4 relative sticky top-2 z-10">
           <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
             <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
             </svg>
           </div>
           <input 
             type="text"
             className="w-full pl-10 pr-4 py-2 bg-slate-800/90 backdrop-blur border border-slate-700 rounded-full text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-lg"
             placeholder="🔍 搜大区、模式... (自动过滤)"
             value={searchTerm}
             onChange={(e) => setSearchTerm(e.target.value)}
           />
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
            if (timeLeft === 0) return null;

            return (
              <div key={task.id} className="bg-slate-800 rounded-xl p-4 shadow-lg relative overflow-hidden border-l-4 border-green-400">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-lg pr-2 text-white">{task.title}</h3>
                  <span className="text-xs bg-slate-900/50 px-2 py-1 rounded text-red-400 font-mono">
                    {timeLeft}s
                  </span>
                </div>
                <button 
                  onClick={() => grabTask(task.id)}
                  className="w-full bg-green-500 active:bg-green-600 text-slate-900 font-bold py-2 rounded-lg mt-2 transition-colors"
                >
                  ⚡ 立即回应
                </button>
              </div>
            )
          })}
          {filteredTasks.length === 0 && (
            <div className="text-center text-slate-500 py-10">
              {searchTerm ? '没搜到，守株待兔中...' : '暂无任务，快来发一个！'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
export default App;