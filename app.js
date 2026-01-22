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
  login() {
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
                code: loginRes.code
              },
              header: {
                'content-type': 'application/json'
              },
              success: res => {
                if (res.data.success) {
                  // 3. 保存token到本地存储
                  const { access_token, refresh_token, user_info } = res.data.data
                  wx.setStorageSync('accessToken', access_token)
                  wx.setStorageSync('refreshToken', refresh_token)
                  
                  // 保存用户信息到globalData
                  this.globalData.userInfo = user_info
                  
                  // 4. 登录成功后创建新会话
                  const api = require('./api/index')
                  api.createNewSession().then(sessionRes => {
                    if (sessionRes.session_id) {
                      // 保存新会话ID到本地存储
                      wx.setStorageSync('currentSessionId', sessionRes.session_id)
                      console.log('新会话创建成功！session_id:', sessionRes.session_id)
                    } else {
                      console.error('创建新会话失败:', sessionRes.message || '未知错误')
                    }
                    console.log('登录成功！', this.globalData.userInfo)
                    resolve(res.data)
                  }).catch(sessionErr => {
                    console.error('创建新会话失败:', sessionErr)
                    // 即使创建会话失败，登录也视为成功
                    console.log('登录成功！', this.globalData.userInfo)
                    resolve(res.data)
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
    console.log('退出登录成功！')
  },
  globalData: {
    userInfo: null,
    apiBaseUrl: 'https://h7fs9pqcvf.coze.site', // 后端服务地址
    // 存储临时数据
    jobInfo: null,
    resumeInfo: null,
    beautifiedResume: null,
    interviewScript: null,
    learningPlan: null
  }
})