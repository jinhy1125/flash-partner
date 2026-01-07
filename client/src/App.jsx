import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import { GAME_CONFIG } from './constants'; // 引入配置文件

// 自动判断后端地址
const BACKEND_URL = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:3001`;

const socket = io(BACKEND_URL);

function App() {
  const [tasks, setTasks] = useState([]);
  
  const [form, setForm] = useState(() => ({ 
    title: '', 
    contact: localStorage.getItem('saved_contact') || '', 
    tag: 'LOL', 
    attributes: [] 
  }));

  useEffect(() => {
    localStorage.setItem('saved_contact', form.contact);
  }, [form.contact]);
  
  const [isPublishing, setIsPublishing] = useState(false); 
  
  // === 筛选状态 ===
  const [activeTab, setActiveTab] = useState('ALL'); 
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAttrs, setSelectedAttrs] = useState([]);
  
  const [now, setNow] = useState(Date.now());
  const [showIntro, setShowIntro] = useState(false);
  const [showPostModal, setShowPostModal] = useState(false);
  const [grabResult, setGrabResult] = useState(null); 
  const [isCopied, setIsCopied] = useState(false);    
  const [onlineCount, setOnlineCount] = useState(0);
  const [isInitialLoading, setIsInitialLoading] = useState(true); // 新增加载状态

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
    socket.on('init_tasks', (initTasks) => {
      setTasks(initTasks);
      setIsInitialLoading(false); // 收到初始数据，关闭加载
    });
    socket.on('remove_task', (id) => {
      setTasks((prev) => prev.filter(t => t.id !== id));
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

  const handleTabChange = (key) => {
    setActiveTab(key);
    setSelectedAttrs([]); 
    setSearchTerm('');    
  };

  const postTask = async () => {
    if(!form.title || !form.contact) return alert("请填写完整");
    setIsPublishing(true);

    try {
      const oldTaskIds = Object.keys(myTasks);
      for (const id of oldTaskIds) {
        try {
          await axios.post(`${BACKEND_URL}/api/cancel`, { 
            taskId: id, 
            ownerToken: myTasks[id] 
          });
        } catch (err) { console.error("取消旧任务失败:", err); }
      }

      const res = await axios.post(`${BACKEND_URL}/api/post`, form);
      if (res.data.success) {
        setForm(prev => ({ ...prev, title: '', attributes: [] }));
        setShowPostModal(false); 
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
    // 如果是图片，不执行复制文字
    if (grabResult.startsWith('data:image/')) {
      alert("请长按图片保存或识别二维码");
      return;
    }
    navigator.clipboard.writeText(grabResult).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }).catch(err => {
      alert("复制失败，请手动长按复制");
    });
  };

  // 处理图片压缩和转换
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 300;
        const MAX_HEIGHT = 300;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // 压缩并转换
        const base64 = canvas.toDataURL('image/jpeg', 0.7); 
        setForm(prev => ({ ...prev, contact: base64 }));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const filteredTasks = tasks.filter(task => {
    if (activeTab !== 'ALL' && task.tag !== activeTab) return false;
    
    if (selectedAttrs.length > 0) {
      if (!task.attributes) return false;
      const hasAllAttrs = selectedAttrs.every(attr => task.attributes.includes(attr));
      if (!hasAllAttrs) return false;
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchTitle = task.title.toLowerCase().includes(term);
      const matchAttr = task.attributes && task.attributes.some(attr => attr.toLowerCase().includes(term));
      return matchTitle || matchAttr;
    }
    return true;
  });

  const toggleFormAttribute = (attr) => {
    setForm(prev => {
      const exists = prev.attributes.includes(attr);
      if (exists) {
        return { ...prev, attributes: prev.attributes.filter(a => a !== attr) };
      } else {
        return { ...prev, attributes: [...prev.attributes, attr] };
      }
    });
  };

  const toggleFilterAttribute = (attr) => {
    setSelectedAttrs(prev => {
      if (prev.includes(attr)) {
        return prev.filter(a => a !== attr);
      } else {
        return [...prev, attr];
      }
    });
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans relative pb-24">
      
      <div className="max-w-md md:max-w-6xl mx-auto p-4">
        {/* 顶部栏 */}
        <div className="flex justify-between items-center mb-2">
          <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600">
            咔哒 ⚡ 闪电搭子
          </h1>
          <button 
            onClick={() => setShowIntro(true)}
            className="w-9 h-9 rounded-full bg-slate-800 text-slate-400 hover:text-white border border-slate-700/50 flex items-center justify-center transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </button>
        </div>
        
        {/* 在线人数 */}
        <div className="flex items-center gap-2 mb-4 ml-1">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
          </span>
          <span className="text-xs text-slate-400 font-medium font-mono">
            <span className="text-green-400 font-bold text-sm mr-1">{onlineCount}</span>
            人正在蹲搭子
          </span>
        </div>

        {/* === 1. 顶部分类 Tab === */}
        <div className="relative group">
          <div className="flex gap-2 overflow-x-auto pb-2 mb-2 no-scrollbar px-1">
            <button 
              onClick={() => handleTabChange('ALL')}
              className={`px-3 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-colors flex-shrink-0 ${activeTab === 'ALL' ? 'bg-white text-slate-900' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
            >
              全部
            </button>
            {Object.entries(GAME_CONFIG).map(([key, config]) => (
              <button
                key={key}
                onClick={() => handleTabChange(key)}
                className={`px-3 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-colors flex-shrink-0 border ${activeTab === key ? config.color + ' bg-slate-800' : 'border-transparent bg-slate-800 text-slate-400 hover:text-white'}`}
              >
                {config.label}
              </button>
            ))}
            <div className="w-2 flex-shrink-0"></div>
          </div>
          <div className="absolute right-0 top-0 bottom-2 w-8 bg-gradient-to-l from-slate-900 to-transparent pointer-events-none md:hidden"></div>
        </div>
        
        {/* === 2. 搜索框 === */}
        <div className="mb-4 relative sticky top-2 z-10">
           <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
             <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
             </svg>
           </div>
           <input 
             type="text"
             className="w-full pl-10 pr-4 py-2 bg-slate-800/90 backdrop-blur border border-slate-700 rounded-full text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-lg transition-all focus:bg-slate-800"
             placeholder={activeTab === 'ALL' ? "🔍 搜全站..." : `🔍 在 ${GAME_CONFIG[activeTab]?.label || ''} 中搜索...`}
             value={searchTerm}
             onChange={(e) => setSearchTerm(e.target.value)}
           />
           {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white">✕</button>
          )}
        </div>

        {/* === 3. 快捷属性筛选 (分层展示) === */}
        {activeTab !== 'ALL' && GAME_CONFIG[activeTab] && (
          <div className="mb-6 space-y-3 animate-fade-in px-1">
             {/* 区域 (Regions) */}
             {GAME_CONFIG[activeTab].regions && GAME_CONFIG[activeTab].regions.length > 0 && (
               <div className="flex flex-wrap gap-2 items-center">
                 <span className="text-[10px] text-slate-500 font-bold uppercase w-8">大区</span>
                 {GAME_CONFIG[activeTab].regions.map(attr => {
                   const isSelected = selectedAttrs.includes(attr);
                   return (
                     <button
                       key={attr}
                       onClick={() => toggleFilterAttribute(attr)}
                       className={`px-3 py-1 rounded-full text-xs font-bold transition-all border ${
                         isSelected 
                           ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/30' 
                           : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                       }`}
                     >
                       {attr}
                     </button>
                   )
                 })}
               </div>
             )}

             {/* 模式 (Modes) */}
             {GAME_CONFIG[activeTab].modes && GAME_CONFIG[activeTab].modes.length > 0 && (
               <div className="flex flex-wrap gap-2 items-center">
                 <span className="text-[10px] text-slate-500 font-bold uppercase w-8">模式</span>
                 {GAME_CONFIG[activeTab].modes.map(attr => {
                   const isSelected = selectedAttrs.includes(attr);
                   return (
                     <button
                       key={attr}
                       onClick={() => toggleFilterAttribute(attr)}
                       className={`px-3 py-1 rounded-full text-xs font-bold transition-all border ${
                         isSelected 
                           ? 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-500/30' 
                           : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                       }`}
                     >
                       {attr}
                     </button>
                   )
                 })}
               </div>
             )}
          </div>
        )}

        {/* 任务列表 */}
        <div className="space-y-4 md:space-y-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-4">
          {isInitialLoading ? (
            // 骨架屏加载效果
            [1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700 animate-pulse">
                <div className="flex gap-2 mb-4">
                  <div className="h-4 w-12 bg-slate-700 rounded"></div>
                  <div className="h-4 w-16 bg-slate-700 rounded"></div>
                  <div className="flex-1"></div>
                  <div className="h-4 w-10 bg-slate-700 rounded"></div>
                </div>
                <div className="h-6 w-3/4 bg-slate-700 rounded mb-3"></div>
                <div className="h-10 w-full bg-slate-700/50 rounded-lg mt-auto"></div>
              </div>
            ))
          ) : (
            <>
              {filteredTasks.map(task => {
                const timeLeft = Math.max(0, Math.floor((task.expiresAt - now) / 1000));
                if (timeLeft === 0) return null;

                const isMyTask = !!myTasks[task.id];
                const isOfficial = task.isOfficial;
                const config = GAME_CONFIG[task.tag] || GAME_CONFIG['GENERAL']; 

                return (
                  <div key={task.id} className={`bg-slate-800 rounded-xl p-4 shadow-lg relative overflow-hidden border-l-4 flex flex-col ${isOfficial ? 'border-yellow-400 bg-slate-800/80 shadow-yellow-900/20' : isMyTask ? 'border-blue-400' : 'border-slate-600'} hover:bg-slate-750 transition-colors`}>
                    
                    {/* 标签栏 */}
                    <div className="flex flex-wrap gap-2 mb-3">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${isOfficial ? 'text-yellow-400 border-yellow-400' : config.color || 'text-slate-400 border-slate-400'}`}>
                        {config.label}
                      </span>
                      {task.attributes && task.attributes.slice(0, 2).map(attr => (
                        <span key={attr} className={`text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap ${isOfficial ? 'bg-yellow-500/20 text-yellow-300' : 'bg-slate-700 text-slate-300'}`}>
                          {attr}
                        </span>
                      ))}
                      {task.attributes && task.attributes.length > 2 && (
                        <span className="text-[10px] text-slate-500 px-1 py-0.5">+{task.attributes.length - 2}</span>
                      )}
                      <div className="flex-1"></div>
                      <span className={`text-xs px-2 py-0.5 rounded font-mono whitespace-nowrap ${isOfficial ? 'bg-yellow-500/20 text-yellow-400' : timeLeft < 60 ? 'bg-red-500/20 text-red-400 animate-pulse' : 'bg-slate-900/50 text-slate-500'}`}>
                        {isOfficial ? '置顶' : `${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, '0')}`}
                      </span>
                    </div>

                    <h3 className={`font-bold text-lg mb-3 break-words flex-grow leading-tight ${isOfficial ? 'text-yellow-100' : 'text-white'}`}>{task.title}</h3>
                    
                    {isMyTask ? (
                      <div className="flex gap-2 mt-auto">
                        <button 
                          onClick={() => renewTask(task.id)}
                          className="flex-1 bg-blue-500 active:bg-blue-600 hover:bg-blue-400 text-white font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-1 text-sm"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                          续命
                        </button>
                        <button 
                          onClick={() => cancelTask(task.id)}
                          className="px-3 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm font-medium transition-colors"
                        >
                          撤回
                        </button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => grabTask(task.id)}
                        className={`w-full font-bold py-2 rounded-lg mt-auto transition-colors flex items-center justify-center gap-2 ${
                          isOfficial 
                            ? 'bg-gradient-to-r from-yellow-600 to-amber-600 hover:from-yellow-500 hover:to-amber-500 text-white shadow-lg shadow-amber-900/30' 
                            : 'bg-green-500 active:bg-green-600 hover:bg-green-400 text-slate-900'
                        }`}
                      >
                        {isOfficial ? (
                          <>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            查看详情
                          </>
                        ) : (
                          <>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                            立即回应
                          </>
                        )}
                      </button>
                    )}
                  </div>
                )
              })}
              {filteredTasks.length === 0 && (
                <div className="col-span-full text-center text-slate-500 py-12 animate-fade-in">
                  <div className="text-4xl mb-2">🍃</div>
                  <p>{activeTab !== 'ALL' ? `${GAME_CONFIG[activeTab]?.label} 区暂无搭子` : '暂无任务'}</p>
                  <button onClick={() => setShowPostModal(true)} className="text-blue-400 font-bold mt-2 hover:underline">
                    做第一个发布的人
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 悬浮按钮保持不变 */}
      <button 
        onClick={() => setShowPostModal(true)}
        className="fixed bottom-8 right-6 px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-full shadow-[0_8px_25px_rgba(37,99,235,0.4)] flex items-center justify-center gap-2 transition-all hover:scale-105 active:scale-95 z-50 group border border-blue-400/30"
      >
        <svg className="w-6 h-6 group-hover:rotate-90 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
        </svg>
        <span className="font-black text-lg tracking-wider">找搭子！！</span>
      </button>

      {/* 发布弹窗 (分层优化版) */}
      {showPostModal && (
        <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center sm:p-4 bg-black/90 backdrop-blur-md animate-fade-in">
          <div className="bg-slate-800 rounded-t-2xl sm:rounded-2xl w-full max-w-sm border-t sm:border border-slate-700 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="bg-slate-900 p-4 border-b border-slate-700 flex justify-between items-center sticky top-0 z-10">
              <h2 className="text-lg font-bold text-white">⚡ 发布新搭子</h2>
              <button onClick={() => setShowPostModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            
            <div className="p-5 space-y-5">
              {/* 1. 选择分区 */}
              <div className="space-y-2">
                <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">1. 选择分区</label>
                <div className="grid grid-cols-4 gap-2">
                  {Object.entries(GAME_CONFIG).map(([key, config]) => (
                    <button
                      key={key}
                      onClick={() => setForm(prev => ({ ...prev, tag: key, attributes: [] }))} 
                      className={`flex flex-col items-center justify-center p-2 rounded-xl border transition-all ${form.tag === key ? config.color + ' bg-slate-900 border-current' : 'border-slate-700 text-slate-500 hover:bg-slate-700'}`}
                    >
                      <span className="text-lg font-black mb-1">{config.label[0]}</span>
                      <span className="text-[10px] scale-90">{config.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. 选择属性 (分行展示) */}
              <div className="space-y-3">
                <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">2. 属性细节 (可选)</label>
                
                {/* 大区 */}
                {GAME_CONFIG[form.tag]?.regions && GAME_CONFIG[form.tag].regions.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[10px] text-slate-500">大区</div>
                    <div className="flex flex-wrap gap-2">
                      {GAME_CONFIG[form.tag].regions.map(attr => (
                        <button
                          key={attr}
                          onClick={() => toggleFormAttribute(attr)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                            form.attributes.includes(attr) 
                              ? 'bg-blue-600 border-blue-500 text-white' 
                              : 'bg-slate-700 border-transparent text-slate-400 hover:bg-slate-600'
                          }`}
                        >
                          {attr}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 模式 */}
                {GAME_CONFIG[form.tag]?.modes && GAME_CONFIG[form.tag].modes.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[10px] text-slate-500">模式 / 类型</div>
                    <div className="flex flex-wrap gap-2">
                      {GAME_CONFIG[form.tag].modes.map(attr => (
                        <button
                          key={attr}
                          onClick={() => toggleFormAttribute(attr)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                            form.attributes.includes(attr) 
                              ? 'bg-purple-600 border-purple-500 text-white' 
                              : 'bg-slate-700 border-transparent text-slate-400 hover:bg-slate-600'
                          }`}
                        >
                          {attr}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 3. 输入内容 */}
              <div className="space-y-3 pt-2 border-t border-slate-700/50">
                <div>
                  <input 
                    className="w-full p-3 bg-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="标题 (例: 缺1)" 
                    value={form.title}
                    onChange={e => setForm({...form, title: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <div className="relative">
                    {form.contact.startsWith('data:image/') ? (
                      <div className="relative group">
                        <img 
                          src={form.contact} 
                          className="w-20 h-20 rounded-lg border-2 border-blue-500 mx-auto object-cover" 
                          alt="QR Preview" 
                        />
                        <button 
                          onClick={() => setForm(prev => ({ ...prev, contact: '' }))}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs shadow-lg"
                        >✕</button>
                        <p className="text-[10px] text-center text-blue-400 mt-1 font-bold">已选择二维码图片</p>
                      </div>
                    ) : (
                      <input 
                        className="w-full p-3 bg-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="联系方式 (例: V: xxx)" 
                        value={form.contact}
                        onChange={e => setForm({...form, contact: e.target.value})}
                      />
                    )}
                  </div>
                  
                  <div className="flex justify-center">
                    <label className="cursor-pointer flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-full text-xs font-bold text-slate-300 transition-colors border border-slate-600">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                      {form.contact.startsWith('data:image/') ? '更换二维码' : '上传二维码图片'}
                      <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                    </label>
                  </div>
                </div>
              </div>

              <button 
                onClick={postTask}
                disabled={isPublishing}
                className={`w-full font-bold py-3 rounded-lg transition-all ${
                  isPublishing ? 'bg-slate-600' : 'bg-blue-600 hover:bg-blue-500 text-white'
                }`}
              >
                {isPublishing ? "发布中..." : "确认发布 (15分钟后消失)"}
              </button>
            </div>
          </div>
        </div>
      )}

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
                      <div className="text-white text-sm font-mono font-bold select-all truncate">
                        away_y_y
                      </div>
                    </div>
                  </div>
                  <a href="mailto:603132073@qq.com" className="bg-slate-900/50 p-3 rounded-lg border border-slate-700/50 flex items-center gap-3 hover:bg-slate-800 transition-colors group">
                    <div className="bg-blue-500/10 p-2 rounded-lg text-blue-500 group-hover:scale-110 transition-transform">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    </div>
                    <div className="overflow-hidden">
                      <div className="text-[10px] text-slate-500">发送邮件</div>
                      <div className="text-white text-sm font-mono font-bold truncate">
                        603132073@qq.com
                      </div>
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
      
      {grabResult && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in">
          <div className="bg-slate-800 rounded-2xl w-full max-w-sm border border-green-500/50 shadow-2xl p-6 text-center space-y-6">
            <h2 className="text-2xl font-black text-white">🎉 抢单成功！</h2>
            
            {grabResult.startsWith('data:image/') ? (
              <div className="bg-white p-4 rounded-xl shadow-inner inline-block mx-auto">
                <img 
                  src={grabResult} 
                  className="w-48 h-48 object-contain" 
                  alt="Contact QR" 
                />
                <p className="text-slate-900 text-xs mt-2 font-bold">请长按图片保存或扫码</p>
              </div>
            ) : (
              <div className="bg-black/40 p-4 rounded-lg border border-slate-700 text-green-400 font-mono font-bold select-all break-all">
                {grabResult}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {!grabResult.startsWith('data:image/') && (
                <button onClick={handleCopy} className={`col-span-2 py-3 rounded-xl font-bold text-slate-900 ${isCopied ? 'bg-green-400' : 'bg-white'}`}>{isCopied ? '已复制' : '一键复制'}</button>
              )}
              <button onClick={() => setGrabResult(null)} className="col-span-2 py-3 text-slate-400 hover:text-white">关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default App;