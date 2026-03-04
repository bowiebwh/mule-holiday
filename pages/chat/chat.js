// pages/chat/chat.js
const app = getApp()
const { chat, getChatHistory, getChatSessions, createNewSession } = require('../../api/index')
const towxml = require('../../components/towxml/index')

// 时间格式化函数
function formatDateTime(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// 使用 towxml 处理 Markdown 内容
function parseMarkdown(text) {
  if (!text) return null;
  
  // 使用 towxml 将 Markdown 转换为可渲染的内容
  try {
    const towxmlContent = towxml(text, 'markdown');
    return towxmlContent;
  } catch (error) {
    console.error('Markdown 解析失败:', error);
    return null;
  }
}

Page({
  data: {
    messages: [
      { role: 'bot', content: '你好！我是你的 AI 求职顾问，可以问我任何问题 😊' }
    ],
    sessionId: '',
    inputMessage: '',
    scrollIntoView: '',
    isSendButtonEnabled: false,
    isLoading: false,
    // 对话历史相关 - 按session组织
    chatHistoryBySession: [],
    expandedSession: null,
    isLoadingHistory: false,
    // 当前展开会话的详细历史记录
    sessionDetails: {},
    isLoadingSessionDetails: false,
    // 用户使用情况
    userUsage: {
      stream_run_remaining: 1,
      interview_remaining: 1,
      learning_path_remaining: 1,
      chat_remaining: 5
    }
  },

  // 页面加载时的初始化
  onLoad() {
    // 启用分享功能
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']  // 同时开启好友和朋友圈分享
    })
    
    this.setData({
      isSendButtonEnabled: false
    })
    this.loadUserUsage() // 加载用户使用情况
  },
  
  // 加载用户使用情况
  loadUserUsage() {
    const api = require('../../api/index')
    const app = getApp()
    api.loadUserUsage().then(res => {
      if (res && res.limits) {
        // 构建用户使用情况对象
        const userUsage = {
          stream_run_remaining: 1,
          interview_remaining: 1,
          learning_path_remaining: 1,
          chat_remaining: 5
        }
        
        // 遍历限制信息，更新对应的值
        res.limits.forEach(limit => {
          switch (limit.endpoint) {
            case 'stream_run_async':
              userUsage.stream_run_remaining = limit.remaining
              break
            case 'generate_interview':
              userUsage.interview_remaining = limit.remaining
              break
            case 'generate_learning_path':
              userUsage.learning_path_remaining = limit.remaining
              break
            case 'chat':
              userUsage.chat_remaining = limit.remaining
              break
          }
        })
        
        // 更新全局数据中的用户使用情况
        app.globalData.userUsage = userUsage
        // 更新页面数据中的用户使用情况
        this.setData({ userUsage })
      }
    }).catch(error => {
      console.error('获取用户使用情况失败:', error)
    })
  },
  
  // 页面显示时获取对话历史
  onShow() {
    // 启用分享功能
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']  // 同时开启好友和朋友圈分享
    })
    
    // 从本地存储获取当前会话ID
    const currentSessionId = wx.getStorageSync('currentSessionId')
    // 检查登录状态
    const accessToken = wx.getStorageSync('accessToken')
    
    // 只有登录后才请求会话列表
    if (accessToken) {
      this.setData({
        sessionId: currentSessionId || ''
      })
      // 刷新会话列表
      this.fetchChatHistory()
      // 如果有当前会话ID，获取其最新历史记录
      if (currentSessionId) {
        this.fetchSessionHistory(currentSessionId, true)
      } else {
        // 没有当前会话ID，显示欢迎消息
        this.setData({
          messages: [
            { role: 'bot', content: '你好！我是你的 AI 求职顾问，可以问我任何问题 😊' }
          ]
        })
      }
    } else {
      // 未登录，清空会话列表和消息
      this.setData({
        messages: [
          { role: 'bot', content: '你好！我是你的 AI 求职顾问，可以问我任何问题 😊' }
        ],
        chatHistoryBySession: [],
        sessionDetails: {},
        expandedSession: null,
        sessionId: ''
      })
    }
  },
  
  // 获取会话列表
  fetchChatHistory() {
    this.setData({ isLoadingHistory: true })
    
    // 调用获取会话列表API
    getChatSessions({
      limit: 20
    })
      .then(response => {
        console.log('会话列表API返回数据:', response)
        if (response.sessions && response.sessions.length > 0) {
          // 对会话列表中的时间进行格式化
          const formattedSessions = response.sessions.map(session => {
            return {
              ...session,
              formattedCreatedAt: formatDateTime(session.created_at),
              formattedLastMessageTime: formatDateTime(session.last_message_time)
            };
          });
          
          // 保存会话列表
          this.setData({
            chatHistoryBySession: formattedSessions
          })
          
          // 从本地存储获取当前会话ID
          const currentSessionId = wx.getStorageSync('currentSessionId')
          
          if (currentSessionId) {
            // 如果有当前会话ID，使用它
            this.setData({
              sessionId: currentSessionId
            })
            // 请求当前会话的历史记录，但不强制显示
            this.fetchSessionHistory(currentSessionId, false)
          } else {
            // 否则自动选择第一个会话并请求其历史记录，但不强制显示
            const firstSession = response.sessions[0]
            this.setData({
              sessionId: firstSession.session_id
            })
            // 请求第一个会话的历史记录，但不强制显示
            this.fetchSessionHistory(firstSession.session_id, false)
          }
        } else {
          this.setData({
            chatHistoryBySession: []
          })
        }
      })
      .catch(error => {
        console.error('获取会话列表失败:', error)
        // 尝试使用原来的方式获取历史记录
        this.fetchOldChatHistory()
      })
      .finally(() => {
        this.setData({ isLoadingHistory: false })
      })
  },
  
  // 获取单个会话的历史记录
  fetchSessionHistory(sessionId, forceShow = false) {
    this.setData({ isLoading: true })
    
    return getChatHistory({
      session_id: sessionId,
      limit: 20
    })
      .then(response => {
        console.log('会话历史API返回数据:', response)
        if (response.history && response.history.length > 0) {
          // 保存会话详情
          const newSessionDetails = { ...this.data.sessionDetails }
          newSessionDetails[sessionId] = response.history
          this.setData({
            sessionDetails: newSessionDetails
          })
          
          // 如果forceShow为true，或者当前会话ID与获取的会话ID相同，更新消息列表
          if (forceShow || this.data.sessionId === sessionId) {
            // 构建消息列表
            const messages = []
            response.history.forEach(chat => {
              messages.push({ role: 'user', content: chat.user_message })
              // 解析AI回复的Markdown内容
              const towxmlContent = towxml(chat.ai_response, 'markdown');
              messages.push({ role: 'bot', content: chat.ai_response, towxmlContent: towxmlContent })
            })
            
            this.setData({
              messages: messages,
              scrollIntoView: 'scroll-bottom'
            })
          }
        } else {
          // 如果没有历史记录，初始化sessionDetails中的该会话
          const newSessionDetails = { ...this.data.sessionDetails }
          newSessionDetails[sessionId] = []
          this.setData({
            sessionDetails: newSessionDetails
          })
        }
      })
      .catch(error => {
        console.error('获取会话历史失败:', error)
      })
      .finally(() => {
        this.setData({ isLoading: false, isLoadingSessionDetails: false })
      })
  },
  
  // 获取单个会话的对话历史（兼容旧接口）
  fetchOldChatHistory() {
    const { sessionId } = this.data
    
    // 如果没有sessionId，不请求历史记录
    if (!sessionId) {
      // 清除当前消息列表，显示欢迎消息
      this.setData({
        messages: [
          { role: 'bot', content: '你好！我是你的 AI 求职顾问，可以问我任何问题 😊' }
        ]
      })
      return
    }
    
    getChatHistory({
      session_id: sessionId,
      limit: 20
    })
      .then(response => {
        console.log('旧对话历史API返回数据:', response)
        if (response.history && response.history.length > 0) {
          // 直接使用API返回的数据结构，session_id和history数组
          const sessionHistory = {
            session_id: response.session_id,
            history: response.history,
            created_at: response.history[0].created_at,
            last_message: response.history[response.history.length - 1].user_message
          }
          
          console.log('组织后的会话历史:', sessionHistory)
          this.setData({
            chatHistoryBySession: [sessionHistory]
          })
        }
      })
      .catch(error => {
        console.error('获取对话历史失败:', error)
      })
  },
  
  // 切换会话展开/收起
  toggleSession(e) {
    const index = e.currentTarget.dataset.index
    const { expandedSession, chatHistoryBySession } = this.data
    
    // 边界检查，确保索引有效且会话存在
    if (!chatHistoryBySession || !chatHistoryBySession[index]) {
      console.error('无效的会话索引:', index)
      return
    }
    
    const sessionId = chatHistoryBySession[index].session_id
    
    // 确保sessionId存在
    if (!sessionId) {
      console.error('会话缺少session_id:', chatHistoryBySession[index])
      return
    }
    
    // 如果点击的是当前展开的会话，直接收起
    if (expandedSession === index) {
      this.setData({
        expandedSession: null
      })
      return
    }
    
    // 展开新的会话
    this.setData({
      expandedSession: index,
      sessionId: sessionId
    })
    
    // 更新本地存储中的当前会话ID
    wx.setStorageSync('currentSessionId', sessionId)
    
    // 检查sessionDetails中是否已经有会话详情
    const sessionDetails = this.data.sessionDetails || {}
    if (sessionDetails[sessionId]) {
      // 如果已经有会话详情，直接使用
      console.log('使用本地保存的会话详情')
      // 更新消息列表为该会话的历史记录
      const messages = []
      sessionDetails[sessionId].forEach(chat => {
        messages.push({ role: 'user', content: chat.user_message })
        // 解析AI回复的Markdown内容
        const towxmlContent = towxml(chat.ai_response, 'markdown');
        messages.push({ role: 'bot', content: chat.ai_response, towxmlContent: towxmlContent })
      })
      this.setData({
        messages: messages.length > 0 ? messages : [{ role: 'bot', content: '你好！我是你的 AI 求职顾问，可以问我任何问题 😊' }]
      })
      return
    }
    
    // 获取该会话的详细历史记录
    this.setData({
      isLoadingSessionDetails: true
    })
    
    // 调用获取会话历史的API
    this.fetchSessionHistory(sessionId, true)
      .catch(error => {
        console.error('获取会话详情失败:', error)
      })
  },

  // 聊天输入事件
  onChatInput(e) {
    const value = e.detail.value
    this.setData({
      inputMessage: value,
      isSendButtonEnabled: !!value.trim()
    })
    
    // 当输入内容为空时，重置输入框高度
    if (!value.trim()) {
      this.resetTextareaHeight()
    }
  },
  
  // 重置输入框高度
  resetTextareaHeight() {
    // 获取textarea元素
    const query = wx.createSelectorQuery()
    query.select('.textarea-container .input-text').node().exec((res) => {
      if (res && res[0] && res[0].node) {
        const textarea = res[0].node
        // 保存当前值
        const currentValue = textarea.value
        // 清空内容
        textarea.value = ''
        // 触发输入事件
        textarea.dispatchEvent(new Event('input'))
        // 恢复内容
        textarea.value = currentValue
        // 触发输入事件
        textarea.dispatchEvent(new Event('input'))
      }
    })
  },
  
  // 输入框行数变化事件
  onLineChange(e) {
    // 当输入内容为空时，重置输入框高度
    if (!this.data.inputMessage.trim()) {
      this.resetTextareaHeight()
    }
  },

  // 发送聊天消息
  sendChatMessage() {
    // 检查登录状态
    const accessToken = wx.getStorageSync('accessToken')
    if (!accessToken) {
      wx.showToast({
        title: '请先登录',
        icon: 'none',
        duration: 3000
      })
      return
    }
    
    // 检查使用次数
    const { userUsage } = this.data
    if (userUsage.chat_remaining <= 0) {
      wx.showModal({
        title: '使用次数已达上限',
        content: '今日AI助手对话次数已达上限（5次/天），请明天再来',
        showCancel: false
      })
      return
    }
    
    const { inputMessage, messages, sessionId } = this.data
    
    if (!inputMessage.trim()) {
      return
    }
    
    // 添加用户消息到消息列表
    const userMessage = { role: 'user', content: inputMessage.trim() }
    const updatedMessages = [...messages, userMessage]
    
    this.setData({
      messages: updatedMessages,
      inputMessage: '',
      isSendButtonEnabled: false, // 发送后重置按钮状态
      isLoading: true,
      scrollIntoView: 'scroll-bottom'
    })
    
    // 调用AI聊天API
    this.callChatApi(inputMessage.trim(), sessionId)
  },

  // 调用聊天API
  callChatApi(message, sessionId) {
    // 构建请求参数
    const requestData = {
      user_message: message
    }
    
    // 如果有sessionId，添加到请求中
    if (sessionId) {
      requestData.session_id = sessionId
    }
    
    // 调用API服务
    chat(requestData)
      .then(response => {
        let reply = '抱歉，我暂时无法回答这个问题。'
        
        // 从API响应中提取回复内容
        if (response.ai_response) {
          reply = response.ai_response
        } else if (response.result && response.result.learning_path) {
          reply = response.result.learning_path
        } else if (response.result && response.result.beautified_resume) {
          reply = response.result.beautified_resume
        } else if (response.result && response.result.interview_script) {
          reply = response.result.interview_script
        } else if (response.result && response.result.jd_text) {
          reply = response.result.jd_text
        } else if (response.message) {
          reply = response.message
        }
        
        // 解析Markdown内容
        const towxmlContent = towxml(reply, 'markdown');
        
        // 添加AI回复到消息列表
        const aiMessage = { role: 'bot', content: reply, towxmlContent: towxmlContent }
        const updatedMessages = [...this.data.messages, aiMessage]
        
        // 更新sessionId
        const newSessionId = response.session_id || this.data.sessionId
        
        console.log('当前会话ID:', newSessionId)
        
        this.setData({
          messages: updatedMessages,
          sessionId: newSessionId,
          scrollIntoView: 'scroll-bottom'
        })
        
        // 乐观更新使用情况
        const updatedUsage = {
          ...this.data.userUsage,
          chat_remaining: Math.max(0, this.data.userUsage.chat_remaining - 1)
        }
        this.setData({ userUsage: updatedUsage })
        // 更新全局数据中的用户使用情况
        const app = getApp()
        app.globalData.userUsage = updatedUsage
        
        // 重新加载准确数据
        setTimeout(() => {
          this.loadUserUsage();
        }, 1000);
        
        // 聊天完成后更新对话历史
        this.fetchChatHistory()
      })
      .catch(error => {
        console.error('聊天API调用失败:', error)
        
        // 检查429错误
        if (error.statusCode === 429) {
          wx.showModal({
            title: '使用次数已达上限',
            content: error.data.message || '今日AI助手对话次数已达上限，请明天再来',
            showCancel: false
          })
          this.loadUserUsage(); // 刷新使用情况
        } else {
          this.addErrorMessage()
        }
      })
      .finally(() => {
        this.setData({
          isLoading: false
        })
      })
  },

  // 添加错误消息
  addErrorMessage() {
    const errorMessage = { role: 'bot', content: '抱歉，我暂时无法回答这个问题，请稍后重试。' }
    const updatedMessages = [...this.data.messages, errorMessage]
    
    this.setData({
      messages: updatedMessages,
      scrollIntoView: 'scroll-bottom'
    })
  },
  
  // 创建新对话
  createNewChat() {
    // 检查登录状态
    const accessToken = wx.getStorageSync('accessToken')
    if (!accessToken) {
      wx.showToast({
        title: '请先登录',
        icon: 'none',
        duration: 3000
      })
      return
    }
    
    this.setData({
      isLoading: true
    })
    
    // 调用创建新会话API
    createNewSession().then(sessionRes => {
      if (sessionRes.session_id) {
        // 保存新会话ID到本地存储
        wx.setStorageSync('currentSessionId', sessionRes.session_id)
        console.log('新会话创建成功！session_id:', sessionRes.session_id)
        
        // 清空当前消息列表，显示欢迎消息
        this.setData({
          sessionId: sessionRes.session_id,
          messages: [
            { role: 'bot', content: '你好！我是你的 AI 求职顾问，可以问我任何问题 😊' }
          ],
          scrollIntoView: 'scroll-bottom',
          isLoading: false
        })
        
        // 刷新会话列表，确保新会话显示在列表中
        this.fetchChatHistory()
      } else {
        console.error('创建新会话失败:', sessionRes.message || '未知错误')
        wx.showToast({
          title: '创建新会话失败，请稍后重试',
          icon: 'none'
        })
        this.setData({
          isLoading: false
        })
      }
    }).catch(sessionErr => {
      console.error('创建新会话失败:', sessionErr)
      wx.showToast({
        title: '创建新会话失败，请稍后重试',
        icon: 'none'
      })
      this.setData({
        isLoading: false
      })
    })
  },

  // 一键复制AI回复内容
  copyMessageContent(e) {
    const index = e.currentTarget.dataset.index
    const messages = this.data.messages
    const currentMessage = messages[index]
    
    if (currentMessage && currentMessage.content) {
      // 从内容中提取纯文本，保留原始格式
      // 移除HTML标签，只保留纯文本
      let textContent = currentMessage.content.replace(/<[^>]+>/g, '')
      // 只清理首尾空白，保留原始换行和格式
      textContent = textContent.trim()
      
      // 复制到剪贴板
      wx.setClipboardData({
        data: textContent,
        success: () => {
          wx.showToast({
            title: '复制成功',
            icon: 'success',
            duration: 2000
          })
        },
        fail: (err) => {
          console.error('复制失败:', err)
          wx.showToast({
            title: '复制失败',
            icon: 'none',
            duration: 2000
          })
        }
      })
    }
  },

  // 分享给好友（必须同时存在，否则朋友圈分享不显示）
  onShareAppMessage() {
    return {
      title: '骡马假日助手',
      path: '/pages/chat/chat',
      imageUrl: '/images/logo.jpg'
    };
  },

  // 分享到朋友圈（基础库 2.11.3+）
  onShareTimeline() {
    return {
      title: '骡马假日助手',           // 朋友圈标题（必填）
      query: 'from=timeline',   // 携带参数（可选）
      imageUrl: '/images/logo.jpg'    // 分享图片（可选）
    };
  }
})