import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import axios from 'axios';

// 自动判断后端地址
const BACKEND_URL = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:3001`;

const socket = io(BACKEND_URL);

function App() {
  const [tasks, setTasks] = useState([]);
  const [form, setForm] = useState({ title: '', contact: '' });
  const [isPublishing, setIsPublishing] = useState(false); 
  const [searchTerm, setSearchTerm] = useState('');
  const [now, setNow] = useState(Date.now());
  const [showIntro, setShowIntro] = useState(false);
  const [showPostModal, setShowPostModal] = useState(false);
  const [grabResult, setGrabResult] = useState(null); 
  const [isCopied, setIsCopied] = useState(false);    
  const [onlineCount, setOnlineCount] = useState(0);

  // === 我的任务 (用于续命/顶替) { taskId: token } ===
  const [myTasks, setMyTasks] = useState(() => {
    try {
      const saved = localStorage.getItem('my_tasks_v1');
      return saved ? JSON.parse(saved) : {}; 
    } catch (e) { return {}; }
  });

  useEffect(() => {
    localStorage.setItem('my_tasks_v1', JSON.stringify(myTasks));
  }, [myTasks]);

  useEffect(() => {
    const hasSeen = localStorage.getItem('hasSeenIntro');
    if (!hasSeen) setShowIntro(true);
  }, []);

  const closeIntro = () => {
    setShowIntro(false);
    localStorage.setItem('hasSeenIntro', 'true'); 
  };

  useEffect(() => {
    socket.emit('request_active_tasks');
    socket.on('new_task', (task) => setTasks((prev) => {
      const filtered = prev.filter(t => t.id !== task.id);
      return [task, ...filtered];
    }));
    socket.on('init_tasks', (initTasks) => setTasks(initTasks));
    socket.on('remove_task', (id) => {
      setTasks((prev) => prev.filter(t => t.id !== id));
      // 如果我自己的任务被删了（比如被人抢了或过期了），清理本地
      setMyTasks(prev => {
        if (!prev[id]) return prev;
        const copy = {...prev};
        delete copy[id];
        return copy;
      });
    });
    socket.on('online_count', (count) => setOnlineCount(count));
    return () => socket.off();
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // === 逻辑修改：发布前先取消旧任务 (顶替) ===
  const postTask = async () => {
    if(!form.title || !form.contact) return alert("请填写完整");
    setIsPublishing(true);

    try {
      // 1. 顶替机制：如果本地存有旧任务，先调用取消
      const oldTaskIds = Object.keys(myTasks);
      for (const id of oldTaskIds) {
        try {
          await axios.post(`${BACKEND_URL}/api/cancel`, { 
            taskId: id, 
            ownerToken: myTasks[id] 
          });
        } catch (err) { console.error("取消旧任务失败:", err); }
      }

      // 2. 发布新任务
      const res = await axios.post(`${BACKEND_URL}/api/post`, form);
      if (res.data.success) {
        setForm({ title: '', contact: '' });
        setShowPostModal(false); 
        
        // 3. 清空旧记录，保存新凭证 (保证本地只有一个任务)
        setMyTasks({ [res.data.id]: res.data.ownerToken });
      }
    } catch (e) { 
      alert("发布失败，网络错误或后端异常"); 
    } finally {
      setIsPublishing(false);
    }
  };

  const grabTask = async (taskId) => {
    try {
      const res = await axios.post(`${BACKEND_URL}/api/grab`, { taskId });
      if (res.data.success) {
        setGrabResult(res.data.contact);
        setIsCopied(false); 
      } else {
        alert(res.data.message);
      }
    } catch (e) { alert("网络错误"); }
  };

  const renewTask = async (taskId) => {
    const token = myTasks[taskId];
    if (!token) return;
    try {
      const res = await axios.post(`${BACKEND_URL}/api/renew`, { taskId, ownerToken: token });
      if (!res.data.success) alert(res.data.message || "续命失败");
    } catch (e) { alert("网络错误"); }
  }

  // === 新增：主动取消逻辑 ===
  const cancelTask = async (taskId) => {
    const token = myTasks[taskId];
    if (!token) return;
    if (!window.confirm("确定要下架这个任务吗？")) return;

    try {
      const res = await axios.post(`${BACKEND_URL}/api/cancel`, { taskId, ownerToken: token });
      if (res.data.success) {
        setMyTasks(prev => {
          const copy = {...prev};
          delete copy[taskId];
          return copy;
        });
      }
    } catch (e) { alert("网络错误"); }
  }

  const handleCopy = () => {
    if (!grabResult) return;
    navigator.clipboard.writeText(grabResult).then(() => {
      setIsCopied(true);
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
      
      {/* === 介绍弹窗 === */}
      {showIntro && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-800 rounded-2xl max-w-lg w-full border border-slate-700 shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-4">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                👋 欢迎来到咔哒 ⚡ 闪电搭子
              </h2>
            </div>
            <div className="p-6 space-y-6">
              <div className="space-y-2">
                <h3 className="text-blue-400 font-bold text-sm uppercase tracking-wider">核心玩法</h3>
                <p className="text-slate-300 text-sm leading-relaxed">
                  这是一个<span className="text-white font-bold">“阅后即焚”</span>的实时找活人平台。
                  发布的任务 <span className="text-yellow-400">15分钟后自动消失</span>。
                  一旦有人点击“立即回应”，任务也会<span className="text-red-400">瞬间销毁</span>，
                  联系方式仅对抢单者可见。
                </p>
              </div>
              <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700/50">
                <h3 className="text-green-400 font-bold text-sm uppercase tracking-wider mb-2">使用示例</h3>
                <div className="text-sm space-y-1">
                  <p><span className="text-slate-500">标题：</span> 黑色玫瑰 大乱斗缺1，来个猛男</p>
                  <p><span className="text-slate-500">联系：</span> V: SuperMan123</p>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-700/50">
                <h3 className="text-slate-500 font-bold text-xs uppercase tracking-wider mb-3">
                  🐛 反馈 & 联系作者
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-700/50 flex items-center gap-3">
                    <div className="bg-green-500/10 p-2 rounded-lg text-green-500">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8.5,13.5A1.5,1.5 0 1,0 7,12,1.5,1.5,0 0,0 8.5,13.5Zm7,0a1.5,1.5,0 1,0-1.5-1.5A1.5,1.5,0 0,0 15.5,13.5Zm4.8-6.3C20.3,3.7,16.5,1,12,1S3.7,3.7,3.7,7.2c0,1.9,1.1,3.7,3,4.8L6.2,14l2.6-1.4a8.6,8.6,0,0,0,3.2.6,9.2,9.2,0,0,0,1.8-.2l.7,3.5,3.3-1.8A7.6,7.6,0,0,0,22,9.7C22,8.9,21.4,8,20.3,7.2ZM12,11.8a8,8,0,0,1-1.3.1,7.3,7.3,0,0,1-2.8-.5L5.4,12.7,6,10.9A5.6,5.6,0,0,1,4.7,7.2C4.7,4.3,8,2,12,2s7.3,2.3,7.3,5.2S16,12.4,12,11.8Z"/></svg>
                    </div>
                    <div className="overflow-hidden">
                      <div className="text-[10px] text-slate-500">微信号</div>
                      <div className="text-white text-sm font-mono font-bold select-all truncate">away_y_y</div>
                    </div>
                  </div>
                  <a href="mailto:603132073@qq.com" className="bg-slate-900/50 p-3 rounded-lg border border-slate-700/50 flex items-center gap-3 hover:bg-slate-800 transition-colors group">
                    <div className="bg-blue-500/10 p-2 rounded-lg text-blue-500 group-hover:scale-110 transition-transform">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    </div>
                    <div className="overflow-hidden">
                      <div className="text-[10px] text-slate-500">发送邮件</div>
                      <div className="text-white text-sm font-mono font-bold truncate">603132073@qq.com</div>
                    </div>
                  </a>
                </div>
              </div>
              <button onClick={closeIntro} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all active:scale-95">
                我知道了，开始找人！
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === 发布弹窗 === */}
      {showPostModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in">
          <div className="bg-slate-800 rounded-2xl w-full max-w-sm border border-slate-700 shadow-2xl overflow-hidden transform transition-all scale-100">
            <div className="bg-slate-900 p-4 border-b border-slate-700 flex justify-between items-center">
              <h2 className="text-lg font-bold text-white">⚡ 发布新搭子</h2>
              <button onClick={() => setShowPostModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-xs text-slate-400 uppercase font-bold tracking-wider ml-1">标题 / 描述</label>
                <input 
                  className="w-full p-3 bg-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="例: 艾欧尼亚 灵活缺2" 
                  autoFocus
                  value={form.title}
                  onChange={e => setForm({...form, title: e.target.value})}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400 uppercase font-bold tracking-wider ml-1">联系方式 (抢后可见)</label>
                <input 
                  className="w-full p-3 bg-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="例: V: my_wechat_id" 
                  value={form.contact}
                  onChange={e => setForm({...form, contact: e.target.value})}
                />
              </div>
              <div className="pt-2">
                <button 
                  onClick={postTask}
                  disabled={isPublishing}
                  className={`w-full font-bold py-3 rounded-lg transition-all flex items-center justify-center gap-2 ${
                    isPublishing 
                      ? 'bg-slate-600 cursor-not-allowed opacity-80' 
                      : 'bg-blue-600 active:bg-blue-700 hover:bg-blue-500 text-white'
                  }`}
                >
                  {isPublishing ? (
                    <>
                      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      正在顶替旧任务...
                    </>
                  ) : (
                    "确认发布 (15分钟后消失)"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === 抢单成功弹窗 === */}
      {grabResult && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in">
          <div className="bg-slate-800 rounded-2xl w-full max-w-sm border border-green-500/50 shadow-[0_0_30px_rgba(34,197,94,0.3)] overflow-hidden transform transition-all scale-100">
            <div className="bg-gradient-to-br from-green-600 to-emerald-800 p-6 text-center">
              <div className="text-4xl mb-2">🎉</div>
              <h2 className="text-2xl font-black text-white tracking-wider">抢单成功！</h2>
              <p className="text-green-100 text-xs mt-1 opacity-80">手速很快，对方正在等你</p>
            </div>
            <div className="p-6 space-y-6">
              <div className="space-y-2">
                <label className="text-slate-400 text-xs font-bold uppercase tracking-wider">对方联系方式</label>
                <div className="bg-black/40 p-4 rounded-lg border border-slate-700 text-center relative group">
                  <p className="text-xl font-mono font-bold text-green-400 break-all select-all">{grabResult}</p>
                  <p className="text-[10px] text-slate-500 mt-1">（长按也可手动复制）</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
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

      <div className="max-w-md mx-auto pb-24">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600">
            咔哒 ⚡ 闪电搭子
          </h1>
          <button 
            onClick={() => setShowIntro(true)}
            className="w-9 h-9 rounded-full bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 flex items-center justify-center transition shadow-lg border border-slate-700/50"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </div>
        
        <div className="flex items-center gap-2 mt-2 ml-1 mb-6">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
          </span>
          <span className="text-xs text-slate-400 font-medium font-mono">
            <span className="text-green-400 font-bold text-sm mr-1">{onlineCount}</span>
            人正在蹲搭子
          </span>
        </div>
        
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

        <div className="space-y-4">
          {filteredTasks.map(task => {
            const timeLeft = Math.max(0, Math.floor((task.expiresAt - now) / 1000));
            if (timeLeft === 0) return null;

            const isMyTask = !!myTasks[task.id];

            return (
              <div key={task.id} className={`bg-slate-800 rounded-xl p-4 shadow-lg relative overflow-hidden border-l-4 ${isMyTask ? 'border-yellow-400' : 'border-green-400'}`}>
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-lg pr-2 text-white">{task.title}</h3>
                  <span className={`text-xs px-2 py-1 rounded font-mono ${timeLeft < 60 ? 'bg-red-500/20 text-red-400 animate-pulse' : 'bg-slate-900/50 text-slate-400'}`}>
                    {Math.floor(timeLeft / 60)}分{timeLeft % 60}秒
                  </span>
                </div>
                
                {isMyTask ? (
                  <div className="flex flex-col gap-2 mt-2">
                    <button 
                      onClick={() => renewTask(task.id)}
                      className="w-full bg-yellow-500 active:bg-yellow-600 hover:bg-yellow-400 text-slate-900 font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                      手动续命 (重置15分钟)
                    </button>
                    {/* 主动删除按钮 */}
                    <button 
                      onClick={() => cancelTask(task.id)}
                      className="w-full bg-slate-700 hover:bg-slate-600 text-slate-300 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    >
                      🗑️ 撤回 / 下架
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => grabTask(task.id)}
                    className="w-full bg-green-500 active:bg-green-600 hover:bg-green-400 text-slate-900 font-bold py-2 rounded-lg mt-2 transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    立即回应
                  </button>
                )}
                
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

      <button 
        onClick={() => setShowPostModal(true)}
        className="fixed bottom-8 right-6 px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-full shadow-[0_8px_25px_rgba(37,99,235,0.4)] flex items-center justify-center gap-2 transition-all hover:scale-105 active:scale-95 z-50 group border border-blue-400/30"
      >
        <svg className="w-6 h-6 group-hover:rotate-90 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
        </svg>
        <span className="font-black text-lg tracking-wider">找搭子！！</span>
        <span className="absolute inset-0 rounded-full bg-blue-400 opacity-20 animate-ping pointer-events-none"></span>
      </button>

    </div>
  );
}
export default App;