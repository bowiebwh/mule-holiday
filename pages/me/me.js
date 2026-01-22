// pages/me/me.js
const app = getApp()

Page({
  data: {
    userInfo: {
      name: '未登录',
      isLogin: false
    },
    historyList: [], // 历史记录列表
    isLoading: false, // 加载状态
    keyword: '', // 搜索关键词
    page: 1, // 当前页码
    pageSize: 20, // 每页数量
    total: 0, // 总记录数
    hasMore: true // 是否还有更多数据
  },

  onLoad() {
    // 页面加载时的初始化
    this.loadHistoryList()
  },

  onShow() {
    // 页面显示时重新加载数据，确保数据最新
    this.loadHistoryList()
    
    // 检查登录状态并更新用户信息
    this.checkLoginStatus()
  },
  
  onTabItemTap() {
    // 当用户点击tab时触发，确保一定会刷新数据
    console.log('tab切换事件触发，开始刷新数据')
    
    // 重置分页参数，确保每次切换tab都从第一页开始加载
    this.setData({
      page: 1,
      hasMore: true
    })
    
    // 检查登录状态
    this.checkLoginStatus()
    
    // 重新加载数据
    this.loadHistoryList()
  },
  
  // 检查登录状态
  checkLoginStatus() {
    // 从本地存储获取token
    const accessToken = wx.getStorageSync('accessToken')
    const app = getApp()
    const globalUserInfo = app.globalData.userInfo || {}
    
    if (accessToken) {
      // 已登录
      this.setData({
        userInfo: {
          name: globalUserInfo.nickname || '微信用户',
          nickname: globalUserInfo.nickname || '',
          avatarUrl: globalUserInfo.avatar_url || '',
          isLogin: true
        }
      })
    } else {
      // 未登录
      this.setData({
        userInfo: {
          name: '未登录',
          isLogin: false
        }
      })
    }
  },

  // 加载历史记录列表
  loadHistoryList() {
    // 检查登录状态
    const accessToken = wx.getStorageSync('accessToken')
    
    if (!accessToken) {
      // 未登录，清空历史记录列表
      this.setData({
        historyList: [],
        total: 0,
        hasMore: false,
        page: 1
      })
      return
    }
    
    if (this.data.isLoading || !this.data.hasMore) {
      return
    }

    this.setData({
      isLoading: true
    })

    const app = getApp()
    const apiBaseUrl = app.globalData.apiBaseUrl
    const { page, pageSize, keyword } = this.data

    // 构建请求URL
    let url = `${apiBaseUrl}/api/job-analysis?page=${page}&page_size=${pageSize}`
    if (keyword) {
      url += `&keyword=${encodeURIComponent(keyword)}`
    }

    // 调用后端API获取历史记录列表
    wx.request({
      url: url,
      method: 'GET',
      header: {
        'content-type': 'application/json',
        'Authorization': `Bearer ${accessToken}` // 使用已获取的accessToken
      },
      timeout: 1800000, // 30分钟超时
      success: (res) => {
        if (res.data.success) {
          const data = res.data.data
          const items = data.items || []
          
          // 处理数据，提取职位名称
          const processedItems = items.map(item => {
            // 从jd_text中提取职位名称
            let positionName = '未知职位'
            if (item.jd_text) {
              const positionMatch = item.jd_text.match(/职位名称：([^\n]+)/)
              if (positionMatch && positionMatch[1]) {
                positionName = positionMatch[1].trim()
              } else {
                positionName = item.jd_text.replace(/^#+/, '').trim().substring(0, 30).trim()
              }
            }
            
            return {
              id: item.id,
              positionName: positionName,
              fullData: item
            }
          })

          // 合并新数据到现有列表
          const newHistoryList = this.data.page === 1 
            ? processedItems 
            : [...this.data.historyList, ...processedItems]

          this.setData({
            historyList: newHistoryList,
            total: data.total || 0,
            hasMore: newHistoryList.length < data.total,
            page: this.data.page + 1
          })
        } else {
          console.error('获取历史记录失败:', res.data.message)
        }
      },
      fail: (err) => {
        console.error('请求历史记录接口失败:', err)
      },
      complete: () => {
        this.setData({
          isLoading: false
        })
      }
    })
  },

  // 删除历史记录
  deleteHistoryItem(e) {
    const recordId = e.currentTarget.dataset.id
    
    // 弹出确认对话框
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条记录吗？',
      success: (res) => {
        if (res.confirm) {
          // 用户确认删除，调用删除接口
          this.confirmDelete(recordId)
        }
      }
    })
  },

  // 确认删除
  confirmDelete(recordId) {
    const app = getApp()
    const apiBaseUrl = app.globalData.apiBaseUrl

    wx.request({
      url: `${apiBaseUrl}/api/job-analysis/${recordId}`,
      method: 'DELETE',
      header: {
        'content-type': 'application/json',
        'Authorization': `Bearer ${wx.getStorageSync('accessToken')}` // 添加认证头
      },
      timeout: 1800000, // 30分钟超时
      success: (res) => {
        if (res.data.success) {
          // 删除成功，更新列表
          this.setData({
            historyList: this.data.historyList.filter(item => item.id !== recordId)
          })
          
          wx.showToast({
            title: '删除成功',
            icon: 'success'
          })
        } else {
          console.error('删除历史记录失败:', res.data.message)
          wx.showToast({
            title: '删除失败',
            icon: 'none'
          })
        }
      },
      fail: (err) => {
        console.error('请求删除接口失败:', err)
        wx.showToast({
          title: '网络错误，请稍后重试',
          icon: 'none'
        })
      }
    })
  },

  // 登录按钮点击事件
  onLogin() {
    const app = getApp()
    const isLogin = this.data.userInfo.isLogin
    
    if (isLogin) {
        // 退出登录逻辑
        wx.showModal({
          title: '确认退出',
          content: '确定要退出登录吗？',
          success: (res) => {
            if (res.confirm) {
              // 调用app.js中的logout方法，清除授权状态
              app.logout()
              // 更新页面数据
              this.setData({
                userInfo: {
                  name: '未登录',
                  isLogin: false
                },
                // 清空历史记录列表
                historyList: [],
                total: 0,
                hasMore: false
              })
              // 显示退出成功提示
              wx.showToast({
                title: '退出成功',
                icon: 'success'
              })
            }
          }
        })
      } else {
      // 登录逻辑
      // 直接调用登录，不显示加载提示，因为wx.getUserProfile会弹出授权框
      app.login().then(res => {
        // 登录成功
        
        // 获取全局用户信息
        const globalUserInfo = app.globalData.userInfo || {};
        console.log('登录成功后获取的全局用户信息:', globalUserInfo);
        
        // 更新页面用户信息
        this.setData({
          userInfo: {
            name: globalUserInfo.nickname || '微信用户',
            nickname: globalUserInfo.nickname || '',
            avatarUrl: globalUserInfo.avatar_url || '',
            isLogin: true
          }
        })
        
        // 显示登录成功提示
        wx.showToast({
          title: '登录成功',
          icon: 'success'
        })
        
        // 重置历史记录相关状态，确保能正常加载数据
        this.setData({
          page: 1,
          hasMore: true,
          isLoading: false
        })
        
        // 登录成功后刷新历史记录列表
        this.loadHistoryList()
      }).catch(err => {
        // 登录失败
        console.error('登录失败:', err);
        // 只在非用户拒绝授权的情况下显示失败提示
        if (err.message.indexOf('用户拒绝授权') === -1) {
          wx.showToast({
            title: '登录失败',
            icon: 'none'
          });
        }
      })
    }
  },

  // 加载更多数据
  loadMore() {
    this.loadHistoryList()
  }
})