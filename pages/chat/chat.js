// pages/chat/chat.js
const app = getApp()
const { chat, getChatHistory, getChatSessions, createNewSession } = require('../../api/index')

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
    isLoadingSessionDetails: false
  },

  // 页面加载时的初始化
  onLoad() {
    this.setData({
      isSendButtonEnabled: false
    })
  },
  
  // 页面显示时获取对话历史
  onShow() {
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
          // 保存会话列表
          this.setData({
            chatHistoryBySession: response.sessions
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
    
    getChatHistory({
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
              messages.push({ role: 'bot', content: chat.ai_response })
            })
            
            this.setData({
              messages: messages,
              scrollIntoView: 'scroll-bottom'
            })
          }
        }
      })
      .catch(error => {
        console.error('获取会话历史失败:', error)
      })
      .finally(() => {
        this.setData({ isLoading: false })
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
    const sessionId = chatHistoryBySession[index].session_id
    
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
        messages.push({ role: 'bot', content: chat.ai_response })
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
      .finally(() => {
        this.setData({
          isLoadingSessionDetails: false
        })
      })
  },

  // 聊天输入事件
  onChatInput(e) {
    const value = e.detail.value
    this.setData({
      inputMessage: value,
      isSendButtonEnabled: !!value.trim()
    })
  },

  // 发送聊天消息
  sendChatMessage() {
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
        
        // 添加AI回复到消息列表
        const aiMessage = { role: 'bot', content: reply }
        const updatedMessages = [...this.data.messages, aiMessage]
        
        // 更新sessionId
        const newSessionId = response.session_id || this.data.sessionId
        
        console.log('当前会话ID:', newSessionId)
        
        this.setData({
          messages: updatedMessages,
          sessionId: newSessionId,
          scrollIntoView: 'scroll-bottom'
        })
        
        // 聊天完成后更新对话历史
        this.fetchChatHistory()
      })
      .catch(error => {
        console.error('聊天API调用失败:', error)
        this.addErrorMessage()
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
  }
})