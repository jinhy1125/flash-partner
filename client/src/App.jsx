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

  // === 新增/修改：抢单结果状态 ===
  const [grabResult, setGrabResult] = useState(null); // 存放抢到的联系方式，null表示没抢
  const [isCopied, setIsCopied] = useState(false);    // 控制“已复制”的提示文字


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
        // 成功！把结果存入状态，触发弹窗
        setGrabResult(res.data.contact);
        setIsCopied(false); // 重置复制状态
      } else {
        alert(res.data.message);
      }
    } catch (e) { alert("网络错误"); }
  };

  // === 新增：复制功能 ===
  const handleCopy = () => {
    if (!grabResult) return;
    navigator.clipboard.writeText(grabResult).then(() => {
      setIsCopied(true);
      // 2秒后恢复按钮文字
      setTimeout(() => setIsCopied(false), 2000);
    }).catch(err => {
      alert("复制失败，请手动长按复制");
    });
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

      {/* === 2. 新增：抢单成功弹窗 (Success Modal) === */}
      {grabResult && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in">
          <div className="bg-slate-800 rounded-2xl w-full max-w-sm border border-green-500/50 shadow-[0_0_30px_rgba(34,197,94,0.3)] overflow-hidden transform transition-all scale-100">
            
            {/* 头部动画区 */}
            <div className="bg-gradient-to-br from-green-600 to-emerald-800 p-6 text-center">
              <div className="text-4xl mb-2">🎉</div>
              <h2 className="text-2xl font-black text-white tracking-wider">抢单成功！</h2>
              <p className="text-green-100 text-xs mt-1 opacity-80">手速很快，对方正在等你</p>
            </div>

            {/* 内容区 */}
            <div className="p-6 space-y-6">
              <div className="space-y-2">
                <label className="text-slate-400 text-xs font-bold uppercase tracking-wider">对方联系方式</label>
                
                {/* 大号文字显示区域 */}
                <div className="bg-black/40 p-4 rounded-lg border border-slate-700 text-center relative group">
                  <p className="text-xl font-mono font-bold text-green-400 break-all select-all">
                    {grabResult}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1">（长按也可手动复制）</p>
                </div>
              </div>

              {/* 按钮组 */}
              <div className="grid grid-cols-2 gap-3">
                {/* 复制按钮 */}
                <button 
                  onClick={handleCopy}
                  className={`col-span-2 py-3 rounded-xl font-bold text-slate-900 transition-all flex items-center justify-center gap-2 ${
                    isCopied 
                    ? 'bg-green-400 cursor-default' 
                    : 'bg-white hover:bg-slate-200 active:scale-95'
                  }`}
                >
                  {isCopied ? (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      已复制
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                      一键复制
                    </>
                  )}
                </button>

                {/* 关闭按钮 */}
                <button 
                  onClick={() => setGrabResult(null)}
                  className="col-span-2 py-3 rounded-xl font-bold text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                >
                  关闭
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      <div className="max-w-md mx-auto">
        {/* 顶部栏：标题 + 问号按钮 */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600">
            咔哒 ⚡ 闪电搭子
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