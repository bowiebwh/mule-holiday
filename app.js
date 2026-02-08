// app.js
App({
  onLaunch() {
    // 展示本地存储能力
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)
    
    // 检查本地是否有token，如果有则直接使用
    const accessToken = wx.getStorageSync('accessToken')
    if (accessToken) {
      console.log('使用本地存储的token登录')
    }
  },

  // 微信登录 - 必须由用户点击事件直接调用
  login(userInfo = null) {
    return new Promise((resolve, reject) => {
      // 1. 调用wx.login获取code
      wx.login({
        success: loginRes => {
          if (loginRes.code) {
            // 2. 调用后端登录接口
            wx.request({
              url: `${this.globalData.apiBaseUrl}/api/login`,
              method: 'POST',
              data: {
                code: loginRes.code,
                user_info: userInfo
              },
              header: {
                'content-type': 'application/json'
              },
              success: res => {
                if (res.data.success) {
                  // 3. 保存token到本地存储
                  const { access_token, refresh_token } = res.data.data
                  wx.setStorageSync('accessToken', access_token)
                  wx.setStorageSync('refreshToken', refresh_token)
                  
                  // 4. 登录成功后获取用户完整信息
                  wx.request({
                    url: `${this.globalData.apiBaseUrl}/api/me`,
                    method: 'GET',
                    header: {
                      'content-type': 'application/json',
                      'Authorization': `Bearer ${access_token}`
                    },
                    success: (userInfoRes) => {
                      if (userInfoRes.data.success) {
                        // ✅ 修复：直接使用后端返回的 userInfo，无需额外处理
                        const userInfo = userInfoRes.data.data
                        console.log('获取用户完整信息:', userInfo)
                        
                        // 保存用户信息到globalData
                        this.globalData.userInfo = userInfo
                        console.log('更新后的全局用户信息:', this.globalData.userInfo)
                        
                        // 通知所有页面更新用户信息
                        if (this.updateUserInfoCallback) {
                          this.updateUserInfoCallback(this.globalData.userInfo)
                        }
                      }
                      
                      // 5. 创建新会话
                      const api = require('./api/index')
                      api.createNewSession().then(sessionRes => {
                        if (sessionRes.session_id) {
                          wx.setStorageSync('currentSessionId', sessionRes.session_id)
                          console.log('新会话创建成功！session_id:', sessionRes.session_id)
                        }
                        console.log('登录成功！', this.globalData.userInfo)
                        resolve(res.data)
                      }).catch(sessionErr => {
                        console.error('创建新会话失败:', sessionErr)
                        console.log('登录成功！', this.globalData.userInfo)
                        resolve(res.data)
                      })
                    },
                    fail: (err) => {
                      console.error('获取用户完整信息失败:', err)
                      
                      // 创建新会话
                      const api = require('./api/index')
                      api.createNewSession().then(sessionRes => {
                        if (sessionRes.session_id) {
                          wx.setStorageSync('currentSessionId', sessionRes.session_id)
                          console.log('新会话创建成功！session_id:', sessionRes.session_id)
                        }
                        console.log('登录成功！', this.globalData.userInfo)
                        resolve(res.data)
                      }).catch(sessionErr => {
                        console.error('创建新会话失败:', sessionErr)
                        console.log('登录成功！', this.globalData.userInfo)
                        resolve(res.data)
                      })
                    }
                  })
                } else {
                  const err = new Error(`登录失败！${res.data.message}`)
                  console.error(err.message)
                  reject(err)
                }
              },
              fail: err => {
                console.error('调用登录API失败！', err)
                reject(err)
              }
            })
          } else {
            const err = new Error('登录失败！获取code失败')
            console.error(err.message)
            reject(err)
          }
        },
        fail: loginErr => {
          console.error('调用wx.login失败！', loginErr)
          reject(loginErr)
        }
      })
    })
  },

  // 刷新token
  refreshToken() {
    return new Promise((resolve, reject) => {
      const refreshToken = wx.getStorageSync('refreshToken')
      if (!refreshToken) {
        reject(new Error('refreshToken不存在'))
        return
      }
      
      wx.request({
        url: `${this.globalData.apiBaseUrl}/api/refresh-token`,
        method: 'POST',
        data: {
          refresh_token: refreshToken
        },
        header: {
          'content-type': 'application/json'
        },
        success: res => {
          if (res.data.success) {
            // 保存新的token到本地存储
            const { access_token, refresh_token } = res.data.data
            wx.setStorageSync('accessToken', access_token)
            wx.setStorageSync('refreshToken', refresh_token)
            
            console.log('刷新token成功！')
            resolve(res.data)
          } else {
            const err = new Error(`刷新token失败！${res.data.message}`)
            console.error(err.message)
            // 清除本地存储的token
            this.logout()
            reject(err)
          }
        },
        fail: err => {
          console.error('调用刷新tokenAPI失败！', err)
          // 清除本地存储的token
          this.logout()
          reject(err)
        }
      })
    })
  },
  
  // 退出登录并清除授权状态
  logout() {
    // 清除本地存储的token
    wx.removeStorageSync('accessToken')
    wx.removeStorageSync('refreshToken')
    // 清除会话相关数据
    wx.removeStorageSync('currentSessionId')
    // 清空globalData中的用户信息
    this.globalData.userInfo = null
    // 清除授权状态
    wx.setStorageSync('authSetting', {})
    // 清除临时数据，确保退出登录后看不到之前的分析结果
    this.globalData.jobInfo = null
    this.globalData.resumeInfo = null
    this.globalData.beautifiedResume = null
    this.globalData.interviewScript = null
    this.globalData.learningPlan = null
    console.log('退出登录成功！')
  },
  
  globalData: {
    userInfo: null,
    apiBaseUrl: 'https://h7fs9pqcvf.coze.site',
    // 存储临时数据
    jobInfo: null,
    resumeInfo: null,
    beautifiedResume: null,
    interviewScript: null,
    learningPlan: null,
    // 用户使用情况
    userUsage: {
      stream_run_remaining: 1,
      interview_remaining: 1,
      learning_path_remaining: 1,
      chat_remaining: 5
    }
  }
})