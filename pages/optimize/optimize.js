// pages/optimize/optimize.js
const app = getApp()
const { extractJD, extractResume, beautifyResume, generateInterview, generateLearningPath } = require('../../api/index')

Page({
  data: {
    jobUrl: '',
    fileName: '',
    resumeFile: null,
    file_key: '',
    file_url: '',
    isLoading: false,
    progress: 0,
    record_id: '', // 用于保存从SSE消息中获取的真实record_id
    isSubmitCalled: false, // 用于跟踪是否调用过一键生成全部按钮
    isLoggedIn: false, // 登录状态
    jobInfo: {
      position_name: '',
      job_type: '',
      salary: '',
      company_name: '',
      requirements: []
    },
    expandedRequirements: {}, // 用于控制岗位要求的展开/收起状态
    isEditingPosition: false, // 用于控制岗位名称是否可编辑
    result: {
      jd_text: '',
      beautified_resume: '',
      interview_script: '',
      learning_path: ''
    },
    selectedImages: [],  // 选中的图片
    taskId: null,        // 任务 ID
    uploadProgress: 0,   // 上传进度
    ocrStatus: 'idle',   // idle, uploading, processing, completed
    ocrResult: null,     // OCR 结果
    // 队列 API 相关状态
    status: '',          // QUEUED/RUNNING/SUCCESS/FAILED - 任务状态
    queuePosition: null, // 排队位置
    estimatedWaitTime: 0, // 预计等待时间
    progressMessage: '', // 进度描述
    cancelPoll: null,    // 取消轮询的定时器
    isPolling: false,     // 是否正在轮询
    // 队列总人数相关
    queueTotal: 0,       // 队列总人数
    queueStats: {},      // 队列统计信息
    queueTip: '',        // 排队提示文本
    estimatedWaitTimeFormatted: '', // 格式化的预计等待时间
    // 悬浮框相关
    floatBoxPosition: {
      x: 220,            // 初始X坐标（中上方）
      y: 14             // 初始Y坐标（JD文字描述上方）
    },
    floatBoxExpanded: false, // 悬浮框是否展开
    floatBoxDragging: false, // 悬浮框是否正在拖动
    floatBoxStartX: 0,      // 拖动开始X坐标
    floatBoxStartY: 0,      // 拖动开始Y坐标
    // 用户使用情况
    userUsage: {
      stream_run_remaining: 1,
      interview_remaining: 1,
      learning_path_remaining: 1,
      chat_remaining: 5
    }
  },

  // 职位URL输入事件
  onJobUrlInput(e) {
    this.setData({
      jobUrl: e.detail.value
    })
  },

  // 清除职位URL
  clearJobUrl() {
    this.setData({
      jobUrl: ''
    })
  },

  // 选择图片进行OCR识别
  chooseImage() {
    const that = this
    
    wx.chooseImage({
      count: 9,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success(res) {
        const tempFilePaths = res.tempFilePaths
        
        // 保存选中的图片
        that.setData({
          selectedImages: tempFilePaths
        })
        
        // 自动开始OCR流程
        that.startOCR()
      },
      fail(err) {
        console.error('选择图片失败:', err)
      }
    })
  },

  // 开始OCR流程
  startOCR() {
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
    
    const that = this
    const { selectedImages, ocrStatus } = this.data
    
    if (selectedImages.length === 0) {
      wx.showToast({
        title: '请先选择图片',
        icon: 'none'
      })
      return
    }
    
    // 检查是否已经有OCR任务在进行
    if (ocrStatus === 'uploading' || ocrStatus === 'processing') {
      wx.showToast({
        title: '正在处理中，请稍后再试',
        icon: 'none'
      })
      return
    }
    
    // 如果是completed状态，允许重新开始OCR流程
    if (ocrStatus === 'completed') {
      console.log('OCR已完成，重新开始OCR流程')
    }
    
    wx.showLoading({
      title: '正在处理...',
      mask: true
    })
    
    // 设置OCR状态为上传中
    this.setData({
      ocrStatus: 'uploading',
      uploadProgress: 0
    })
    
    // 创建任务
    this.createTask(selectedImages.length).then(taskId => {
      // 上传所有图片
      return this.uploadImages(taskId, selectedImages)
    }).then(() => {
      // 开始轮询结果
      return this.pollResult()
    }).catch(err => {
      console.error('OCR流程失败:', err)
      wx.hideLoading()
      wx.showToast({
        title: '处理失败，请稍后重试',
        icon: 'none'
      })
      this.setData({
        ocrStatus: 'idle'
      })
    })
  },

  // 创建OCR任务
  createTask(expectedCount) {
    const that = this
    const api = require('../../api/index')
    
    console.log('开始创建OCR任务，预期图片数量:', expectedCount)
    
    return new Promise((resolve, reject) => {
      api.createOCRTask({
        expected_count: expectedCount
      }).then(result => {
        console.log('创建OCR任务成功:', result)
        if (result.success && result.task_id) {
          const taskId = result.task_id
          that.setData({
            taskId: taskId
          })
          console.log('保存任务ID:', taskId)
          resolve(taskId)
        } else {
          console.error('创建任务失败:', result)
          reject(new Error(`创建任务失败: ${result.message || '未知错误'}`))
        }
      }).catch(err => {
        console.error('创建任务网络失败:', err)
        reject(err)
      })
    })
  },

  // 轮询OCR结果
  pollResult() {
    const that = this
    const { taskId } = this.data
    const api = require('../../api/index')
    
    console.log('开始轮询OCR结果，任务ID:', taskId)
    
    // 设置OCR状态为处理中
    this.setData({
      ocrStatus: 'processing'
    })
    
    return new Promise((resolve, reject) => {
      let pollingCount = 0
      const maxPollingCount = 30 // 最多轮询30次（60秒）
      
      const pollingInterval = setInterval(() => {
        pollingCount++
        console.log(`轮询第${pollingCount}次，任务ID:`, taskId)
        
        // 检查是否超过最大轮询次数
        if (pollingCount > maxPollingCount) {
          clearInterval(pollingInterval)
          console.error('处理超时，已达到最大轮询次数')
          wx.hideLoading()
          wx.showToast({
            title: '处理超时，请稍后重试',
            icon: 'none'
          })
          that.setData({
            ocrStatus: 'idle'
          })
          reject(new Error('处理超时'))
          return
        }
        
        api.getOCRResult({
          task_id: taskId
        }).then(result => {
          console.log('获取OCR结果:', result)
          if (result.status === 'completed') {
            clearInterval(pollingInterval)
            console.log('OCR处理完成，结果:', result)
            
            // 根据返回结果格式设置jobUrl
            let jobUrl = ''
            if (typeof result.result === 'string') {
              // 字符串格式（如示例所示）
              jobUrl = result.result
            } else if (result.result && result.result.merged_text) {
              // 对象格式（兼容旧格式）
              jobUrl = result.result.merged_text
            } else if (result.result) {
              // 其他格式
              jobUrl = JSON.stringify(result.result)
            }
            
            that.setData({
              ocrStatus: 'completed',
              ocrResult: result.result,
              jobUrl: jobUrl
            })
            wx.hideLoading()
            wx.showToast({
              title: '识别完成，已提取职位描述',
              icon: 'success'
            })
            resolve()
          } else if (result.status === 'failed') {
            clearInterval(pollingInterval)
            console.error('OCR处理失败:', result)
            wx.hideLoading()
            wx.showToast({
              title: '处理失败，请稍后重试',
              icon: 'none'
            })
            that.setData({
              ocrStatus: 'idle'
            })
            reject(new Error('处理失败'))
          } else {
            console.log('OCR处理中，状态:', result.status)
            // 继续轮询
          }
        }).catch(err => {
          clearInterval(pollingInterval)
          console.error('获取结果失败:', err)
          wx.hideLoading()
          wx.showToast({
            title: '网络错误，请稍后重试',
            icon: 'none'
          })
          that.setData({
            ocrStatus: 'idle'
          })
          reject(err)
        })
      }, 2000) // 每2秒轮询一次
    })
  },

  // 并发上传所有图片
  uploadImages(taskId, selectedImages) {
    const that = this
    const api = require('../../api/index')
    const totalImages = selectedImages.length
    let uploadedCount = 0
    
    console.log('开始上传图片，总数:', totalImages)
    console.log('任务ID:', taskId)
    console.log('图片路径:', selectedImages)
    
    const uploadPromises = selectedImages.map((imagePath, index) => {
      console.log(`开始上传第${index + 1}张图片:`, imagePath)
      
      return new Promise((resolve, reject) => {
        api.uploadOCRImage({
          filePath: imagePath,
          formData: {
            task_id: taskId,
            index: index.toString()
          }
        }).then(result => {
          console.log(`第${index + 1}张图片上传成功:`, result)
          if (result.success) {
            uploadedCount++
            const progress = Math.round((uploadedCount / totalImages) * 100)
            console.log(`上传进度: ${progress}% (${uploadedCount}/${totalImages})`)
            that.setData({
              uploadProgress: progress
            })
            resolve()
          } else {
            console.error(`第${index + 1}张图片上传失败:`, result)
            reject(new Error(`上传图片失败: ${result.message || '未知错误'}`))
          }
        }).catch(err => {
          console.error(`第${index + 1}张图片上传网络失败:`, err)
          reject(err)
        })
      })
    })
    
    return Promise.all(uploadPromises).then(() => {
      console.log('所有图片上传完成')
    }).catch(err => {
      console.error('图片上传批量失败:', err)
      throw err
    })
  },

  // 上传图片进行OCR识别
  uploadImageForOCR: function(tempFile) {
    const app = getApp()
    const apiBaseUrl = app.globalData.apiBaseUrl
    const url = `${apiBaseUrl}/api/validate-image`
    const that = this
    
    wx.uploadFile({
      url: url,
      filePath: tempFile,
      name: 'image_file',
      header: {
        'Authorization': `Bearer ${wx.getStorageSync('accessToken')}` // 添加认证头
      },
      success(res) {
        wx.hideLoading()
        
        try {
          const result = JSON.parse(res.data)
          console.log('OCR识别结果:', result)
          
          if (result.valid && result.extracted_text) {
            // 识别成功，将结果回填到输入框
            that.setData({
              jobUrl: result.extracted_text
            })
            
            wx.showToast({
              title: '图片识别成功，已提取职位描述',
              icon: 'success'
            })
          } else {
            // 识别失败
            wx.showToast({
              title: result.message || '图片识别失败',
              icon: 'none'
            })
          }
        } catch (error) {
          console.error('解析OCR结果失败:', error)
          wx.showToast({
            title: '图片识别失败，请稍后重试',
            icon: 'none'
          })
        }
      },
      fail(err) {
        wx.hideLoading()
        console.error('上传图片失败:', err)
        wx.showToast({
          title: '上传图片失败，请稍后重试',
          icon: 'none'
        })
      }
    })
  },

  // 批量分析OCR图片
  batchAnalysisOCR: function(imagePaths) {
    // 检查登录状态
    const accessToken = wx.getStorageSync('accessToken')
    if (!accessToken) {
      wx.showToast({
        title: '请先登录',
        icon: 'none',
        duration: 3000
      })
      return Promise.reject(new Error('未登录'))
    }
    
    const that = this
    const api = require('../../api/index')
    
    // 准备请求数据
    const requestData = {
      image_paths: imagePaths
    }
    
    // 如果是多图，添加expected_count参数
    if (Array.isArray(imagePaths)) {
      requestData.expected_count = imagePaths.length
    }
    
    console.log('批量分析OCR请求数据:', requestData)
    
    return new Promise((resolve, reject) => {
      api.batchAnalysis(requestData)
        .then(result => {
          console.log('批量分析OCR结果:', result)
          if (result.success) {
            // 识别成功，将结果回填到输入框
            if (result.extracted_text) {
              that.setData({
                jobUrl: result.extracted_text
              })
            }
            
            wx.showToast({
              title: '图片识别成功，已提取职位描述',
              icon: 'success'
            })
            resolve(result)
          } else {
            // 识别失败
            const errorMessage = result.message || '图片识别失败'
            console.error('批量分析OCR失败:', errorMessage)
            wx.showToast({
              title: errorMessage,
              icon: 'none'
            })
            reject(new Error(errorMessage))
          }
        })
        .catch(err => {
          console.error('批量分析OCR网络失败:', err)
          wx.showToast({
            title: '网络错误，请稍后重试',
            icon: 'none'
          })
          reject(err)
        })
    })
  },

  // 职位URL获取焦点
  onJobUrlFocus() {
    // 可以添加焦点样式处理
  },

  // 职位URL失去焦点
  onJobUrlBlur() {
    // 验证URL是否有效
    const { jobUrl, record_id } = this.data
    if (jobUrl.trim()) {
      // 先判断输入内容是否为URL
      if (this.isValidUrl(jobUrl.trim())) {
        this.validateJobUrl(jobUrl.trim())
      }
    }
  },

  // 判断字符串是否为有效的URL
  isValidUrl(string) {
    // 只检查是否包含http或https协议，不使用new URL()避免格式问题
    return /^https?:\/\//i.test(string)
  },

  // 验证职位URL
  validateJobUrl(jobUrl) {
    const app = getApp()
    const apiBaseUrl = app.globalData.apiBaseUrl
    const url = `${apiBaseUrl}/api/validate-url`
    
    wx.showLoading({
      title: '验证URL中...',
      mask: true
    })
    
    wx.request({
      url: url,
      method: 'POST',
      header: {
        'content-type': 'application/json',
        'Authorization': `Bearer ${wx.getStorageSync('accessToken')}` // 添加认证头
      },
      data: {
          job_url: jobUrl,
          force_update: true  // 添加强制更新参数，忽略已存在的记录，强制重新生成新的内容
        },
      timeout: 10000,
      success: (res) => {
        wx.hideLoading()
        
        if (res.statusCode === 200 && res.data) {
          const result = res.data
          this.showValidationResult(result)
        } else if (res.statusCode === 401) {
          // 处理未授权错误
          wx.showToast({
            title: '未授权访问，请先登录',
            icon: 'none'
          })
        } else {
          wx.showToast({
            title: 'URL验证失败，请稍后重试',
            icon: 'none'
          })
        }
      },
      fail: (err) => {
        wx.hideLoading()
        console.error('URL验证失败:', err)
        wx.showToast({
          title: '网络错误，请稍后重试',
          icon: 'none'
        })
      }
    })
  },

  // 显示验证结果
  showValidationResult(result) {
    const { valid, message, content_preview, estimated_time } = result
    
    // 只有验证失败时才显示模态框
    if (!valid) {
      const modalContent = '无法从该URL提取职位描述，请直接复制网页上的职位描述文本。'
      
      wx.showModal({
        title: '❌ URL验证失败',
        content: modalContent,
        showCancel: false,
        confirmText: '确定'
      })
    }
    // 验证成功时不显示任何提示
  },

  // 职位URL行数变化
  onJobUrlLineChange() {
    // 可以添加行数变化处理
  },

  // 选择简历文件
  chooseResumeFile() {
    const that = this
    
    // 检查权限状态
    wx.getSetting({
      success(res) {
        console.log('当前权限设置:', res.authSetting)
        
        // 调用chooseMessageFile
        that.doChooseMessageFile()
      },
      fail(err) {
        console.error('获取权限设置失败:', err)
        // 直接尝试选择文件，让系统弹出权限请求
        that.doChooseMessageFile()
      }
    })
  },
  
  // 执行文件选择操作
  doChooseMessageFile() {
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
    
    const that = this
    wx.chooseMessageFile({
      count: 1,
      type: 'all', // 修改为'all'，允许选择所有类型文件
      extension: ['.pdf', '.docx', '.txt', '.md'], // 支持更多格式
      success(res) {
        const tempFile = res.tempFiles[0]
        that.setData({
          resumeFile: tempFile,
          fileName: tempFile.name,
          isLoading: true,
          progress: 0
        })
        
        // 模拟进度更新，使用更平滑的随机进度增加，适配3分钟的处理时间
        let currentProgress = 0
        const progressInterval = setInterval(() => {
          // 随机增加0.5-2%的进度，使进度更新更缓慢自然
          const increment = Math.floor(Math.random() * 2) + 1
          currentProgress += increment
          
          if (currentProgress >= 96) {
            clearInterval(progressInterval)
            that.setData({ progress: 96 })
          } else {
            that.setData({ progress: currentProgress })
          }
        }, 2000)
        
        // 调用上传简历文件接口
        const api = require('../../api/index')
        api.uploadResume({
          filePath: tempFile.path
        }).then(res => {
            clearInterval(progressInterval)
            that.setData({ progress: 100 })
            
            console.log('上传简历成功:', res)
            
            if (res.success) {
              // 保存上传结果
              that.setData({
                file_key: res.file_key,
                file_url: res.file_url
              })
              
              wx.showToast({
                title: '简历上传成功',
                icon: 'success'
              })
            } else {
              wx.showToast({
                title: '上传失败，请稍后重试',
                icon: 'none'
              })
            }
        }).catch(error => {
            clearInterval(progressInterval)
            console.error('上传简历失败:', error)
            
            // 检查是否是登录过期或未登录
            if (error.message && error.message.includes('登录已过期') || error.message.includes('Unauthorized')) {
              // 鉴权失败，清空上传控件显示
              that.setData({
                fileName: '',
                file_key: '',
                file_url: '',
                resumeFile: null
              })
              wx.showToast({
                title: '请先登录',
                icon: 'none'
              })
            } else {
              wx.showToast({
                title: '上传失败，请稍后重试',
                icon: 'none'
              })
            }
            that.setData({ isLoading: false })
        }).then(() => {
            // 上传成功后延迟隐藏进度条，让用户看到完整的进度动画
            setTimeout(() => {
                that.setData({ isLoading: false })
            }, 500)
        })
      },
      fail(error) {
        console.error('选择文件失败:', error)
        
        // 检查是否是权限问题
        if (error.errMsg && error.errMsg.includes('auth deny')) {
          // 引导用户去设置页面开启权限
          wx.showModal({
            title: '权限提示',
            content: '需要访问文件权限才能选择简历，是否去设置开启？',
            success(res) {
              if (res.confirm) {
                wx.openSetting({
                  success(settingRes) {
                    console.log('设置页面返回:', settingRes.authSetting)
                  }
                })
              }
            }
          })
        } 
      },
      complete() {
        console.log('文件选择操作完成')
      }
    })
  },

  // 提交表单
  submitForm() {
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
    if (userUsage.stream_run_remaining <= 0) {
      wx.showModal({
        title: '使用次数已达上限',
        content: '今日一键生成次数已达上限（1次/天），请明天再来',
        showCancel: false
      })
      return
    }
    
    const { jobUrl, file_key, file_url } = this.data
    
    if (!jobUrl || !file_key || !file_url) {
      wx.showToast({
        title: '请输入职位URL并上传简历',
        icon: 'none'
      })
      return
    }
    
    this.setData({
      isLoading: true,
      progress: 0
    })
    
    // 先检查队列状态
    this.getQueueStatus().then(queueData => {
      console.log('队列状态:', queueData)
      
      // 检查是否有排队
      if (queueData.pending_count > 0) {
        // 有排队，显示排队状态
        this.setData({
          status: 'QUEUED',
          queuePosition: queueData.pending_count,
          estimatedWaitTime: queueData.estimated_wait_time || 0
        })
        
        // 显示排队提示
        wx.showLoading({
          title: '排队中',
          mask: true
        })
      }
      
      // 模拟进度更新，使用更平滑的随机进度增加，适配3分钟的处理时间
      let currentProgress = 0
      const progressInterval = setInterval(() => {
        // 随机增加0.5-2%的进度，使进度更新更缓慢自然
        const increment = Math.floor(Math.random() * 2) + 1
        currentProgress += increment
        
        if (currentProgress >= 96) {
          clearInterval(progressInterval)
          this.setData({ progress: 96 })
        } else {
          this.setData({ progress: currentProgress })
        }
      }, 2000)
      
      // 调用后端API，使用已上传的file_key
      this.callApiWithFileKey(jobUrl, file_key, progressInterval)
    }).catch(err => {
      console.error('获取队列状态失败:', err)
      
      // 即使获取队列状态失败，也继续执行API调用
      // 模拟进度更新，使用更平滑的随机进度增加，适配3分钟的处理时间
      let currentProgress = 0
      const progressInterval = setInterval(() => {
        // 随机增加0.5-2%的进度，使进度更新更缓慢自然
        const increment = Math.floor(Math.random() * 2) + 1
        currentProgress += increment
        
        if (currentProgress >= 96) {
          clearInterval(progressInterval)
          this.setData({ progress: 96 })
        } else {
          this.setData({ progress: currentProgress })
        }
      }, 2000)
      
      // 调用后端API，使用已上传的file_key
      this.callApiWithFileKey(jobUrl, file_key, progressInterval)
    })
  },

  // 上传文件并调用API（完整流程）
  // 注意：由于我们现在使用独立API，这里需要修改为分步调用
  // 为了保持原有功能，我们暂时保留对/run接口的调用
  uploadFileAndCallApi(jobUrl, resumeFile, progressInterval) {
    const that = this
    const app = getApp()
    
    // 第一步：先上传文件获取file_key
    const api = require('../../api/index')
    api.uploadResume({
      filePath: resumeFile.path
    }).then(uploadResult => {
        console.log('文件上传成功:', uploadResult)
        
        if (uploadResult.success) {
          const fileKey = uploadResult.file_key
          const fileUrl = uploadResult.file_url
          
          // 更新页面数据
          that.setData({
            file_key: fileKey,
            file_url: fileUrl
          })
          
          // 第二步：使用fileUrl调用流式API
          console.log('📤 发送的 resume_file 对象:', {
            url: fileUrl,
            filename: resumeFile.name,
            file_type: 'document'
          });
          
          // 判断输入类型：如果是URL就传入job_url，如果是文本就传入jd_text
          let jobData = {}
          if (/^https?:\/\//i.test(jobUrl.trim())) {
            console.log('输入是URL，使用job_url参数')
            jobData.job_url = jobUrl.trim()
          } else {
            console.log('输入是文本描述，使用jd_text参数')
            jobData.jd_text = jobUrl.trim()
          }
          
          wx.request({
              url: `${app.globalData.apiBaseUrl}/stream_run_async`,
              method: 'POST',
              header: {
                'content-type': 'application/json',
                'Authorization': `Bearer ${wx.getStorageSync('accessToken')}` // 添加认证头
              },
              data: {
                ...jobData,
                resume_file: {
                  url: fileUrl,  // 使用上传后返回的 fileUrl
                  filename: resumeFile.name,
                  file_type: 'document'  // 添加文件类型
                }
              },
              timeout: 1800000, // 30分钟超时，适应长响应时间
              responseType: 'text', // 接收文本流
              enableChunked: true, // 启用分块传输
              success(res) {
                clearInterval(progressInterval)
                that.setData({ progress: 100 })
                
                // 显示加载提示
                wx.showLoading({
                  title: '处理中...',
                  mask: true
                })
                
                try {
          
          // 处理流式响应
          const responseText = res.data
          console.log('流式API调用成功，完整响应:', responseText)
          
          // 初始化结果数据
          let resultData = {
            jd_text: '',
            beautified_resume: '',
            interview_script: '',
            learning_path: ''
          }
          
          // 解析SSE数据
          const lines = responseText.split('\n')
          let finalResult = null
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const jsonStr = line.substring(6)
              try {
                const message = JSON.parse(jsonStr)
                console.log('解析到SSE消息:', message)
                
                // 处理新的 /stream_run_async 消息格式
                if (message.type === 'progress') {
                      // 处理进度消息
                      that.handleProgress(message)
                      // 保存 task_id
                      if (message.task_id) {
                        that.setData({ taskId: message.task_id })
                        // 启动任务状态轮询
                        if (!that.data.isPolling) {
                          that.startPoll(message.task_id)
                        }
                      }
                    } else if (message.type === 'complete') {
                  // 处理完成消息
                  that.handleComplete(message)
                  // 保存结果
                  finalResult = message.result
                  // 保存 task_id
                  if (message.task_id) {
                    that.setData({ taskId: message.task_id })
                    console.log('保存task_id:', message.task_id)
                  }
                  // 保存 record_id（从 result 中提取）
                  if (message.result && message.result.record_id) {
                    const recordId = message.result.record_id || ''
                    that.setData({ record_id: recordId })
                    console.log('从result中保存record_id:', recordId)
                  }
                } else if (message.type === 'error') {
                  // 处理错误消息
                  that.handleError(message)
                  return
                } else if (message.record_id) {
                  // 保存record_id到页面数据
                  const recordId = message.record_id || ''
                  that.setData({ record_id: recordId })
                  console.log('保存record_id:', recordId)
                } else if (message.jd_text || message.beautified_resume || message.interview_script || message.learning_path) {
                  // 兼容旧格式：完整数据返回
                  finalResult = message
                }
              } catch (e) {
                console.error('单行SSE消息解析失败:', e)
              }
            }
          }
          
          // 使用最终结果
          const result = finalResult || resultData
          console.log('最终处理结果:', result)
          
          // 检查响应数据是否包含我们需要的字段
          if (result && (result.jd_text || result.beautified_resume || result.interview_script || result.learning_path)) {
            // 保存结果到全局数据
            app.globalData.jdText = result.jd_text // 保存完整的jd_text字符串
            app.globalData.beautifiedResume = result.beautified_resume
            app.globalData.interviewScript = result.interview_script
            app.globalData.learningPlan = result.learning_path
            
            // 更新页面数据
            that.setData({
              result: result
            })
            
            // 从jd_text中提取结构化信息更新到jobInfo
          let jobInfo = {
            position_name: '未获取到岗位名称',
            job_type: '全职',
            salary: '',
            company_name: '',
            requirements: []
          }
          
          if (result.jd_text) {
            const jdText = result.jd_text
            
            // 优化：提取岗位名称（处理Markdown格式）
            const positionNameMatch = jdText.match(/职位名称：([^\n]+)/)
            if (positionNameMatch && positionNameMatch[1]) {
              jobInfo.position_name = positionNameMatch[1].trim()
            } else {
              // 备选方案：从Markdown标题后提取
              const altPositionMatch = jdText.match(/## 职位基本信息\n[\s\S]*?职位名称：([^\n]+)/)
              if (altPositionMatch && altPositionMatch[1]) {
                jobInfo.position_name = altPositionMatch[1].trim()
              } else {
                // 如果正则匹配失败，尝试从文本开头提取
                jobInfo.position_name = jdText.replace(/^#+/, '').trim().substring(0, 30).trim()
              }
            }
            
            // 提取公司名称
            const companyMatch = jdText.match(/公司：([^\n]+)/)
            if (companyMatch && companyMatch[1]) {
              jobInfo.company_name = companyMatch[1].trim()
            }
            
            // 提取职位类型
            const typeMatch = jdText.match(/类型：([^\n]+)/)
            if (typeMatch && typeMatch[1]) {
              jobInfo.job_type = typeMatch[1].trim()
            }
            
            // 提取地点
            const locationMatch = jdText.match(/地点：([^\n]+)/)
            if (locationMatch && locationMatch[1]) {
              jobInfo.location = locationMatch[1].trim()
            }
            
            // 优化：提取完整的岗位要求（处理Markdown格式）
            const allRequirements = []
            
            // 1. 提取工作职责
            const responsibilitiesMatch = jdText.match(/## 工作职责([\s\S]*?)(## |$)/)
            if (responsibilitiesMatch && responsibilitiesMatch[1]) {
              const responsibilitiesText = responsibilitiesMatch[1]
              const responsibilitiesArray = responsibilitiesText.split(/\d+\. /)
                .filter(item => item.trim())
                .map(item => item.trim())
              
              if (responsibilitiesArray.length > 0) {
                allRequirements.push({
                  type: 'job_responsibilities',
                  title: '工作职责',
                  content: responsibilitiesArray
                })
              }
            }
            
            // 2. 提取任职要求
            const requirementsMatch = jdText.match(/## 任职要求([\s\S]*?)(## |$)/)
            if (requirementsMatch && requirementsMatch[1]) {
              const requirementsText = requirementsMatch[1]
              
              // 提取必备要求
              const mustHaveMatch = requirementsText.match(/### 必备要求([\s\S]*?)(### |$)/)
              if (mustHaveMatch && mustHaveMatch[1]) {
                const mustHaveText = mustHaveMatch[1]
                const mustHaveArray = mustHaveText.split(/\d+\. /)
                  .filter(item => item.trim())
                  .map(item => item.trim())
                
                if (mustHaveArray.length > 0) {
                  allRequirements.push({
                    type: 'must_have',
                    title: '必备要求',
                    content: mustHaveArray
                  })
                }
              }
              
              // 提取优先条件
              const preferredMatch = requirementsText.match(/### 优先条件([\s\S]*?)(### |$)/)
              if (preferredMatch && preferredMatch[1]) {
                const preferredText = preferredMatch[1]
                const preferredArray = preferredText.split(/\d+\. /)
                  .filter(item => item.trim())
                  .map(item => item.trim())
                
                if (preferredArray.length > 0) {
                  allRequirements.push({
                    type: 'preferred',
                    title: '优先条件',
                    content: preferredArray
                  })
                }
              }
            }
            
            // 3. 提取技术栈与关键词
            const techStackMatch = jdText.match(/## 技术栈与关键词([\s\S]*?)(## |$)/)
            if (techStackMatch && techStackMatch[1]) {
              const techStackText = techStackMatch[1].trim()
              let techStackArray = []
              
              // 将技术栈文本分割成多个条目
              if (techStackText.includes('- ')) {
                // 如果有列表项，按列表项分割
                techStackArray = techStackText.split('- ')
                  .filter(item => item.trim())
                  .map(item => '- ' + item.trim())
              } else {
                // 否则按分号或换行分割
                techStackArray = techStackText.split(/[；;\n]+/)
                  .filter(item => item.trim())
                  .map(item => item.trim())
              }
              
              allRequirements.push({
                type: 'tech_stack',
                title: '技术栈与关键词',
                content: techStackArray
              })
            }
            
            // 4. 提取职位亮点
            const highlightsMatch = jdText.match(/## 职位亮点([\s\S]*?)(## |$)/)
            if (highlightsMatch && highlightsMatch[1]) {
              const highlightsText = highlightsMatch[1]
              const highlightsArray = highlightsText.split(/\d+\. /)
                .filter(item => item.trim())
                .map(item => {
                  // 处理Markdown格式，移除**加粗标记
                  let processedText = item.trim()
                  processedText = processedText.replace(/\*\*(.*?)\*\*/g, '$1')
                  return processedText
                })
              
              if (highlightsArray.length > 0) {
                allRequirements.push({
                  type: 'highlights',
                  title: '职位亮点',
                  content: highlightsArray
                })
              }
            }
            
            // 将结构化的要求转换为适合UI展示的格式
            const uiRequirements = []
            allRequirements.forEach(reqGroup => {
              // 先添加组标题
              uiRequirements.push({
                isTitle: true,
                title: reqGroup.title,
                content: '',
                fullContent: reqGroup.content
              })
              
              // 再添加具体要求
              reqGroup.content.forEach(reqItem => {
                uiRequirements.push({
                  isTitle: false,
                  title: reqGroup.title,
                  content: reqItem,
                  fullContent: reqItem
                })
              })
            })
            
            jobInfo.requirements = uiRequirements
          }
          
          // 初始化所有岗位要求为收起状态
          const expandedRequirements = {}
          jobInfo.requirements.forEach((_, index) => {
            expandedRequirements[index] = false
          })
          
          that.setData({
            jobInfo: jobInfo,
            expandedRequirements: expandedRequirements
          })
          
          // 标记一键生成全部按钮已被调用
            that.setData({
              isSubmitCalled: true
            })
            
            wx.hideLoading()
            wx.showToast({
              title: '处理完成',
              icon: 'success'
            })
          } else {
            // 处理API返回失败的情况
            wx.hideLoading()
            console.error('API返回失败:', result)
            wx.showToast({
              title: '处理失败，请稍后重试',
              icon: 'none'
            })
          }
        } catch (error) {
          wx.hideLoading()
          console.error('解析结果失败:', error)
          wx.showToast({
            title: '处理失败，请稍后重试',
            icon: 'none'
          })
        }
        
        // 结束延迟，显示结果
        setTimeout(() => {
          that.setData({ isLoading: false })
        }, 500)
      },
      fail(error) {
        clearInterval(progressInterval)
        that.setData({ progress: 100 })
        setTimeout(() => {
          wx.hideLoading()
          console.error('API调用失败:', error)
          wx.showToast({
            title: '处理失败，请稍后重试',
            icon: 'none'
          })
          that.setData({ isLoading: false })
        }, 500)
      },
      complete() {
        // 不需要在这里设置isLoading: false，因为已经在success和fail中处理了
      }
    })
        }
    }).catch(error => {
        clearInterval(progressInterval)
        that.setData({ progress: 100 })
        setTimeout(() => {
          wx.hideLoading()
          console.error('文件上传或处理失败:', error)
          
          // 检查是否是登录过期或未登录
          if (error.message && error.message.includes('登录已过期') || error.message.includes('Unauthorized')) {
            // 鉴权失败，清空上传控件显示
            that.setData({
              fileName: '',
              file_key: '',
              file_url: '',
              resumeFile: null
            })
            wx.showToast({
              title: '请先登录',
              icon: 'none'
            })
          } else {
            wx.showToast({
              title: '文件上传失败，请稍后重试',
              icon: 'none'
            })
          }
          
          that.setData({ isLoading: false })
        }, 500)
    })
  },

  onLoad() {
    // 启用分享功能
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']  // 同时开启好友和朋友圈分享
    })
    
    // 页面加载时的初始化
    console.log('optimize页面onLoad函数被调用')
    console.log('getApp()返回:', getApp())
    console.log('globalData:', getApp().globalData)
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

  onReady() {
    // 页面初次渲染完成时的操作
    console.log('optimize页面onReady函数被调用')
  },

  onShow() {
    // 页面显示时的操作
    console.log('optimize页面onShow函数被调用')
    
    // 启用分享功能
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']  // 同时开启好友和朋友圈分享
    })
    
    // 检查登录状态，如果未登录则清除页面数据
    const accessToken = wx.getStorageSync('accessToken')
    const isLoggedIn = !!accessToken
    
    if (!isLoggedIn) {
      console.log('未登录，清除页面数据')
      this.setData({
        jobUrl: '',
        fileName: '',
        resumeFile: null,
        file_key: '',
        file_url: '',
        isLoading: false,
        progress: 0,
        record_id: '',
        isSubmitCalled: false,
        isLoggedIn: false,
        jobInfo: {
          position_name: '',
          job_type: '',
          salary: '',
          company_name: '',
          requirements: []
        },
        expandedRequirements: {},
        result: {
          jd_text: '',
          beautified_resume: '',
          interview_script: '',
          learning_path: ''
        }
      })
    } else {
      console.log('已登录，开始队列状态轮询')
      this.setData({
        isLoggedIn: true
      })
      // 已登录，开始队列状态轮询
      this.startQueuePolling()
    }
  },

  // 分享给好友（必须同时存在，否则朋友圈分享不显示）
  onShareAppMessage() {
    return {
      title: '骡马假日助手',
      path: '/pages/optimize/optimize',
      imageUrl: '/images/logo.jpg'
    };
  },

  // 分享到朋友圈（必须同时存在，否则朋友圈分享不显示）
  onShareTimeline() {
    return {
      title: '骡马假日助手',
      query: 'from=timeline',  // 携带的参数
      imageUrl: '/images/logo.jpg'
    };
  },

  onHide() {
    // 页面隐藏时的操作
    console.log('optimize页面onHide函数被调用')
    // 停止队列状态轮询
    this.stopQueuePolling()
  },

  // 测试按钮点击事件
  testButton() {
    console.log('testButton函数被调用 - 开始')
    
    // 显示一个简单的提示，确认按钮点击事件是否能够触发
    wx.showToast({
      title: '按钮点击事件触发',
      icon: 'success'
    })
    
    console.log('testButton函数被调用 - 结束')
  },
  
  // 一键清除缓存数据
  clearAllData() {
    console.log('clearAllData函数被调用 - 开始')
    
    // 显示确认对话框
    wx.showModal({
      title: '确认清除',
      content: '确定要清除所有缓存数据吗？这将重置当前流程，允许您开始新的一键生成全部流程。',
      success: (res) => {
        if (res.confirm) {
          // 清除页面数据
          this.setData({
            jobUrl: '',
            fileName: '',
            resumeFile: null,
            file_key: '',
            file_url: '',
            isLoading: false,
            progress: 0,
            record_id: '',
            isSubmitCalled: false,
            status: '',
            jobInfo: {
              position_name: '',
              job_type: '',
              salary: '',
              company_name: '',
              requirements: []
            },
            expandedRequirements: {},
            isEditingPosition: false,
            result: {
              jd_text: '',
              beautified_resume: '',
              interview_script: '',
              learning_path: ''
            },
            selectedImages: [],
            taskId: null,
            uploadProgress: 0,
            ocrStatus: 'idle',
            ocrResult: null
          })
          
          // 清除全局数据
          const app = getApp()
          app.globalData.jdText = ''
          app.globalData.beautifiedResume = ''
          app.globalData.interviewScript = ''
          app.globalData.learningPlan = ''
          app.globalData.jobInfo = null
          
          console.log('所有缓存数据已清除')
          
          // 显示成功提示
          wx.showToast({
            title: '缓存已清除，可开始新流程',
            icon: 'success'
          })
        }
      }
    })
    
    console.log('clearAllData函数被调用 - 结束')
  },

  // 分析岗位
  analyzeJob() {
    console.log('analyzeJob函数被调用 - 开始')
    
    const { jobUrl, record_id } = this.data
    
    console.log('jobUrl:', jobUrl)
    console.log('record_id:', record_id)
    
    if (!jobUrl.trim()) {
      console.log('jobUrl为空，显示提示')
      wx.showToast({
        title: '请输入职位URL或描述',
        icon: 'none'
      })
      return
    }
    
    console.log('设置isLoading为true')
    this.setData({
      isLoading: true,
      progress: 0
    })
    
    // 显示加载提示，提供即时反馈
    wx.showLoading({
      title: '正在分析岗位...',
      mask: true
    })
    
    // 模拟进度更新
    console.log('创建进度更新定时器')
    let currentProgress = 0
    const progressInterval = setInterval(() => {
      // 随机增加0.5-2%的进度，使进度更新更缓慢自然，适配3分钟的处理时间
      const increment = Math.floor(Math.random() * 2) + 1
      currentProgress += increment
      
      if (currentProgress >= 96) {
        clearInterval(progressInterval)
        this.setData({ progress: 96 })
      } else {
        this.setData({ progress: currentProgress })
      }
    }, 2000)
    
    // 开始调用岗位分析API
    console.log('开始调用岗位分析API...')
    
    try {
      const app = getApp()
      const apiBaseUrl = app.globalData.apiBaseUrl
      console.log('apiBaseUrl:', apiBaseUrl)
      
      // 判断输入类型：如果是URL就传入job_url，如果是文本就传入jd_text
      let requestData = {}
      
      // 判断是否为URL（以http://或https://开头）
      if (/^https?:\/\//i.test(jobUrl.trim())) {
        console.log('输入是URL，使用job_url参数')
        requestData.job_url = jobUrl.trim()
      } else {
        console.log('输入是文本描述，使用jd_text参数')
        requestData.jd_text = jobUrl.trim()
      }
      
      // 分析岗位按钮始终调用 /api/extract-jd 接口
      let url = `${apiBaseUrl}/api/extract-jd`
      console.log('调用/api/extract-jd接口分析岗位')
      if (record_id) {
        // 有record_id，传递record_id参数用于更新现有记录
        console.log('有record_id，更新已有记录:', record_id)
        requestData.record_id = record_id
      } else {
        // 没有record_id，由后端创建新记录
        console.log('没有record_id，由后端创建新记录')
      }
      
      console.log('请求URL:', url)
      console.log('请求数据:', requestData)
      
      wx.request({
        url: url,
        method: 'POST',
        data: requestData,
        header: {
          'content-type': 'application/json',
          'Authorization': `Bearer ${wx.getStorageSync('accessToken')}` // 添加认证头
        },
        timeout: 600000, // 延长超时时间到10分钟，适应长响应时间
        success: (res) => {
          console.log('wx.request成功回调执行:', res)
          console.log('响应状态码:', res.statusCode)
          console.log('响应数据:', res.data)
          
          // 检查429错误
          if (res.statusCode === 429) {
            clearInterval(progressInterval)
            this.setData({ isLoading: false })
            wx.hideLoading()
            wx.showModal({
              title: '使用次数已达上限',
              content: res.data.message || '今日分析岗位次数已达上限，请明天再来',
              showCancel: false
            })
            this.loadUserUsage(); // 刷新使用情况
            return
          }
          
          clearInterval(progressInterval)
          this.setData({ progress: 100 })
          wx.hideLoading()
          
          // 检查响应状态码
          if (res.statusCode !== 200) {
            console.error('API返回错误状态码:', res.statusCode)
            if (res.statusCode === 401) {
              wx.showToast({
                title: '请先登录',
                icon: 'none',
                duration: 3000
              })
            } else {
              wx.showToast({
                title: '分析失败，请稍后重试',
                icon: 'none'
              })
            }
            return
          }
          
          // 处理响应数据
          const result = res.data
          
          // 如果是创建新记录，保存record_id
          if (!record_id && result.record_id) {
            console.log('保存新创建的record_id:', result.record_id)
            this.setData({
              record_id: result.record_id
            })
          } else if (!record_id && result.task_id) {
            // 处理 /stream_run_async 接口返回的 task_id
            console.log('保存新创建的task_id:', result.task_id)
            // 这里可以保存 task_id，用于后续查询任务状态
            this.setData({
              taskId: result.task_id
            })
          }
          
          // 格式化岗位信息
          let jobInfo = {
            position_name: '未获取到岗位名称',
            job_type: '全职',
            salary: '',
            company_name: '',
            requirements: []
          }
          
          // 从jd_text中提取结构化信息
          if (result.jd_text) {
            // 保存原始jd_text到result对象
            this.setData({
              'result.jd_text': result.jd_text
            })
            
            // 更新全局数据中的jdText，确保重新生成时使用最新的职位描述
            app.globalData.jdText = result.jd_text
            
            const jdText = result.jd_text
            
            // 优化：提取岗位名称（处理Markdown格式）
            const positionNameMatch = jdText.match(/职位名称：([^\n]+)/)
            if (positionNameMatch && positionNameMatch[1]) {
              jobInfo.position_name = positionNameMatch[1].trim()
            } else {
              // 备选方案：从Markdown标题后提取
              const altPositionMatch = jdText.match(/## 职位基本信息\n[\s\S]*?职位名称：([^\n]+)/)
              if (altPositionMatch && altPositionMatch[1]) {
                jobInfo.position_name = altPositionMatch[1].trim()
              } else {
                // 如果正则匹配失败，尝试从文本开头提取
                jobInfo.position_name = jdText.replace(/^#+/, '').trim().substring(0, 30).trim()
              }
            }
            
            // 提取公司名称
            const companyMatch = jdText.match(/公司：([^\n]+)/)
            if (companyMatch && companyMatch[1]) {
              jobInfo.company_name = companyMatch[1].trim()
            }
            
            // 提取职位类型
            const typeMatch = jdText.match(/类型：([^\n]+)/)
            if (typeMatch && typeMatch[1]) {
              jobInfo.job_type = typeMatch[1].trim()
            }
            
            // 提取地点
            const locationMatch = jdText.match(/地点：([^\n]+)/)
            if (locationMatch && locationMatch[1]) {
              jobInfo.location = locationMatch[1].trim()
            }
            
            // 优化：提取完整的岗位要求（处理Markdown格式）
            const allRequirements = []
            
            // 1. 提取工作职责
            const responsibilitiesMatch = jdText.match(/## 工作职责([\s\S]*?)(## |$)/)
            if (responsibilitiesMatch && responsibilitiesMatch[1]) {
              const responsibilitiesText = responsibilitiesMatch[1]
              const responsibilitiesArray = responsibilitiesText.split(/\d+\. /)
                .filter(item => item.trim())
                .map(item => item.trim())
              
              if (responsibilitiesArray.length > 0) {
                allRequirements.push({
                  type: 'job_responsibilities',
                  title: '工作职责',
                  content: responsibilitiesArray
                })
              }
            }
            
            // 2. 提取任职要求
            const requirementsMatch = jdText.match(/## 任职要求([\s\S]*?)(## |$)/)
            if (requirementsMatch && requirementsMatch[1]) {
              const requirementsText = requirementsMatch[1]
              
              // 提取必备要求
              const mustHaveMatch = requirementsText.match(/### 必备要求([\s\S]*?)(### |$)/)
              if (mustHaveMatch && mustHaveMatch[1]) {
                const mustHaveText = mustHaveMatch[1]
                const mustHaveArray = mustHaveText.split(/\d+\. /)
                  .filter(item => item.trim())
                  .map(item => item.trim())
                
                if (mustHaveArray.length > 0) {
                  allRequirements.push({
                    type: 'must_have',
                    title: '必备要求',
                    content: mustHaveArray
                  })
                }
              }
              
              // 提取优先条件
              const preferredMatch = requirementsText.match(/### 优先条件([\s\S]*?)(### |$)/)
              if (preferredMatch && preferredMatch[1]) {
                const preferredText = preferredMatch[1]
                const preferredArray = preferredText.split(/\d+\. /)
                  .filter(item => item.trim())
                  .map(item => item.trim())
                
                if (preferredArray.length > 0) {
                  allRequirements.push({
                    type: 'preferred',
                    title: '优先条件',
                    content: preferredArray
                  })
                }
              }
            }
            
            // 3. 提取技术栈与关键词
            const techStackMatch = jdText.match(/## 技术栈与关键词([\s\S]*?)(## |$)/)
            if (techStackMatch && techStackMatch[1]) {
              const techStackText = techStackMatch[1].trim()
              let techStackArray = []
              
              // 将技术栈文本分割成多个条目
              if (techStackText.includes('- ')) {
                // 如果有列表项，按列表项分割
                techStackArray = techStackText.split('- ')
                  .filter(item => item.trim())
                  .map(item => '- ' + item.trim())
              } else {
                // 否则按分号或换行分割
                techStackArray = techStackText.split(/[；;\n]+/)
                  .filter(item => item.trim())
                  .map(item => item.trim())
              }
              
              allRequirements.push({
                type: 'tech_stack',
                title: '技术栈与关键词',
                content: techStackArray
              })
            }
            
            // 4. 提取职位亮点
            const highlightsMatch = jdText.match(/## 职位亮点([\s\S]*?)(## |$)/)
            if (highlightsMatch && highlightsMatch[1]) {
              const highlightsText = highlightsMatch[1]
              const highlightsArray = highlightsText.split(/\d+\. /)
                .filter(item => item.trim())
                .map(item => {
                  // 处理Markdown格式，移除**加粗标记
                  let processedText = item.trim()
                  processedText = processedText.replace(/\*\*(.*?)\*\*/g, '$1')
                  return processedText
                })
              
              if (highlightsArray.length > 0) {
                allRequirements.push({
                  type: 'highlights',
                  title: '职位亮点',
                  content: highlightsArray
                })
              }
            }
            
            // 将结构化的要求转换为适合UI展示的格式
            const uiRequirements = []
            allRequirements.forEach(reqGroup => {
              // 先添加组标题
              uiRequirements.push({
                isTitle: true,
                title: reqGroup.title,
                content: '',
                fullContent: reqGroup.content
              })
              
              // 再添加具体要求
              reqGroup.content.forEach(reqItem => {
                uiRequirements.push({
                  isTitle: false,
                  title: reqGroup.title,
                  content: reqItem,
                  fullContent: reqItem
                })
              })
            })
            
            jobInfo.requirements = uiRequirements
          }
          
          // 初始化所有岗位要求为收起状态
          const expandedRequirements = {}
          jobInfo.requirements.forEach((_, index) => {
            expandedRequirements[index] = false
          })
          
          this.setData({
            jobInfo: jobInfo,
            expandedRequirements: expandedRequirements
          })
          
          // 根据操作类型显示不同的提示
          if (result.action === 'updated') {
            wx.showToast({
              title: '岗位信息已更新',
              icon: 'success'
            })
          } else {
            wx.showToast({
              title: '岗位分析完成',
              icon: 'success'
            })
          }
        },
        fail: (err) => {
          console.error('wx.request失败回调执行:', err)
          console.error('错误详情:', JSON.stringify(err))
          clearInterval(progressInterval)
          wx.hideLoading()
          
          // 检查是否是登录过期或未登录
          if (err.statusCode === 401 || (err.errMsg && (err.errMsg.includes('登录已过期') || err.errMsg.includes('Unauthorized') || err.errMsg.includes('请先登录')))) {
            wx.showToast({
              title: '请先登录',
              icon: 'none',
              duration: 3000
            })
          } else {
            wx.showToast({
              title: '分析失败，请稍后重试',
              icon: 'none'
            })
          }
        },
        complete: () => {
          console.log('wx.request完成回调执行')
          this.setData({ isLoading: false })
        }
      })
    } catch (error) {
      console.error('调用API时发生异常catch执行:', error)
      console.error('异常详情:', JSON.stringify(error))
      clearInterval(progressInterval)
      wx.hideLoading()
      this.setData({ isLoading: false })
      wx.showToast({
        title: '分析失败，请稍后重试',
        icon: 'none'
      })
    }
    
    console.log('analyzeJob函数被调用 - 结束')
  },
  
  // 切换岗位要求的展开/收起状态
  toggleRequirement(e) {
    const index = e.currentTarget.dataset.index
    const expandedRequirements = this.data.expandedRequirements
    
    this.setData({
      [`expandedRequirements[${index}]`]: !expandedRequirements[index]
    })
  },
  
  // 开始编辑岗位名称
  startEditPosition() {
    this.setData({
      isEditingPosition: true
    })
  },
  
  // 保存编辑后的岗位名称
  savePosition(e) {
    const newPositionName = e.detail.value
    this.setData({
      'jobInfo.position_name': newPositionName,
      isEditingPosition: false
    })
  },
  
  // 下载优化后的简历
  downloadBeautifiedResume() {
    const { record_id } = this.data
    const app = getApp()
    
    wx.showLoading({
      title: '正在下载简历...',
    })
    
    // 检查是否有record_id
    if (!record_id) {
      wx.hideLoading()
      wx.showToast({
        title: '暂无法下载简历',
        icon: 'none'
      })
      return
    }
    
    // 通过后端代理接口下载文件
    const downloadUrl = `${app.globalData.apiBaseUrl}/api/download?record_id=${record_id}`
    
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
  
  // 生成面试话术
  generateInterviewScript() {
    const { jobInfo, resumeFile, userUsage } = this.data
    
    if (!jobInfo.position_name) {
      wx.showToast({
        title: '请先分析岗位',
        icon: 'none'
      })
      return
    }
    
    if (!resumeFile) {
      wx.showToast({
        title: '请先上传简历',
        icon: 'none'
      })
      return
    }
    
    // 检查使用次数
    if (userUsage.interview_remaining <= 0) {
      wx.showModal({
        title: '使用次数已达上限',
        content: '今日重新生成面试话术次数已达上限（1次/天），请明天再来',
        showCancel: false
      })
      return
    }
    
    this.setData({
      isLoading: true,
      progress: 0
    })
    
    // 模拟进度更新
    let currentProgress = 0
    const progressInterval = setInterval(() => {
      // 随机增加2-5%的进度，使进度更新更快，适配1分钟的处理时间
      const increment = Math.floor(Math.random() * 4) + 2
      currentProgress += increment
      
      if (currentProgress >= 96) {
        clearInterval(progressInterval)
        this.setData({ progress: 96 })
      } else {
        this.setData({ progress: currentProgress })
      }
    }, 1000)
    
    // 调用后端API生成面试话术
    const api = require('../../api/index')
    const app = getApp()
    
    // 从全局数据获取需要的参数
    const beautifiedResume = app.globalData.beautifiedResume || ''
    const jdText = app.globalData.jdText || ''
    
    // 检查参数是否完整
    if (!beautifiedResume) {
      wx.showToast({
        title: '请先获取美化后的简历',
        icon: 'none'
      })
      clearInterval(progressInterval)
      this.setData({ isLoading: false })
      return
    }
    
    if (!jdText) {
      wx.showToast({
        title: '请先获取职位描述',
        icon: 'none'
      })
      clearInterval(progressInterval)
      this.setData({ isLoading: false })
      return
    }
    
    // 检查record_id是否为空
    if (!this.data.record_id) {
      wx.showToast({
        title: '请先点击"一键生成全部"按钮获取记录ID',
        icon: 'none',
        duration: 3000
      })
      clearInterval(progressInterval)
      this.setData({ isLoading: false })
      return
    }
    
    // 调用API生成面试话术
    api.generateInterview({
      beautified_resume: beautifiedResume,
      jd_text: jdText,
      record_id: this.data.record_id // 使用从SSE消息中获取的真实record_id
    }).then(res => {
        clearInterval(progressInterval)
        this.setData({ progress: 100 })
        
        console.log('面试话术生成成功:', res)
        
        // 保存结果到全局数据
        app.globalData.interviewScript = res.interview_script || ''
        app.globalData.jobInfo = jobInfo
        
        // 乐观更新使用情况
        const updatedUsage = {
          ...this.data.userUsage,
          interview_remaining: Math.max(0, this.data.userUsage.interview_remaining - 1)
        }
        this.setData({ userUsage: updatedUsage })
        // 更新全局数据中的用户使用情况
        app.globalData.userUsage = updatedUsage
        
        // 重新加载准确数据
        setTimeout(() => {
          this.loadUserUsage();
        }, 1000);
        
        // 显示成功弹框提示
        wx.showToast({
          title: '面试话术重新生成完成',
          icon: 'success',
          duration: 2000
        })
        
        // 跳转到面试话术页面
        wx.navigateTo({
          url: '/pages/interview/interview'
        })
    }).catch(error => {
        clearInterval(progressInterval)
        console.error('面试话术生成失败:', error)
        
        // 检查429错误
        if (error.statusCode === 429) {
          wx.showModal({
            title: '使用次数已达上限',
            content: error.data.message || '今日重新生成面试话术次数已达上限，请明天再来',
            showCancel: false
          })
          this.loadUserUsage(); // 刷新使用情况
        } else {
          wx.showToast({
            title: '生成失败，请稍后重试',
            icon: 'none'
          })
        }
        
        this.setData({ isLoading: false })
    })
  },
  
  // 生成学习计划
  generateLearningPlan() {
    const { jobInfo, resumeFile, userUsage } = this.data
    
    if (!jobInfo.position_name) {
      wx.showToast({
        title: '请先分析岗位',
        icon: 'none'
      })
      return
    }
    
    if (!resumeFile) {
      wx.showToast({
        title: '请先上传简历',
        icon: 'none'
      })
      return
    }
    
    // 检查使用次数
    if (userUsage.learning_path_remaining <= 0) {
      wx.showModal({
        title: '使用次数已达上限',
        content: '今日重新生成学习计划次数已达上限（1次/天），请明天再来',
        showCancel: false
      })
      return
    }
    
    this.setData({
      isLoading: true,
      progress: 0
    })
    
    // 模拟进度更新
    let currentProgress = 0
    const progressInterval = setInterval(() => {
      // 随机增加2-5%的进度，使进度更新更快，适配1分钟的处理时间
      const increment = Math.floor(Math.random() * 4) + 2
      currentProgress += increment
      
      if (currentProgress >= 96) {
        clearInterval(progressInterval)
        this.setData({ progress: 96 })
      } else {
        this.setData({ progress: currentProgress })
      }
    }, 1000)
    
    // 调用后端API生成学习计划
    const api = require('../../api/index')
    const app = getApp()
    
    // 从全局数据获取需要的参数
    const beautifiedResume = app.globalData.beautifiedResume || ''
    const jdText = app.globalData.jdText || ''
    
    // 检查参数是否完整
    if (!beautifiedResume) {
      wx.showToast({
        title: '请先获取美化后的简历',
        icon: 'none'
      })
      clearInterval(progressInterval)
      this.setData({ isLoading: false })
      return
    }
    
    if (!jdText) {
      wx.showToast({
        title: '请先获取职位描述',
        icon: 'none'
      })
      clearInterval(progressInterval)
      this.setData({ isLoading: false })
      return
    }
    
    // 检查record_id是否为空
    if (!this.data.record_id) {
      wx.showToast({
        title: '请先点击"一键生成全部"按钮获取记录ID',
        icon: 'none',
        duration: 3000
      })
      clearInterval(progressInterval)
      this.setData({ isLoading: false })
      return
    }
    
    // 调用API生成学习计划
    api.generateLearningPath({
      beautified_resume: beautifiedResume,
      jd_text: jdText,
      record_id: this.data.record_id // 使用从SSE消息中获取的真实record_id
    }).then(res => {
        clearInterval(progressInterval)
        this.setData({ progress: 100 })
        
        console.log('学习计划生成成功:', res)
        
        // 保存结果到全局数据
        app.globalData.learningPlan = res.learning_path || ''
        app.globalData.jobInfo = jobInfo
        
        // 乐观更新使用情况
        const updatedUsage = {
          ...this.data.userUsage,
          learning_path_remaining: Math.max(0, this.data.userUsage.learning_path_remaining - 1)
        }
        this.setData({ userUsage: updatedUsage })
        // 更新全局数据中的用户使用情况
        app.globalData.userUsage = updatedUsage
        
        // 重新加载准确数据
        setTimeout(() => {
          this.loadUserUsage();
        }, 1000);
        
        // 显示成功弹框提示
        wx.showToast({
          title: '学习计划重新生成完成',
          icon: 'success',
          duration: 2000
        })
        
        // 跳转到学习计划页面
        wx.navigateTo({
          url: '/pages/learning/learning'
        })
    }).catch(error => {
        clearInterval(progressInterval)
        console.error('学习计划生成失败:', error)
        
        // 检查429错误
        if (error.statusCode === 429) {
          wx.showModal({
            title: '使用次数已达上限',
            content: error.data.message || '今日重新生成学习计划次数已达上限，请明天再来',
            showCancel: false
          })
          this.loadUserUsage(); // 刷新使用情况
        } else {
          wx.showToast({
            title: '生成失败，请稍后重试',
            icon: 'none'
          })
        }
        
        this.setData({ isLoading: false })
    })
  },
  
  onUnload() {
    // 页面卸载时的操作
    // 清除所有定时器，避免内存泄漏
    this.stopQueuePolling()
    if (this.data.cancelPoll) {
      clearInterval(this.data.cancelPoll)
    }
  },
  
  // 使用已上传的file_key调用API
  callApiWithFileKey(jobUrl, file_key, progressInterval) {
    const that = this
    const app = getApp()
    
    
    // 获取fileUrl和resumeFile信息
    const fileUrl = that.data.file_url
    const resumeFile = that.data.resumeFile
    
    // 构建请求参数，根据输入类型选择正确的参数
    let requestData = {
      resume_file: {
        url: fileUrl,  // 使用已上传的file_url
        filename: resumeFile.name,
        file_type: 'document'  // 添加文件类型
      },
      force_update: true  // 添加强制更新参数，忽略已存在的记录，强制重新生成新的内容
    }
    
    // 判断输入类型，选择正确的参数
    if (this.isValidUrl(jobUrl)) {
      // 如果是URL，使用job_url参数
      requestData.job_url = jobUrl
    } else {
      // 如果是职位文本描述，使用jd_text参数
      requestData.jd_text = jobUrl
    }
    
    console.log('📤 发送的请求参数:', requestData);
    
    // 使用wx.request发送JSON格式请求，符合接口文档要求
    wx.request({
      url: `${app.globalData.apiBaseUrl}/stream_run_async`,
      method: 'POST',
      header: {
        'content-type': 'application/json',
        'Authorization': `Bearer ${wx.getStorageSync('accessToken')}` // 添加认证头
      },
      data: requestData,
      timeout: 1800000, // 30分钟超时，适应长响应时间
      success(res) {
        // 检查429错误
        if (res.statusCode === 429) {
          clearInterval(progressInterval)
          that.setData({ isLoading: false })
          wx.showModal({
            title: '使用次数已达上限',
            content: res.data.message || '今日一键生成次数已达上限，请明天再来'
          })
          that.loadUserUsage(); // 刷新使用情况
          return
        }
        
        clearInterval(progressInterval)
        that.setData({ progress: 100 })
        
        try {
          // wx.uploadFile返回的res.data是字符串，需要手动解析JSON
          const responseText = res.data
          console.log('API调用成功，原始响应:', responseText)
          
          // 解析响应数据
          let result = {}
          if (typeof responseText === 'string') {
            // 处理SSE格式的响应
            if (responseText.includes('data: ')) {
              // 解析SSE数据
              const lines = responseText.split('\n')
              let hasError = false
              
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const jsonStr = line.substring(6)
                  try {
                    const message = JSON.parse(jsonStr)
                    console.log('解析到SSE消息:', message)
                    
                    // 处理新的 /stream_run_async 消息格式
                    if (message.type === 'progress') {
                      // 处理进度消息
                      that.handleProgress(message)
                      // 保存 task_id
                      if (message.task_id) {
                        that.setData({ taskId: message.task_id })
                        // 启动任务状态轮询
                        if (!that.data.isPolling) {
                          that.startPoll(message.task_id)
                        }
                      }
                    } else if (message.type === 'complete') {
                      // 处理完成消息
                      that.handleComplete(message)
                      // 保存结果
                      result = message.result
                      // 保存 task_id
                      if (message.task_id) {
                        that.setData({ taskId: message.task_id })
                      }
                      // 保存 record_id（从 result 中提取）
                      if (message.result && message.result.record_id) {
                        const recordId = message.result.record_id || ''
                        that.setData({ record_id: recordId })
                        console.log('从result中保存record_id:', recordId)
                      }
                      
                      // 乐观更新使用情况
                      const updatedUsage = {
                        ...that.data.userUsage,
                        stream_run_remaining: Math.max(0, that.data.userUsage.stream_run_remaining - 1)
                      }
                      that.setData({ userUsage: updatedUsage })
                      // 更新全局数据中的用户使用情况
                      app.globalData.userUsage = updatedUsage
                      
                      // 重新加载准确数据
                      setTimeout(() => {
                        that.loadUserUsage();
                      }, 1000);
                    } else if (message.type === 'error') {
                      // 处理错误消息
                      that.handleError(message)
                      hasError = true
                      break
                    } else if (message.record_id) {
                      // 保存record_id到页面数据
                      const recordId = message.record_id || ''
                      that.setData({ record_id: recordId })
                      console.log('保存record_id:', recordId)
                    }
                  } catch (e) {
                    console.error('单行SSE消息解析失败:', e)
                  }
                }
              }
              
              if (hasError) {
                return
              }
            } else {
              // 普通JSON格式响应
              result = JSON.parse(responseText)
              console.log('解析后的API响应:', result)
            }
          } else {
            // 已经是JSON对象
            result = responseText
            console.log('API响应:', result)
          }
          
          // 处理Coze API返回的错误格式
          if (result && result.content && result.content.message_end && result.content.message_end.message) {
            const errorMessage = result.content.message_end.message
            console.error('API返回错误:', errorMessage)
            wx.showToast({
              title: errorMessage,
              icon: 'none',
              duration: 3000
            })
            return
          }
          
          // 检查响应数据是否包含我们需要的字段
          if (result && (result.jd_text || result.beautified_resume || result.interview_script || result.learning_path)) {
            // 保存结果到全局数据
            app.globalData.jdText = result.jd_text // 保存完整的jd_text字符串
            app.globalData.beautifiedResume = result.beautified_resume
            app.globalData.interviewScript = result.interview_script
            app.globalData.learningPlan = result.learning_path
            
            // 更新页面数据
            that.setData({
              result: result
            })
            
            // 从jd_text中提取结构化信息更新到jobInfo
            let jobInfo = {
              position_name: '未获取到岗位名称',
              job_type: '全职',
              salary: '',
              company_name: '',
              requirements: []
            }
            
            // 初始化所有岗位要求为收起状态
            const expandedRequirements = {}
            
            if (result.jd_text) {
              const jdText = result.jd_text
              
              // 优化：提取岗位名称（处理Markdown格式）
              const positionNameMatch = jdText.match(/职位名称：([^\n]+)/)
              if (positionNameMatch && positionNameMatch[1]) {
                jobInfo.position_name = positionNameMatch[1].trim()
              } else {
                // 备选方案：从Markdown标题后提取
                const altPositionMatch = jdText.match(/## 职位基本信息\n[\s\S]*?职位名称：([^\n]+)/)
                if (altPositionMatch && altPositionMatch[1]) {
                  jobInfo.position_name = altPositionMatch[1].trim()
                } else {
                  // 如果正则匹配失败，尝试从文本开头提取
                  jobInfo.position_name = jdText.replace(/^#+/, '').trim().substring(0, 30).trim()
                }
              }
              
              // 提取公司名称
              const companyMatch = jdText.match(/公司：([^\n]+)/)
              if (companyMatch && companyMatch[1]) {
                jobInfo.company_name = companyMatch[1].trim()
              }
              
              // 提取职位类型
              const typeMatch = jdText.match(/类型：([^\n]+)/)
              if (typeMatch && typeMatch[1]) {
                jobInfo.job_type = typeMatch[1].trim()
              }
              
              // 提取地点
              const locationMatch = jdText.match(/地点：([^\n]+)/)
              if (locationMatch && locationMatch[1]) {
                jobInfo.location = locationMatch[1].trim()
              }
              
              // 优化：提取完整的岗位要求（处理Markdown格式）
              const allRequirements = []
              
              // 1. 提取工作职责
              const responsibilitiesMatch = jdText.match(/## 工作职责([\s\S]*?)(## |$)/)
              if (responsibilitiesMatch && responsibilitiesMatch[1]) {
                const responsibilitiesText = responsibilitiesMatch[1]
                const responsibilitiesArray = responsibilitiesText.split(/\d+\. /)
                  .filter(item => item.trim())
                  .map(item => item.trim())
                
                if (responsibilitiesArray.length > 0) {
                  allRequirements.push({
                    type: 'job_responsibilities',
                    title: '工作职责',
                    content: responsibilitiesArray
                  })
                }
              }
              
              // 2. 提取任职要求
              const requirementsMatch = jdText.match(/## 任职要求([\s\S]*?)(## |$)/)
              if (requirementsMatch && requirementsMatch[1]) {
                const requirementsText = requirementsMatch[1]
                
                // 提取必备要求
                const mustHaveMatch = requirementsText.match(/### 必备要求([\s\S]*?)(### |$)/)
                if (mustHaveMatch && mustHaveMatch[1]) {
                  const mustHaveText = mustHaveMatch[1]
                  const mustHaveArray = mustHaveText.split(/\d+\. /)
                    .filter(item => item.trim())
                    .map(item => item.trim())
                  
                  if (mustHaveArray.length > 0) {
                    allRequirements.push({
                      type: 'must_have',
                      title: '必备要求',
                      content: mustHaveArray
                    })
                  }
                }
                
                // 提取优先条件
                const preferredMatch = requirementsText.match(/### 优先条件([\s\S]*?)(### |$)/)
                if (preferredMatch && preferredMatch[1]) {
                  const preferredText = preferredMatch[1]
                  const preferredArray = preferredText.split(/\d+\. /)
                    .filter(item => item.trim())
                    .map(item => {
                      // 处理Markdown格式，移除**加粗标记
                      let processedText = item.trim()
                      processedText = processedText.replace(/\*\*(.*?)\*\*/g, '$1')
                      return processedText
                    })
                  
                  if (preferredArray.length > 0) {
                    allRequirements.push({
                      type: 'preferred',
                      title: '优先条件',
                      content: preferredArray
                    })
                  }
                }
              }
              
              // 3. 提取技术栈与关键词
              const techStackMatch = jdText.match(/## 技术栈与关键词([\s\S]*?)(## |$)/)
              if (techStackMatch && techStackMatch[1]) {
                const techStackText = techStackMatch[1].trim()
                let techStackArray = []
                
                // 将技术栈文本分割成多个条目
                if (techStackText.includes('- ')) {
                  // 如果有列表项，按列表项分割
                  techStackArray = techStackText.split('- ')
                    .filter(item => item.trim())
                    .map(item => '- ' + item.trim())
                } else {
                  // 否则按分号或换行分割
                  techStackArray = techStackText.split(/[；;\n]+/)
                    .filter(item => item.trim())
                    .map(item => item.trim())
                }
                
                allRequirements.push({
                  type: 'tech_stack',
                  title: '技术栈与关键词',
                  content: techStackArray
                })
              }
              
              // 4. 提取职位亮点
              const highlightsMatch = jdText.match(/## 职位亮点([\s\S]*?)(## |$)/)
              if (highlightsMatch && highlightsMatch[1]) {
                const highlightsText = highlightsMatch[1]
                const highlightsArray = highlightsText.split(/\d+\. /)
                  .filter(item => item.trim())
                  .map(item => {
                    // 处理Markdown格式，移除**加粗标记
                    let processedText = item.trim()
                    processedText = processedText.replace(/\*\*(.*?)\*\*/g, '$1')
                    return processedText
                  })
                
                if (highlightsArray.length > 0) {
                  allRequirements.push({
                    type: 'highlights',
                    title: '职位亮点',
                    content: highlightsArray
                  })
                }
              }
              
              // 将结构化的要求转换为适合UI展示的格式
              const uiRequirements = []
              allRequirements.forEach(reqGroup => {
                // 先添加组标题
                uiRequirements.push({
                  isTitle: true,
                  title: reqGroup.title,
                  content: '',
                  fullContent: reqGroup.content
                })
                
                // 再添加具体要求
                reqGroup.content.forEach(reqItem => {
                  uiRequirements.push({
                    isTitle: false,
                    title: reqGroup.title,
                    content: reqItem,
                    fullContent: reqItem
                  })
                })
              })
              
              jobInfo.requirements = uiRequirements
            }
            
            // 初始化所有岗位要求为收起状态
            if (jobInfo.requirements && jobInfo.requirements.length > 0) {
              jobInfo.requirements.forEach((_, index) => {
                expandedRequirements[index] = false
              })
            }
            
            that.setData({
              jobInfo: jobInfo,
              expandedRequirements: expandedRequirements
            })
            
            // 标记一键生成全部按钮已被调用
            that.setData({
              isSubmitCalled: true
            })
            
            wx.showToast({
              title: '处理完成',
              icon: 'success'
            })
            
            // 延迟隐藏进度条，让用户看到完整的进度动画
            setTimeout(() => {
              that.setData({ isLoading: false })
            }, 500)
          } else {
            // 处理API返回失败的情况
            console.error('API返回失败:', result)
            wx.showToast({
              title: '处理失败，请稍后重试',
              icon: 'none'
            })
          }
        } catch (error) {
          console.error('解析结果失败:', error)
          wx.showToast({
            title: '处理失败，请稍后重试',
            icon: 'none'
          })
        }
      },
      fail(error) {
        clearInterval(progressInterval)
        console.error('API调用失败:', error)
        
        // 重置状态
        that.setData({ 
          progress: 0,
          isLoading: false
        })
        
        // 隐藏任何加载提示
        wx.hideLoading()
        
        // 显示错误提示
        setTimeout(() => {
          // 检查是否是登录过期或未登录
          if (error.errMsg && (error.errMsg.includes('登录已过期') || error.errMsg.includes('Unauthorized') || error.errMsg.includes('请先登录'))) {
            // 鉴权失败，清空上传控件显示
            that.setData({
              fileName: '',
              file_key: '',
              file_url: '',
              resumeFile: null
            })
            wx.showToast({
              title: '请先登录',
              icon: 'none',
              duration: 3000
            })
          } else {
            // 显示失败提示，让用户自主选择重新操作
            wx.showToast({
              title: `请求失败，请稍后重试`,
              icon: 'none',
              duration: 3000
            })
          }
        }, 100)
      },
      complete() {
        // 移除直接隐藏进度条的代码，改为在success和fail中处理
      }
    })
  },

  // 队列 API 相关方法

  // 获取队列统计
  getQueueStatus() {
    const app = getApp()
    const apiBaseUrl = app.globalData.apiBaseUrl
    
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${apiBaseUrl}/api/queue/status`,
        method: 'GET',
        success: (res) => {
          if (res.data.success) {
            // 更新队列总人数到页面数据
            this.setData({
              queueTotal: res.data.data.pending_count || 0,
              queueStats: res.data.data
            })
            resolve(res.data.data)
          } else {
            reject(res.data.message)
          }
        },
        fail: (err) => {
          reject(err)
        }
      })
    })
  },

  // 开始队列状态轮询
  startQueuePolling() {
    // 先获取一次队列状态和排队提示
    this.getQueueStatus().catch(err => {
      console.error('获取队列状态失败:', err)
    })
    
    this.getQueueTip().catch(err => {
      console.error('获取排队提示失败:', err)
    })
    
    // 每30秒更新一次队列状态和排队提示
    this.queuePollInterval = setInterval(() => {
      this.getQueueStatus().catch(err => {
        console.error('获取队列状态失败:', err)
      })
      
      this.getQueueTip().catch(err => {
        console.error('获取排队提示失败:', err)
      })
    }, 30000)
  },

  // 停止队列状态轮询
  stopQueuePolling() {
    if (this.queuePollInterval) {
      clearInterval(this.queuePollInterval)
      this.queuePollInterval = null
    }
  },

  // 获取排队提示
  getQueueTip() {
    const app = getApp()
    const apiBaseUrl = app.globalData.apiBaseUrl
    
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${apiBaseUrl}/api/queue/tip`,
        method: 'GET',
        success: (res) => {
          if (res.data.success) {
            // 更新排队提示到页面数据
            this.setData({
              queueTip: res.data.data.tip || '',
              estimatedWaitTimeFormatted: res.data.data.estimated_wait_time_formatted || ''
            })
            resolve(res.data.data)
          } else {
            reject(res.data.message)
          }
        },
        fail: (err) => {
          reject(err)
        }
      })
    })
  },

  // 获取任务位置
  getTaskPosition(taskId) {
    const app = getApp()
    const apiBaseUrl = app.globalData.apiBaseUrl
    
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${apiBaseUrl}/api/queue/task/${taskId}/position`,
        method: 'GET',
        success: (res) => {
          if (res.data.success) {
            resolve(res.data.data)
          } else {
            reject(res.data.message)
          }
        },
        fail: (err) => {
          reject(err)
        }
      })
    })
  },

  // 取消任务
  cancelTask() {
    const { taskId } = this.data
    if (!taskId) return
    
    const app = getApp()
    const apiBaseUrl = app.globalData.apiBaseUrl
    
    wx.request({
      url: `${apiBaseUrl}/api/queue/task/${taskId}/cancel`,
      method: 'POST',
      header: {
        'Authorization': `Bearer ${wx.getStorageSync('accessToken')}`
      },
      success: (res) => {
        if (res.data.success) {
          this.stopPoll()
          this.setData({
            status: 'CANCELLED',
            taskId: null
          })
          wx.showToast({
            title: '任务已取消',
            icon: 'success'
          })
        } else {
          wx.showToast({
            title: '取消失败，请重试',
            icon: 'none'
          })
        }
      },
      fail: (err) => {
        console.error('取消任务失败:', err)
        wx.showToast({
          title: '取消失败，请重试',
          icon: 'none'
        })
      }
    })
  },

  // 悬浮框触摸开始事件
  onFloatBoxTouchStart(e) {
    // 记录触摸开始位置
    this.setData({
      floatBoxDragging: true,
      floatBoxStartX: e.touches[0].clientX,
      floatBoxStartY: e.touches[0].clientY
    })
  },

  // 悬浮框触摸移动事件
  onFloatBoxTouchMove(e) {
    if (!this.data.floatBoxDragging) return
    
    // 计算移动距离
    const deltaX = e.touches[0].clientX - this.data.floatBoxStartX
    const deltaY = e.touches[0].clientY - this.data.floatBoxStartY
    
    // 更新悬浮框位置
    this.setData({
      floatBoxPosition: {
        x: this.data.floatBoxPosition.x + deltaX,
        y: this.data.floatBoxPosition.y + deltaY
      },
      floatBoxStartX: e.touches[0].clientX,
      floatBoxStartY: e.touches[0].clientY
    })
  },

  // 悬浮框触摸结束事件
  onFloatBoxTouchEnd() {
    // 结束拖动状态
    this.setData({
      floatBoxDragging: false
    })
  },

  // 悬浮框点击事件：展开/收起
  onFloatBoxTap() {
    // 如果正在拖动，则不处理点击事件
    if (this.data.floatBoxDragging) return
    
    // 切换展开/收起状态
    const newExpandedState = !this.data.floatBoxExpanded
    this.setData({
      floatBoxExpanded: newExpandedState
    })
    
    // 如果是展开状态，刷新使用情况数据
    if (newExpandedState) {
      this.loadUserUsage()
    }
  },

  // 悬浮框关闭按钮点击事件
  onFloatBoxClose(e) {
    // 阻止事件冒泡，避免触发onFloatBoxTap
    e.stopPropagation()
    
    // 收起悬浮框
    this.setData({
      floatBoxExpanded: false
    })
  },

  // 遮罩层点击事件：关闭悬浮框
  onFloatBoxOverlayTap() {
    // 收起悬浮框
    this.setData({
      floatBoxExpanded: false
    })
  },

  // 开始轮询任务状态
  startPoll(taskId) {
    const that = this
    
    this.setData({ isPolling: true })
    
    const poll = () => {
      that.getTaskPosition(taskId).then(data => {
        // 更新状态
        that.setData({
          status: data.status,
          queuePosition: data.position || null,
          estimatedWaitTime: data.estimated_wait_time || 0,
          progress: data.progress || 0,
          progressMessage: data.progress_message || '',
          result: data.result || that.data.result
        })

        // 继续轮询或停止
        if (['QUEUED', 'RUNNING'].includes(data.status)) {
          that.setData({
            cancelPoll: setTimeout(poll, 3000)
          })
        } else {
          // 任务结束
          that.stopPoll()
          if (data.status === 'SUCCESS') {
            wx.showToast({
              title: '分析完成',
              icon: 'success'
            })
          } else if (data.status === 'FAILED') {
            wx.showToast({
              title: data.error || '分析失败',
              icon: 'none'
            })
          }
        }
      }).catch(err => {
        console.error('轮询任务状态失败:', err)
        // 失败时继续轮询
        that.setData({
          cancelPoll: setTimeout(poll, 3000)
        })
      })
    }

    poll()
  },

  // 停止轮询任务状态
  stopPoll() {
    const { cancelPoll } = this.data
    if (cancelPoll) {
      clearTimeout(cancelPoll)
      this.setData({
        cancelPoll: null,
        isPolling: false
      })
    }
  },

  // 处理进度消息
  handleProgress(msg) {
    this.setData({
      status: 'RUNNING',
      progress: msg.progress || 0,
      progressMessage: msg.message || '',
      queuePosition: msg.queue_position || null
    })
  },

  // 处理完成消息
  handleComplete(msg) {
    this.stopPoll()
    this.setData({
      status: 'SUCCESS',
      progress: 100,
      result: msg.result || this.data.result,
      taskId: msg.task_id || this.data.taskId
    })
    
    wx.showToast({
      title: '分析完成',
      icon: 'success'
    })
  },

  // 处理错误消息
  handleError(msg) {
    this.stopPoll()
    this.setData({
      status: 'FAILED',
      error: msg.error || '分析失败'
    })
    
    wx.showToast({
      title: msg.error || '分析失败',
      icon: 'none'
    })
  },

  // 页面卸载时停止轮询
  onUnload() {
    this.stopPoll()
  }
})