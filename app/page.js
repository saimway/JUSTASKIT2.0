'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ==================== LOCAL STORAGE HELPERS ====================

const STORAGE_KEYS = {
  CHATS: 'justaskit_chats',
  ACTIVE_CHAT: 'justaskit_active_chat',
  SPACES: 'justaskit_spaces',
  ACTIVE_SPACE: 'justaskit_active_space',
};

function loadFromStorage(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage(key, data) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn('Storage save failed:', e);
  }
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function formatMessageTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const hours = date.getHours();
  const mins = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h = hours % 12 || 12;
  const m = mins.toString().padStart(2, '0');

  if (date.toDateString() === now.toDateString()) return `${h}:${m} ${ampm}`;
  return `${date.getMonth() + 1}/${date.getDate()} ${h}:${m} ${ampm}`;
}

// ==================== AVATAR RENDERER ====================

function renderSpaceAvatar(value, className = '') {
  if (!value) return null;
  const isDataUrl = value.startsWith('/') || value.startsWith('data:image/') || value.startsWith('http://') || value.startsWith('https://');
  if (isDataUrl) {
    return (
      <img
        src={value}
        alt="Space Icon"
        className={className}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          borderRadius: 'inherit',
          display: 'block'
        }}
      />
    );
  }
  return <span className={className}>{value}</span>;
}

// ==================== DEFAULT SPACES ====================

const DEFAULT_SPACE = {
  id: 'default',
  name: 'JUST ASK IT',
  emoji: '/logo.jpg',
  behavior: '',
  isDefault: true,
};

const CRAFT_EMOJIS = ['🤖', '🧠', '👾', '🎭', '🦊', '🐉', '💀', '👻', '🔮', '⚗️', '🎪', '🗿'];

// ==================== MAIN APP COMPONENT ====================

