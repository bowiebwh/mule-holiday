// pages/me/me.js
const app = getApp()

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

Page({
  data: {
    userInfo: {
      name: '未登录',
      isLogin: false
    },
    userLevel: {
      level: 0,
      name: '',
      icon: '',
      description: '',
      progress: 0,
      tip: '',
      next_level_requirement: '',
      total_usage_count: 0,
      secret_tip: '',
      emoji_reaction: ''
    },
    levelIconPath: '', // 等级图标路径
    showLevelDetail: false, // 等级详情弹窗显示状态
    showImagePreview: false, // 图片预览弹窗显示状态
    previewImagePath: '', // 预览图片路径
    historyList: [], // 历史记录列表
    isLoading: false, // 加载状态
    keyword: '', // 搜索关键词
    page: 1, // 当前页码
    pageSize: 20, // 每页数量
    total: 0, // 总记录数
    hasMore: true, // 是否还有更多数据
    // 反馈相关状态
    showFeedback: false, // 是否显示反馈表单
    showSuccess: false, // 是否显示成功提示
    feedbackData: {
      feedback_type: 'bug',
      title: '',
      content: '',
      contact: ''
    },
    isSubmitting: false // 提交状态
  },

  onLoad() {
    // 页面加载时的初始化
    this.loadHistoryList()
    
    // 注册用户信息更新回调
    const app = getApp()
    app.updateUserInfoCallback = (userInfo) => {
      console.log('收到用户信息更新通知:', userInfo)
      this.checkLoginStatus()
    }
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
    
    console.log('检查登录状态 - globalUserInfo:', globalUserInfo)
    
    if (accessToken) {
      // 已登录
      const avatarUrl = globalUserInfo.avatar_url || ''
      console.log('检查登录状态 - avatarUrl:', avatarUrl)
      
      this.setData({
        userInfo: {
          name: globalUserInfo.nickname || '微信用户',
          nickname: globalUserInfo.nickname || '',
          avatarUrl: avatarUrl,
          gender: globalUserInfo.gender || 0,
          country: globalUserInfo.country || '',
          province: globalUserInfo.province || '',
          city: globalUserInfo.city || '',
          language: globalUserInfo.language || '',
          isLogin: true
        }
      })
      
      console.log('检查登录状态 - 更新后的userInfo:', this.data.userInfo)
      
      // 登录成功后加载等级信息
      this.loadUserLevel()
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
              fullData: item,
              formattedTime: formatDateTime(item.created_at)
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

  // 登录/退出登录按钮点击事件
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
      // 登录逻辑：使用wx.getUserProfile获取用户信息
      wx.getUserProfile({
        desc: '用于完善会员资料', // 声明获取用户信息的用途，必填
        success: (res) => {
          // 用户授权成功，获取用户信息
          const userInfo = res.userInfo
          console.log('用户授权成功，获取到的用户信息:', userInfo)
          
          // 调用登录方法，传递用户信息
          app.login(userInfo).then(res => {
            // 登录成功
            
          // 获取全局用户信息
          const globalUserInfo = app.globalData.userInfo || {};
          console.log('登录成功后获取的全局用户信息:', globalUserInfo);
            
          // 检查用户信息是否完整
          if (!globalUserInfo.nickname || !globalUserInfo.avatar_url) {
            // 用户信息不完整，跳转到资料编辑页面
            wx.showToast({
              title: '请完善个人资料',
              icon: 'none'
            })
            
            // 延迟跳转，确保用户看到提示
            setTimeout(() => {
              wx.navigateTo({
                url: '/pages/profile-edit/profile-edit'
              })
            }, 1000)
          } else {
            // 用户信息完整，更新页面数据
            // 更新页面用户信息
            this.setData({
              userInfo: {
                name: globalUserInfo.nickname || userInfo.nickname || '微信用户',
                nickname: globalUserInfo.nickname || userInfo.nickname || '',
                avatarUrl: globalUserInfo.avatar_url || userInfo.avatarUrl || '',
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
          }
          }).catch(err => {
            // 登录失败
            console.error('登录失败:', err);
            // 显示失败提示
            wx.showToast({
              title: '登录失败',
              icon: 'none'
            });
          })
        },
        fail: (err) => {
          // 用户拒绝授权
          console.log('用户拒绝授权:', err);
          wx.showToast({
            title: '授权失败，请允许授权后重试',
            icon: 'none'
          });
        }
      })
    }
  },

  // 加载更多数据
  loadMore() {
    this.loadHistoryList()
  },

  // 显示反馈表单
  showFeedbackForm() {
    // 检查登录状态，未登录用户不能提交反馈
    if (!this.data.userInfo.isLogin) {
      wx.showToast({
        title: '请先登录',
        icon: 'none',
        duration: 3000
      })
      return
    }
    
    this.setData({
      showFeedback: true,
      feedbackData: {
        feedback_type: 'bug',
        title: '',
        content: '',
        contact: ''
      }
    })
  },

  // 关闭反馈表单
  closeFeedbackForm() {
    this.setData({
      showFeedback: false
    })
  },

  // 选择反馈类型
  selectFeedbackType(e) {
    const type = e.currentTarget.dataset.type
    this.setData({
      'feedbackData.feedback_type': type
    })
  },

  // 处理反馈输入
  onFeedbackInput(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    this.setData({
      [`feedbackData.${field}`]: value
    })
  },

  // 提交反馈
  submitFeedback() {
    // 检查登录状态，未登录用户不能提交反馈
    if (!this.data.userInfo.isLogin) {
      wx.showToast({
        title: '请先登录',
        icon: 'none',
        duration: 3000
      })
      return
    }
    
    const { feedback_type, title, content, contact } = this.data.feedbackData

    // 验证必填字段
    if (!feedback_type) {
      wx.showToast({
        title: '请选择反馈类型',
        icon: 'none'
      })
      return
    }

    if (!title.trim()) {
      wx.showToast({
        title: '反馈标题不能为空',
        icon: 'none'
      })
      return
    }

    if (!content.trim()) {
      wx.showToast({
        title: '反馈内容不能为空',
        icon: 'none'
      })
      return
    }

    // 检查登录状态
    const accessToken = wx.getStorageSync('accessToken')
    if (!accessToken) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      })
      return
    }

    this.setData({ isSubmitting: true })

    const app = getApp()
    const apiBaseUrl = app.globalData.apiBaseUrl

    // 提交反馈
    wx.request({
      url: `${apiBaseUrl}/api/feedback`,
      method: 'POST',
      header: {
        'content-type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      data: {
        feedback_type,
        title: title.trim(),
        content: content.trim(),
        contact: contact.trim()
      },
      timeout: 30000,
      success: (res) => {
        if (res.data.success) {
          // 提交成功，显示自定义提示
          this.showSuccessToast()
          this.closeFeedbackForm()
        } else {
          wx.showToast({
            title: res.data.message || '提交失败，请重试',
            icon: 'none'
          })
        }
      },
      fail: (err) => {
        console.error('提交反馈失败:', err)
        wx.showToast({
          title: '网络错误，请稍后重试',
          icon: 'none'
        })
      },
      complete: () => {
        this.setData({ isSubmitting: false })
      }
    })
  },

  // 显示成功提示
  showSuccessToast() {
    this.setData({
      showSuccess: true
    })
  },

  // 关闭成功提示弹窗
  closeSuccessModal() {
    this.setData({
      showSuccess: false
    })
  },

  // 选择头像
  onChooseAvatar(e) {
    const { avatarUrl } = e.detail
    
    // 更新本地头像显示
    this.setData({
      'userInfo.avatarUrl': avatarUrl
    })
    
    // 上传头像并更新用户信息
    this.updateUserInfo({ avatar_url: avatarUrl })
  },

  // 昵称输入完成
  onNicknameBlur(e) {
    const nickname = e.detail.value.trim()
    if (nickname) {
      // 更新本地昵称显示
      this.setData({
        'userInfo.nickname': nickname
      })
      
      // 更新用户信息
      this.updateUserInfo({ nickname })
    }
  },

  // 更新用户信息
  updateUserInfo(updatedData) {
    const accessToken = wx.getStorageSync('accessToken')
    if (!accessToken) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      })
      return
    }
    
    const app = getApp()
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
        if (res.data.success) {
          // 更新成功，更新全局用户信息
          const updatedUserInfo = res.data.data
          app.globalData.userInfo = updatedUserInfo
          
          // 更新页面用户信息
          this.setData({
            userInfo: {
              ...this.data.userInfo,
              nickname: updatedUserInfo.nickname,
              avatarUrl: updatedUserInfo.avatar_url,
              gender: updatedUserInfo.gender,
              country: updatedUserInfo.country,
              province: updatedUserInfo.province,
              city: updatedUserInfo.city,
              language: updatedUserInfo.language
            }
          })
          
          wx.showToast({
            title: '更新成功',
            icon: 'success'
          })
        } else {
          console.error('更新用户信息失败:', res.data.message)
          wx.showToast({
            title: '更新失败，请稍后重试',
            icon: 'none'
          })
        }
      },
      fail: (err) => {
        console.error('更新用户信息请求失败:', err)
        wx.showToast({
          title: '网络错误，请稍后重试',
          icon: 'none'
        })
      }
    })
  },

  // 下载历史记录中的优化后简历
  downloadHistoryResume(e) {
    const id = e.currentTarget.dataset.id
    const historyItem = this.data.historyList.find(item => item.id === id)
    
    if (!historyItem || !historyItem.fullData.beautified_resume_url) {
      wx.showToast({
        title: '暂无法下载简历',
        icon: 'none'
      })
      return
    }
    
    const downloadUrl = historyItem.fullData.beautified_resume_url.trim()
    
    wx.showLoading({
      title: '正在下载简历...',
    })
    
    // 下载文件
    wx.downloadFile({
      url: downloadUrl,
      timeout: 600000, // 延长超时时间到10分钟，适应长响应时间
      success: function(res) {
        wx.hideLoading()
        
        if (res.statusCode === 200) {
          // 打开下载的文件
          wx.openDocument({
            filePath: res.tempFilePath,
            fileType: 'docx',
            showMenu: true, // 允许用户选择其他应用打开
            success: function(openRes) {
              console.log('文件打开成功', openRes)
            },
            fail: function(openErr) {
              console.error('文件打开失败', openErr)
              wx.showToast({
                title: '文件打开失败，请重试',
                icon: 'none'
              })
            }
          })
        } else {
          wx.showToast({
            title: '下载失败，请重试',
            icon: 'none'
          })
        }
      },
      fail: function(err) {
        wx.hideLoading()
        console.error('下载失败', err)
        wx.showToast({
          title: '下载失败，请重试',
          icon: 'none'
        })
      }
    })
  },

  // 加载用户等级信息
  loadUserLevel() {
    const accessToken = wx.getStorageSync('accessToken')
    if (!accessToken) {
      return
    }

    const app = getApp()
    const apiBaseUrl = app.globalData.apiBaseUrl

    wx.request({
      url: `${apiBaseUrl}/api/level/info`,
      method: 'GET',
      header: {
        'content-type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      success: (res) => {
        if (res.data.success) {
          const userLevel = res.data.data
          console.log('后端返回的userLevel数据:', userLevel)
          
          // 确保所有必要字段存在
          if (!userLevel) {
            console.error('后端返回的userLevel数据为空')
            return
          }
          
          // 确保progress字段存在且为数字
          if (userLevel.progress === undefined || userLevel.progress === null || isNaN(userLevel.progress)) {
            // 如果没有progress字段或不是数字，尝试计算
            if (userLevel.total_usage_count && userLevel.next_level_requirement && userLevel.next_level_requirement > 0) {
              userLevel.progress = Math.min(100, Math.round((userLevel.total_usage_count / userLevel.next_level_requirement) * 100))
            } else {
              userLevel.progress = 0
            }
          } else {
            // 确保是数字类型
            userLevel.progress = Number(userLevel.progress)
          }
          
          console.log('处理后的userLevel.progress:', userLevel.progress, '类型:', typeof userLevel.progress)
          
          // 确保next_level_requirement字段存在
          if (!userLevel.next_level_requirement) {
            userLevel.next_level_requirement = '继续努力'
          }
          
          const levelIconPath = this.getLevelIconPath(userLevel.level)
          this.setData({
            userLevel: userLevel,
            levelIconPath: levelIconPath
          })
          
          console.log('setData后的userLevel:', this.data.userLevel)
        } else {
          console.error('获取等级信息失败:', res.data.message)
        }
      },
      fail: (err) => {
        console.error('获取等级信息失败:', err)
      }
    })
  },

  // 检查登录状态
  checkLoginStatus() {
    // 从本地存储获取token
    const accessToken = wx.getStorageSync('accessToken')
    const app = getApp()
    const globalUserInfo = app.globalData.userInfo || {}
    
    console.log('检查登录状态 - globalUserInfo:', globalUserInfo)
    
    if (accessToken) {
      // 已登录
      const avatarUrl = globalUserInfo.avatar_url || ''
      console.log('检查登录状态 - avatarUrl:', avatarUrl)
      
      this.setData({
        userInfo: {
          name: globalUserInfo.nickname || '微信用户',
          nickname: globalUserInfo.nickname || '',
          avatarUrl: avatarUrl,
          gender: globalUserInfo.gender || 0,
          country: globalUserInfo.country || '',
          province: globalUserInfo.province || '',
          city: globalUserInfo.city || '',
          language: globalUserInfo.language || '',
          isLogin: true
        }
      })
      
      console.log('检查登录状态 - 更新后的userInfo:', this.data.userInfo)
      
      // 登录成功后加载等级信息
      this.loadUserLevel()
    } else {
      // 未登录
      this.setData({
        userInfo: {
          name: '未登录',
          isLogin: false
        },
        userLevel: {
          level: 0,
          name: '',
          icon: '',
          description: '',
          progress: 0,
          tip: '',
          next_level_requirement: '',
          total_usage_count: 0,
          secret_tip: '',
          emoji_reaction: ''
        },
        levelIconPath: ''
      })
    }
  },

  // 显示等级详情
  showLevelDetail() {
    this.setData({
      showLevelDetail: true
    })
  },

  // 关闭等级详情
  closeLevelDetail() {
    this.setData({
      showLevelDetail: false
    })
  },

  // 显示秘密提示
  showSecretTip() {
    if (this.data.userLevel.secret_tip) {
      wx.showToast({
        title: this.data.userLevel.secret_tip,
        icon: 'none',
        duration: 3000
      })
    }
  },

  // 预览等级图标
  previewLevelIcon() {
    console.log('previewLevelIcon called')
    const { levelIconPath } = this.data
    console.log('levelIconPath:', levelIconPath)
    if (levelIconPath) {
      // 使用微信原生图片预览API
      console.log('using wx.previewImage')
      wx.previewImage({
        urls: [levelIconPath],
        current: levelIconPath,
        success: (res) => {
          console.log('wx.previewImage success:', res)
        },
        fail: (err) => {
          console.error('wx.previewImage fail:', err)
          wx.showToast({
            title: '预览失败，请重试',
            icon: 'none'
          })
        }
      })
    } else {
      // 如果没有图片，显示提示
      wx.showToast({
        title: '暂无图标可预览',
        icon: 'none'
      })
    }
  },

  // 关闭图片预览
  closeImagePreview() {
    this.setData({
      showImagePreview: false,
      previewImagePath: ''
    })
  },

  // 下载等级图标
  downloadLevelIcon() {
    const { levelIconPath } = this.data
    if (levelIconPath) {
      wx.showLoading({
        title: '保存中...'
      })
      
      // 对于本地图片，我们使用一个更简单的方法
      // 直接尝试保存图片
      wx.getFileSystemManager().readFile({
        filePath: levelIconPath,
        success: (res) => {
          // 创建临时文件
          const tempFilePath = wx.env.USER_DATA_PATH + '/level_icon_' + Date.now() + '.png'
          
          // 写入临时文件
          wx.getFileSystemManager().writeFile({
            filePath: tempFilePath,
            data: res.data,
            encoding: 'binary',
            success: () => {
              // 保存到相册
              wx.saveImageToPhotosAlbum({
                filePath: tempFilePath,
                success: () => {
                  wx.hideLoading()
                  wx.showToast({
                    title: '图标已保存到相册',
                    icon: 'success'
                  })
                },
                fail: (err) => {
                  wx.hideLoading()
                  if (err.errMsg.includes('permission')) {
                    wx.showModal({
                      title: '权限提示',
                      content: '需要保存图片到相册的权限，请在设置中开启',
                      success: (res) => {
                        if (res.confirm) {
                          wx.openSetting()
                        }
                      }
                    })
                  } else {
                    wx.showToast({
                      title: '保存失败，请稍后重试',
                      icon: 'none'
                    })
                  }
                }
              })
            },
            fail: (err) => {
              wx.hideLoading()
              wx.showToast({
                title: '保存失败，请稍后重试',
                icon: 'none'
              })
            }
          })
        },
        fail: (err) => {
          wx.hideLoading()
          // 如果readFile失败，尝试另一种方法
          wx.showToast({
            title: '保存失败，请稍后重试',
            icon: 'none'
          })
        }
      })
    } else {
      // 如果没有图片，显示提示
      wx.showToast({
        title: '暂无图标可下载',
        icon: 'none'
      })
    }
  },

  // 获取等级对应的图标路径
  getLevelIconPath(level) {
    const levelIcons = {
      1: '/images/toilet.png',       // 马桶盖新手
      2: '/images/vest.png',          // 马甲萌新
      3: '/images/virus.png',         // 木马侦察兵
      4: '/images/sidehorse.png',     // 鞍马实习生
      5: '/images/hippocampus.png',   // 海马记忆者
      6: '/images/mosaic.png',        // 马赛克达人
      7: '/images/potato.png',        // 马铃薯农场主
      8: '/images/roadcommand.png',   // 马路指挥官
      9: '/images/markpen.png',       // 马克笔大师
      10: '/images/horsegod.png'      // 马神降临
    }
    return levelIcons[level] || '/images/toilet.png'
  },

  // 编辑个人资料
  onEditProfile() {
    console.log('onEditProfile called')
    wx.navigateTo({
      url: '/pages/profile-edit/profile-edit',
      success: function(res) {
        console.log('navigateTo success:', res)
      },
      fail: function(err) {
        console.log('navigateTo fail:', err)
      }
    })
  }
})