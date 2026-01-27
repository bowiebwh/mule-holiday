// pages/profile-edit/profile-edit.js
const app = getApp()

Page({
  data: {
    avatarUrl: '', // 头像URL
    nickname: '', // 昵称
    originalAvatarUrl: '', // 原始头像URL（用于比较是否修改）
    originalNickname: '' // 原始昵称（用于比较是否修改）
  },

  onLoad(options) {
    // 初始化页面数据
    this.initData()
  },

  // 初始化页面数据
  initData() {
    const globalUserInfo = app.globalData.userInfo || {}
    
    this.setData({
      avatarUrl: globalUserInfo.avatar_url || '/images/me-active.png',
      nickname: globalUserInfo.nickname || '',
      originalAvatarUrl: globalUserInfo.avatar_url || '',
      originalNickname: globalUserInfo.nickname || ''
    })
  },

  // 选择头像
  onChooseAvatar(e) {
    const { avatarUrl } = e.detail
    
    // 先更新本地显示
    this.setData({
      avatarUrl: avatarUrl
    })
    
    // 上传头像到服务器
    this.uploadAvatar(avatarUrl)
  },

  // 上传头像到服务器
  uploadAvatar(tempFilePath) {
    const accessToken = wx.getStorageSync('accessToken')
    if (!accessToken) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      })
      return
    }
    
    wx.showLoading({
      title: '上传中...',
      mask: true
    })
    
    const apiBaseUrl = app.globalData.apiBaseUrl
    
    // 上传文件
    wx.uploadFile({
      url: `${apiBaseUrl}/api/upload/avatar`,
      filePath: tempFilePath,
      name: 'file',
      header: {
        'Authorization': `Bearer ${accessToken}`
      },
      success: (res) => {
        wx.hideLoading()
        
        try {
          const data = JSON.parse(res.data)
          if (data.success) {
            // ✅ 修改1：更新头像URL为服务器返回的外网URL
            this.setData({
              avatarUrl: data.file_url,
              originalAvatarUrl: data.file_url  // 更新原始URL，避免重复保存
            })
            
            // ✅ 修改2：重新获取用户信息（数据库已自动更新）
            this.refreshUserInfo()
            
            wx.showToast({
              title: '头像更新成功',
              icon: 'success'
            })
          } else {
            console.error('上传失败:', data.message)
            wx.showToast({
              title: '上传失败，请重试',
              icon: 'none'
            })
          }
        } catch (err) {
          console.error('解析上传响应失败:', err)
          wx.showToast({
            title: '上传失败，请重试',
            icon: 'none'
          })
        }
      },
      fail: (err) => {
        wx.hideLoading()
        console.error('上传请求失败:', err)
        wx.showToast({
          title: '网络错误，请重试',
          icon: 'none'
        })
      }
    })
  },

  // 昵称输入
  onNicknameInput(e) {
    const nickname = e.detail.value.trim()
    this.setData({
      nickname: nickname
    })
  },

  // ✅ 修改3：保存按钮只处理昵称更新（头像已在上传时更新）
  onSave() {
    const { nickname, originalNickname } = this.data
    
    // 检查昵称是否有修改
    if (nickname === originalNickname) {
      // 昵称未修改，直接返回
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
      return
    }
    
    // 只更新昵称
    const updateData = { nickname: nickname }
    
    // 调用更新接口
    this.updateUserInfo(updateData)
  },

  // ✅ 新增：重新获取用户信息
  refreshUserInfo() {
    const accessToken = wx.getStorageSync('accessToken')
    if (!accessToken) {
      return
    }
    
    const apiBaseUrl = app.globalData.apiBaseUrl
    
    wx.request({
      url: `${apiBaseUrl}/api/me`,
      method: 'GET',
      header: {
        'Authorization': `Bearer ${accessToken}`
      },
      success: (res) => {
        if (res.data.success) {
          // 更新全局用户信息
          app.globalData.userInfo = res.data.data
          
          // 更新本地数据
          this.setData({
            avatarUrl: res.data.data.avatar_url,
            nickname: res.data.data.nickname,
            originalAvatarUrl: res.data.data.avatar_url,
            originalNickname: res.data.data.nickname
          })
        }
      },
      fail: (err) => {
        console.error('获取用户信息失败:', err)
      }
    })
  },

  // 更新用户信息（用于更新昵称）
  updateUserInfo(updatedData) {
    const accessToken = wx.getStorageSync('accessToken')
    if (!accessToken) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      })
      return
    }
    
    wx.showLoading({
      title: '保存中...',
      mask: true
    })
    
    const apiBaseUrl = app.globalData.apiBaseUrl
    
    wx.request({
      url: `${apiBaseUrl}/api/me`,
      method: 'PATCH',
      header: {
        'content-type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      data: updatedData,
      success: (res) => {
        wx.hideLoading()
        
        if (res.data.success) {
          // 更新成功，刷新全局用户信息
          this.refreshUserInfo()
          
          wx.showToast({
            title: '保存成功',
            icon: 'success'
          })
          
          // 返回上一页
          setTimeout(() => {
            wx.navigateBack()
          }, 1500)
        } else {
          console.error('更新用户信息失败:', res.data.message)
          wx.showToast({
            title: '保存失败，请重试',
            icon: 'none'
          })
        }
      },
      fail: (err) => {
        wx.hideLoading()
        console.error('更新用户信息请求失败:', err)
        wx.showToast({
          title: '网络错误，请重试',
          icon: 'none'
        })
      }
    })
  },

  // 取消操作
  onCancel() {
    // 询问是否放弃修改
    wx.showModal({
      title: '取消编辑',
      content: '确定要放弃所有修改吗？',
      success: (res) => {
        if (res.confirm) {
          wx.navigateBack()
        }
      }
    })
  },

  // 页面卸载时的操作
  onUnload() {
    // 可以在这里添加清理操作
  }
})