export default function Home() {
  // Chat state
  const [chats, setChats] = useState({});
  const [activeChatId, setActiveChatId] = useState(null);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [activeTypingMessageId, setActiveTypingMessageId] = useState(null);
  const [serverBusy, setServerBusy] = useState(null);
  const [editingChatId, setEditingChatId] = useState(null);
  const [editChatTitle, setEditChatTitle] = useState('');
  const [deleteConfirmChatId, setDeleteConfirmChatId] = useState(null);

  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Space state
  const [spaces, setSpaces] = useState([DEFAULT_SPACE]);
  const [activeSpaceId, setActiveSpaceId] = useState('default');
  const [spaceDropdownOpen, setSpaceDropdownOpen] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Craft modal state
  const [craftModalOpen, setCraftModalOpen] = useState(false);
  const [craftName, setCraftName] = useState('');
  const [craftBehavior, setCraftBehavior] = useState('');
  const [craftEmoji, setCraftEmoji] = useState('🤖');
  const [editingSpaceId, setEditingSpaceId] = useState(null);

  // Refs
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const busyTimerRef = useRef(null);
  const typingIntervalRef = useRef(null);

  // Cleanup typing interval on active chat change or unmount
  useEffect(() => {
    return () => {
      if (typingIntervalRef.current) {
        clearInterval(typingIntervalRef.current);
        typingIntervalRef.current = null;
      }
      setIsTyping(false);
      setActiveTypingMessageId(null);
    };
  }, [activeChatId]);

  // ==================== LOAD FROM STORAGE ====================

  useEffect(() => {
    const savedChats = loadFromStorage(STORAGE_KEYS.CHATS, {});
    const savedActiveChatId = loadFromStorage(STORAGE_KEYS.ACTIVE_CHAT, null);
    const savedSpaces = loadFromStorage(STORAGE_KEYS.SPACES, [DEFAULT_SPACE]);
    const savedActiveSpaceId = loadFromStorage(STORAGE_KEYS.ACTIVE_SPACE, 'default');

    // Ensure the default space in user's localStorage gets updated to use the new logo
    const updatedSpaces = (savedSpaces.length > 0 ? savedSpaces : [DEFAULT_SPACE])
      .map(s => s.id === 'default' ? DEFAULT_SPACE : s);

    setChats(savedChats);
    setActiveChatId(savedActiveChatId);
    setSpaces(updatedSpaces);
    setActiveSpaceId(savedActiveSpaceId || 'default');
    setIsLoaded(true);
  }, []);

  // ==================== SAVE TO STORAGE ====================

  useEffect(() => {
    if (!isLoaded) return;
    saveToStorage(STORAGE_KEYS.CHATS, chats);
  }, [chats, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    saveToStorage(STORAGE_KEYS.ACTIVE_CHAT, activeChatId);
  }, [activeChatId, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    saveToStorage(STORAGE_KEYS.SPACES, spaces);
  }, [spaces, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    saveToStorage(STORAGE_KEYS.ACTIVE_SPACE, activeSpaceId);
  }, [activeSpaceId, isLoaded]);

  // ==================== AUTO SCROLL ====================

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chats, activeChatId, isLoading]);

  // ==================== ACTIVE DATA ====================

  const activeChat = activeChatId ? chats[activeChatId] : null;
  const activeMessages = activeChat?.messages || [];
  const activeSpace = spaces.find(s => s.id === activeSpaceId) || DEFAULT_SPACE;

  // Get chats filtered by current space
  const spaceChatIds = Object.keys(chats)
    .filter(id => (chats[id].spaceId || 'default') === activeSpaceId)
    .sort((a, b) => (chats[b].updatedAt || 0) - (chats[a].updatedAt || 0));

  const hasEmptyChat = Object.values(chats).some(
    chat => (chat.spaceId || 'default') === activeSpaceId && chat.messages.length === 0
  );

  // ==================== CHAT ACTIONS ====================

  const createNewChat = useCallback(() => {
    const existingEmptyChat = Object.values(chats).find(
      chat => (chat.spaceId || 'default') === activeSpaceId && chat.messages.length === 0
    );

    if (existingEmptyChat) {
      setActiveChatId(existingEmptyChat.id);
      setSidebarOpen(false);
      setServerBusy(null);
      setTimeout(() => inputRef.current?.focus(), 100);
      return existingEmptyChat.id;
    }

    const id = generateId();
    const newChat = {
      id,
      title: 'New Chat',
      messages: [],
      spaceId: activeSpaceId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setChats(prev => ({ ...prev, [id]: newChat }));
    setActiveChatId(id);
    setSidebarOpen(false);
    setServerBusy(null);
    setTimeout(() => inputRef.current?.focus(), 100);
    return id;
  }, [activeSpaceId, chats]);

  const deleteChat = useCallback((chatId, e) => {
    if (e) e.stopPropagation();
    setDeleteConfirmChatId(chatId);
  }, []);

  const confirmDeleteChat = useCallback(() => {
    if (!deleteConfirmChatId) return;
    const chatId = deleteConfirmChatId;
    setChats(prev => {
      const updated = { ...prev };
      delete updated[chatId];
      return updated;
    });
    if (activeChatId === chatId) {
      setActiveChatId(null);
    }
    setDeleteConfirmChatId(null);
  }, [deleteConfirmChatId, activeChatId]);

  const selectChat = useCallback((chatId) => {
    setActiveChatId(chatId);
    setSidebarOpen(false);
    setServerBusy(null);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const startEditingChat = useCallback((chatId, title, e) => {
    if (e) e.stopPropagation();
    setEditingChatId(chatId);
    setEditChatTitle(title);
  }, []);

  const saveChatTitle = useCallback((chatId) => {
    if (!editChatTitle.trim()) {
      setEditingChatId(null);
      return;
    }
    setChats(prev => {
      const chat = prev[chatId];
      if (!chat) return prev;
      return {
        ...prev,
        [chatId]: {
          ...chat,
          title: editChatTitle.trim(),
          updatedAt: Date.now(),
        }
      };
    });
    setEditingChatId(null);
  }, [editChatTitle]);

  // ==================== SEND MESSAGE ====================

  const sendMessage = useCallback(async (text) => {
    const messageText = text || inputText.trim();
    if (!messageText || isLoading || isTyping) return;

    setInputText('');
    setServerBusy(null);

    let chatId = activeChatId;

    // Create new chat if none active
    if (!chatId) {
      const existingEmptyChat = Object.values(chats).find(
        chat => (chat.spaceId || 'default') === activeSpaceId && chat.messages.length === 0
      );
      if (existingEmptyChat) {
        chatId = existingEmptyChat.id;
      } else {
        chatId = generateId();
        const newChat = {
          id: chatId,
          title: messageText.slice(0, 50),
          messages: [],
          spaceId: activeSpaceId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        setChats(prev => ({ ...prev, [chatId]: newChat }));
      }
      setActiveChatId(chatId);
    }

    // Add user message
    const userMessage = {
      id: generateId(),
      role: 'user',
      content: messageText,
      timestamp: Date.now(),
    };

    setChats(prev => {
      const chat = prev[chatId] || {
        id: chatId,
        title: messageText.slice(0, 50),
        messages: [],
        spaceId: activeSpaceId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      return {
        ...prev,
        [chatId]: {
          ...chat,
          messages: [...chat.messages, userMessage],
          title: chat.messages.length === 0 ? messageText.slice(0, 50) : chat.title,
          updatedAt: Date.now(),
        },
      };
    });

    setIsLoading(true);

    try {
      // Build context - send all chat messages
      const currentMessages = chats[chatId]?.messages || [];
      const allMessages = [...currentMessages, userMessage].map(m => ({
        role: m.role,
        content: m.content,
      }));

      // Build craft prompt if in a custom space
      let craftPrompt = '';
      if (activeSpace && !activeSpace.isDefault && activeSpace.behavior) {
        craftPrompt = `Your name is "${activeSpace.name}". ${activeSpace.behavior}. Always stay in character as ${activeSpace.name} and respond according to this personality.`;
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: allMessages,
          craftPrompt,
        }),
      });

      const data = await response.json();

      if (data.error === 'server_busy') {
        setServerBusy({
          message: data.message,
          retryAfter: data.retryAfter,
          estimatedTime: data.estimatedTime,
        });

        // Auto-clear busy state after retry time
        if (busyTimerRef.current) clearTimeout(busyTimerRef.current);
        busyTimerRef.current = setTimeout(() => {
          setServerBusy(null);
        }, (data.retryAfter || 60) * 1000);

        setIsLoading(false);
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get response');
      }

      // Add AI response placeholder with empty content
      const aiMessageId = generateId();
      const aiMessage = {
        id: aiMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      };

      setChats(prev => ({
        ...prev,
        [chatId]: {
          ...prev[chatId],
          messages: [...prev[chatId].messages, aiMessage],
          updatedAt: Date.now(),
        },
      }));

      setIsLoading(false);
      setIsTyping(true);
      setActiveTypingMessageId(aiMessageId);

      const fullText = data.message;
      let currentLength = 0;

      const totalDuration = Math.min(2500, Math.max(500, fullText.length * 2)); 
      const intervalMs = 15;
      const steps = totalDuration / intervalMs;
      const charsPerStep = Math.max(1, Math.ceil(fullText.length / steps));

      if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);

      typingIntervalRef.current = setInterval(() => {
        currentLength += charsPerStep;
        const isFinished = currentLength >= fullText.length;
        
        if (isFinished) {
          currentLength = fullText.length;
          clearInterval(typingIntervalRef.current);
          typingIntervalRef.current = null;
          setIsTyping(false);
          setActiveTypingMessageId(null);
        }

        const typedContent = fullText.slice(0, currentLength);

        setChats(prev => {
          const chat = prev[chatId];
          if (!chat) return prev;
          
          const updatedMessages = chat.messages.map(m => {
            if (m.id === aiMessageId) {
              return { ...m, content: typedContent };
            }
            return m;
          });

          return {
            ...prev,
            [chatId]: {
              ...chat,
              messages: updatedMessages,
              updatedAt: Date.now(),
            }
          };
        });
      }, intervalMs);

    } catch (error) {
      console.error('Send error:', error);
      const errorMessage = {
        id: generateId(),
        role: 'assistant',
        content: `⚠️ Error: ${error.message}. Please try again.`,
        timestamp: Date.now(),
        isError: true,
      };

      setChats(prev => ({
        ...prev,
        [chatId]: {
          ...prev[chatId],
          messages: [...prev[chatId].messages, errorMessage],
          updatedAt: Date.now(),
        },
      }));
    }

    setIsLoading(false);
  }, [inputText, isLoading, isTyping, activeChatId, activeSpaceId, activeSpace, chats]);

  // ==================== CRAFT SPACE ACTIONS ====================

  const handleImageUpload = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const size = 64;
        canvas.width = size;
        canvas.height = size;

        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;

        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);

        // Compress and convert to base64 jpeg to preserve localStorage limits
        const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
        setCraftEmoji(dataUrl);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  }, []);

  const saveSpace = useCallback(() => {
    if (!craftName.trim()) return;

    if (editingSpaceId) {
      setSpaces(prev => prev.map(s => {
        if (s.id === editingSpaceId) {
          return {
            ...s,
            name: craftName.trim(),
            emoji: craftEmoji,
            behavior: craftBehavior.trim(),
          };
        }
        return s;
      }));
      setCraftModalOpen(false);
      setEditingSpaceId(null);
      setCraftName('');
      setCraftBehavior('');
      setCraftEmoji('🤖');
      setSpaceDropdownOpen(false);
    } else {
      const newSpace = {
        id: generateId(),
        name: craftName.trim(),
        emoji: craftEmoji,
        behavior: craftBehavior.trim(),
        isDefault: false,
      };

      setSpaces(prev => [...prev, newSpace]);
      setActiveSpaceId(newSpace.id);
      setCraftModalOpen(false);
      setCraftName('');
      setCraftBehavior('');
      setCraftEmoji('🤖');
      setActiveChatId(null);
      setSpaceDropdownOpen(false);
    }
  }, [craftName, craftEmoji, craftBehavior, editingSpaceId]);

  const startEditingSpace = useCallback((space, e) => {
    if (e) e.stopPropagation();
    setEditingSpaceId(space.id);
    setCraftName(space.name);
    setCraftBehavior(space.behavior || '');
    setCraftEmoji(space.emoji || '🤖');
    setCraftModalOpen(true);
    setSpaceDropdownOpen(false);
  }, []);

  const closeCraftModal = useCallback(() => {
    setCraftModalOpen(false);
    setEditingSpaceId(null);
    setCraftName('');
    setCraftBehavior('');
    setCraftEmoji('🤖');
  }, []);

  const deleteSpace = useCallback((spaceId, e) => {
    if (e) e.stopPropagation();
    if (spaceId === 'default') return;

    const space = spaces.find(s => s.id === spaceId);
    const spaceName = space ? space.name : 'this space';

    if (typeof window !== 'undefined') {
      const confirmDelete = window.confirm(`Are you sure you want to delete the "${spaceName}" space? All chats inside this space will be permanently deleted.`);
      if (!confirmDelete) return;
    }

    setSpaces(prev => prev.filter(s => s.id !== spaceId));

    // Delete all chats in this space
    setChats(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(chatId => {
        if (updated[chatId].spaceId === spaceId) {
          delete updated[chatId];
        }
      });
      return updated;
    });

    if (activeSpaceId === spaceId) {
      setActiveSpaceId('default');
      setActiveChatId(null);
    }
  }, [activeSpaceId, spaces]);

  const switchSpace = useCallback((spaceId) => {
    setActiveSpaceId(spaceId);
    setActiveChatId(null);
    setSpaceDropdownOpen(false);
    setServerBusy(null);
  }, []);

  // ==================== KEY HANDLERS ====================

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  // Auto-resize textarea
  const handleInputChange = useCallback((e) => {
    setInputText(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
  }, []);

  // ==================== RENDER ====================

  return (
    <div className="app-container">
      {/* Sidebar Overlay (mobile) */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'visible' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon" style={{ overflow: 'hidden' }}>
              <img src="/logo.jpg" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <span className="sidebar-logo-text">JUST ASK IT</span>
          </div>
          <button
            className="sidebar-close-btn"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            ✕
          </button>
        </div>

        {/* Space Selector */}
        <div className="space-selector">
          <button
            className="space-current"
            onClick={() => setSpaceDropdownOpen(!spaceDropdownOpen)}
          >
            <div className={`space-avatar ${activeSpace.isDefault ? 'default' : 'craft'}`}>
              {renderSpaceAvatar(activeSpace.emoji)}
            </div>
            <div className="space-info">
              <div className="space-name">{activeSpace.name}</div>
              <div className="space-label">
                {activeSpace.isDefault ? 'Default Space' : 'Craft Space'}
              </div>
            </div>
            <span className={`space-dropdown-icon ${spaceDropdownOpen ? 'open' : ''}`}>
              ▼
            </span>
          </button>

          {spaceDropdownOpen && (
            <div className="space-dropdown">
              {spaces.map(space => (
                <div
                  key={space.id}
                  className={`space-dropdown-item ${space.id === activeSpaceId ? 'active' : ''}`}
                  onClick={() => switchSpace(space.id)}
                >
                  <div className={`space-avatar ${space.isDefault ? 'default' : 'craft'}`}>
                    {renderSpaceAvatar(space.emoji)}
                  </div>
                  <span>{space.name}</span>
                  {!space.isDefault && (
                    <div className="space-item-actions">
                      <button
                        className="space-edit"
                        onClick={(e) => startEditingSpace(space, e)}
                        title="Edit space"
                      >
                        ✏️
                      </button>
                      <button
                        className="space-delete"
                        onClick={(e) => deleteSpace(space.id, e)}
                        title="Delete space"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              ))}
              <div
                className="space-dropdown-item create-new"
                onClick={() => {
                  setCraftModalOpen(true);
                  setSpaceDropdownOpen(false);
                }}
              >
                <span style={{ fontSize: '16px' }}>✦</span>
                <span>Create New Space</span>
              </div>
            </div>
          )}
        </div>

        {/* New Chat Button */}
        <div className="sidebar-actions">
          <button
            className="btn-new-chat"
            onClick={createNewChat}
            disabled={hasEmptyChat}
            title={hasEmptyChat ? "Write a message in the empty chat first" : "Start a new conversation"}
          >
            <span>✦</span> New Chat
          </button>
        </div>

        {/* Chat History */}
        <div className="chat-history">
          {spaceChatIds.length > 0 && (
            <div className="chat-history-label">Recent</div>
          )}
          {spaceChatIds.map(chatId => {
            const isEditing = editingChatId === chatId;
            return (
              <div
                key={chatId}
                className={`chat-item ${chatId === activeChatId ? 'active' : ''} ${isEditing ? 'editing' : ''}`}
                onClick={() => !isEditing && selectChat(chatId)}
              >
                <span className="chat-item-icon">💬</span>
                {isEditing ? (
                  <input
                    type="text"
                    className="chat-item-input"
                    value={editChatTitle}
                    onChange={(e) => setEditChatTitle(e.target.value)}
                    onBlur={() => saveChatTitle(chatId)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        saveChatTitle(chatId);
                      } else if (e.key === 'Escape') {
                        setEditingChatId(null);
                      }
                    }}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <>
                    <span className="chat-item-text">{chats[chatId]?.title || 'New Chat'}</span>
                    <div className="chat-item-actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="chat-item-edit"
                        onClick={(e) => startEditingChat(chatId, chats[chatId]?.title || 'New Chat', e)}
                        title="Rename chat"
                      >
                        ✏️
                      </button>
                      <button
                        className="chat-item-delete"
                        onClick={(e) => deleteChat(chatId, e)}
                        title="Delete chat"
                      >
                        ✕
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
          {spaceChatIds.length === 0 && (
            <div className="chat-empty">
              No chats yet in this space.<br />
              Start a conversation!
            </div>
          )}
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="main-area">
        {/* Chat Header */}
        <header className="chat-header">
          <button
            className="menu-btn"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            ☰
          </button>
          <div className="chat-header-info">
            <div className="chat-header-title">
              {activeSpace.isDefault ? 'JUST ASK IT' : activeSpace.name}
            </div>
            <div className="chat-header-status">
              <span className="status-dot" />
              <span>{activeSpace.isDefault ? 'Unrestricted AI' : 'Custom AI'}</span>
            </div>
          </div>
        </header>

        {/* Messages or Welcome */}
        {activeMessages.length === 0 && !activeChatId ? (
          <div className="welcome-screen">
            <div className="welcome-icon" style={{ overflow: 'hidden' }}>
              <img src="/logo.jpg" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <h1 className="welcome-title">JUST ASK IT</h1>
            <p className="welcome-subtitle">
              {activeSpace.isDefault
                ? 'Unrestricted AI at your fingertips. No filters, no limits. Just ask.'
                : `You're chatting with ${activeSpace.name}.`
              }
            </p>

          </div>
        ) : (
          <div className="messages-container">
            {activeMessages.map(msg => (
              <div key={msg.id} className={`message ${msg.role}`}>
                {msg.role !== 'user' && (
                  <div className="message-avatar ai">
                    {renderSpaceAvatar(activeSpace.emoji || '/logo.jpg')}
                  </div>
                )}
                <div className="message-content">
                  <div className="message-bubble">
                    <MessageContent content={msg.content} isTyping={msg.id === activeTypingMessageId} />
                  </div>
                  <div className="message-time">
                    {formatMessageTime(msg.timestamp)}
                  </div>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="message assistant">
                <div className="message-avatar ai">
                  {renderSpaceAvatar(activeSpace.emoji || '/logo.jpg')}
                </div>
                <div className="message-content">
                  <div className="message-bubble">
                    <div className="typing-indicator">
                      <div className="typing-dot" />
                      <div className="typing-dot" />
                      <div className="typing-dot" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {serverBusy && (
              <div className="server-busy">
                <span className="server-busy-icon">🔥</span>
                <div className="server-busy-text">
                  {serverBusy.message}
                  {serverBusy.estimatedTime && (
                    <> Estimated recovery: <span className="server-busy-timer">{serverBusy.estimatedTime}</span></>
                  )}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Input Area */}
        <div className="input-area">
          <div className="input-wrapper">
            <div className="input-field-wrapper">
              <textarea
                ref={inputRef}
                className="input-field"
                placeholder={activeSpace.isDefault ? 'Ask me anything...' : `Message ${activeSpace.name}...`}
                value={inputText}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                rows={1}
                disabled={isLoading || isTyping}
                id="chat-input"
              />
            </div>
            <button
              className="send-btn"
              onClick={() => sendMessage()}
              disabled={!inputText.trim() || isLoading || isTyping}
              aria-label="Send message"
              id="send-button"
            >
              ↑
            </button>
          </div>
        </div>
      </main>

      {/* Craft Modal */}
      {craftModalOpen && (
        <div className="modal-overlay" onClick={closeCraftModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{editingSpaceId ? 'Edit AI Space' : 'Create AI Space'}</h2>
              <button className="modal-close" onClick={closeCraftModal}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Choose an icon or upload an image</label>
                <div className="form-emoji-picker">
                  {CRAFT_EMOJIS.map(emoji => (
                    <button
                      key={emoji}
                      type="button"
                      className={`emoji-option ${craftEmoji === emoji ? 'selected' : ''}`}
                      onClick={() => setCraftEmoji(emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>

                <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <label className="btn-upload" style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    background: 'var(--bg-glass)',
                    border: '1px dashed var(--border-hover)',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    color: 'var(--text-secondary)',
                    transition: 'all var(--transition-fast)',
                    fontFamily: 'var(--font-sans)',
                    fontWeight: '500'
                  }}>
                    <span>📷</span> Upload Custom Image
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={handleImageUpload}
                    />
                  </label>

                  {craftEmoji && (craftEmoji.startsWith('data:image/') || craftEmoji.startsWith('http')) && (
                    <div style={{
                      position: 'relative',
                      width: '36px',
                      height: '36px',
                      borderRadius: 'var(--radius-sm)',
                      overflow: 'hidden',
                      border: '2px solid var(--accent)',
                      display: 'flex',
                      alignItems: 'center',
                      justifycontent: 'center'
                    }}>
                      <img src={craftEmoji} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <button
                        type="button"
                        onClick={() => setCraftEmoji('🤖')}
                        style={{
                          position: 'absolute',
                          top: '1px',
                          right: '1px',
                          background: 'rgba(0,0,0,0.7)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '50%',
                          width: '14px',
                          height: '14px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '8px',
                          cursor: 'pointer',
                          padding: '0',
                          lineHeight: '1'
                        }}
                        title="Remove image"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="craft-name">Space Name</label>
                <input
                  id="craft-name"
                  className="form-input"
                  type="text"
                  placeholder="e.g., Code Wizard, Story Teller, Roast Master"
                  value={craftName}
                  onChange={(e) => setCraftName(e.target.value)}
                  maxLength={30}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="craft-behavior">Personality & Behavior</label>
                <textarea
                  id="craft-behavior"
                  className="form-textarea"
                  placeholder="Describe how this AI should behave. e.g., 'You are a sarcastic code reviewer who roasts bad code but gives brilliant advice. You speak like a pirate.'"
                  value={craftBehavior}
                  onChange={(e) => setCraftBehavior(e.target.value)}
                  maxLength={500}
                />
                <div className="form-hint">
                  {craftBehavior.length}/500 characters
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={closeCraftModal}>
                Cancel
              </button>
              <button
                className="btn-create"
                onClick={saveSpace}
                disabled={!craftName.trim()}
              >
                {editingSpaceId ? 'Save Changes ✦' : 'Create Space ✦'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmChatId && (
        <div className="modal-overlay" onClick={() => setDeleteConfirmChatId(null)}>
          <div className="modal delete-confirm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h2 className="modal-title">Delete Chat</h2>
              <button className="modal-close" onClick={() => setDeleteConfirmChatId(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ padding: '20px 24px' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '8px' }}>
                Are you sure you want to delete this chat?
              </p>
              {chats[deleteConfirmChatId] && (
                <div style={{
                  padding: '10px 14px',
                  background: 'var(--bg-hover)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)',
                  fontSize: '13px',
                  color: 'var(--text-primary)',
                  fontWeight: '500',
                  marginTop: '8px',
                  wordBreak: 'break-all'
                }}>
                  💬 {chats[deleteConfirmChatId].title || 'New Chat'}
                </div>
              )}
              <p style={{ color: 'var(--error)', fontSize: '12px', marginTop: '12px', fontWeight: '500' }}>
                ⚠️ This action cannot be undone and will permanently erase all messages in this conversation.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setDeleteConfirmChatId(null)}>
                Cancel
              </button>
              <button
                className="btn-delete-confirm"
                onClick={confirmDeleteChat}
              >
                Delete Chat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== MESSAGE CONTENT RENDERER ====================

function MessageContent({ content, isTyping }) {
  if (!content) return null;

  // Simple markdown-like rendering
  const renderContent = (text) => {
    // Split into code blocks and regular text
    const parts = text.split(/(```[\s\S]*?```)/g);

    return parts.map((part, index) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const codeContent = part.slice(3, -3);
        const firstNewline = codeContent.indexOf('\n');
        const code = firstNewline >= 0 ? codeContent.slice(firstNewline + 1) : codeContent;
        
        // Show cursor inside pre block if it's the last part and isTyping
        const showCursor = isTyping && index === parts.length - 1;
        return (
          <pre key={index}>
            <code>
              {code}
              {showCursor && <span className="typing-cursor" />}
            </code>
          </pre>
        );
      }

      // Process inline formatting
      const isLastPart = index === parts.length - 1;
      return <span key={index}>{renderInline(part, isLastPart && isTyping)}</span>;
    });
  };

  const renderInline = (text, showCursor) => {
    const elements = [];
    const lines = text.split('\n');

    lines.forEach((line, lineIdx) => {
      if (lineIdx > 0) elements.push(<br key={`br-${lineIdx}`} />);

      const isLastLine = lineIdx === lines.length - 1;

      // Split by double asterisks first
      const doubleParts = line.split(/(\*\*.*?\*\*)/g);
      doubleParts.forEach((part, partIdx) => {
        const isLastDoublePart = partIdx === doubleParts.length - 1;
        const shouldShowCursorHere = showCursor && isLastLine && isLastDoublePart;

        if (part.startsWith('**') && part.endsWith('**')) {
          const innerText = part.slice(2, -2);
          elements.push(
            <span key={`${lineIdx}-${partIdx}`} className="roleplay-action double-asterisk">
              {innerText}
              {shouldShowCursorHere && <span className="typing-cursor" />}
            </span>
          );
        } else {
          // Split by single asterisks
          const singleParts = part.split(/(\*.*?\*)/g);
          singleParts.forEach((sPart, sIdx) => {
            const isLastSinglePart = sIdx === singleParts.length - 1;
            const shouldShowCursorHereSingle = shouldShowCursorHere && isLastSinglePart;

            if (sPart.startsWith('*') && sPart.endsWith('*')) {
              const innerText = sPart.slice(1, -1);
              elements.push(
                <span key={`${lineIdx}-${partIdx}-${sIdx}`} className="roleplay-action single-asterisk">
                  {innerText}
                  {shouldShowCursorHereSingle && <span className="typing-cursor" />}
                </span>
              );
            } else {
              // Inline code
              const codeParts = sPart.split(/(`[^`]+`)/g);
              codeParts.forEach((codePart, codeIdx) => {
                const isLastCodePart = codeIdx === codeParts.length - 1;
                const shouldShowCursorHereCode = shouldShowCursorHereSingle && isLastCodePart;

                if (codePart.startsWith('`') && codePart.endsWith('`')) {
                  elements.push(
                    <code key={`${lineIdx}-${partIdx}-${sIdx}-${codeIdx}`}>
                      {codePart.slice(1, -1)}
                      {shouldShowCursorHereCode && <span className="typing-cursor" />}
                    </code>
                  );
                } else {
                  elements.push(
                    <span key={`${lineIdx}-${partIdx}-${sIdx}-${codeIdx}-txt`}>
                      {codePart}
                      {shouldShowCursorHereCode && <span className="typing-cursor" />}
                    </span>
                  );
                }
              });
            }
          });
        }
      });
    });

    return elements;
  };

  return <>{renderContent(content)}</>;
}
