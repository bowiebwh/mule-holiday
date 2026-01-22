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
    isSubmitCalled: false, // 用于跟踪是否调用过一键生成全部按钮
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

  // 职位URL获取焦点
  onJobUrlFocus() {
    // 可以添加焦点样式处理
  },

  // 职位URL失去焦点
  onJobUrlBlur() {
    // 可以添加失焦样式处理
  },

  // 职位URL行数变化
  onJobUrlLineChange() {
    // 可以添加行数变化处理
  },

  // 选择简历文件
  chooseResumeFile() {
    const that = this
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['.pdf', '.docx', '.txt', '.md'], // 支持更多格式
      success(res) {
        const tempFile = res.tempFiles[0]
        that.setData({
          resumeFile: tempFile,
          fileName: tempFile.name,
          isLoading: true,
          progress: 0
        })
        
        // 模拟进度更新
        const progressInterval = setInterval(() => {
          that.setData(prevData => {
            if (prevData.progress >= 90) {
              clearInterval(progressInterval)
              return { progress: 90 }
            }
            return { progress: prevData.progress + 10 }
          })
        }, 800)
        
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
            wx.showToast({
              title: '上传失败，请稍后重试',
              icon: 'none'
            })
            that.setData({ isLoading: false })
        }).then(() => {
            // 上传成功后延迟隐藏进度条，让用户看到完整的进度动画
            setTimeout(() => {
                that.setData({ isLoading: false })
            }, 500)
        })
      }
    })
  },

  // 提交表单
  submitForm() {
    const { jobUrl, file_key, file_url } = this.data
    
    if (!jobUrl || !file_key) {
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
    
    // 模拟进度更新，调整间隔为1500ms，让用户能看到明显的进度变化
    const progressInterval = setInterval(() => {
      this.setData(prevData => {
        if (prevData.progress >= 90) {
          clearInterval(progressInterval)
          return { progress: 90 }
        }
        return { progress: prevData.progress + 10 }
      })
    }, 1500)
    
    // 调用后端API，使用已上传的file_key
    this.callApiWithFileKey(jobUrl, file_key, progressInterval)
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
          wx.request({
              url: `${app.globalData.apiBaseUrl}/stream_run`,
              method: 'POST',
              header: {
                'content-type': 'application/json',
                'Authorization': `Bearer ${wx.getStorageSync('accessToken')}` // 添加认证头
              },
              data: {
                job_url: jobUrl,
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
                
                // 处理不同类型的消息
                if (message.type === 'node_start') {
                  // 更新进度
                  const newProgress = message.progress || 0
                  that.setData({ progress: newProgress })
                  wx.showLoading({
                    title: message.node_name || '处理中...',
                    mask: true
                  })
                } else if (message.type === 'node_complete') {
                  // 节点完成，更新进度并合并state数据
                  const newProgress = message.progress || 0
                  that.setData({ progress: newProgress })
                  // 合并state数据到resultData
                  if (message.state) {
                    resultData = { ...resultData, ...message.state }
                    console.log('合并state数据后的resultData:', resultData)
                  }
                } else if (message.type === 'end' || message.type === 'complete') {
                  // 处理完成，合并数据
                  if (message.jd_text) resultData.jd_text = message.jd_text
                  if (message.beautified_resume) resultData.beautified_resume = message.beautified_resume
                  if (message.interview_script) resultData.interview_script = message.interview_script
                  if (message.learning_path) resultData.learning_path = message.learning_path
                } else if (message.type === 'message_end') {
                  // 处理Coze API返回的错误格式
                  if (message.content && message.content.message_end && message.content.message_end.message) {
                    const errorMessage = message.content.message_end.message
                    console.error('API返回错误:', errorMessage)
                    wx.hideLoading()
                    wx.showToast({
                      title: errorMessage,
                      icon: 'none',
                      duration: 3000
                    })
                    return
                  }
                } else if (message.jd_text || message.beautified_resume || message.interview_script || message.learning_path) {
                  // 完整数据返回
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
            app.globalData.jobInfo = result.jd_text
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
          wx.showToast({
            title: '文件上传失败，请稍后重试',
            icon: 'none'
          })
          that.setData({ isLoading: false })
        }, 500)
    })
  },

  onLoad() {
    // 页面加载时的初始化
    console.log('optimize页面onLoad函数被调用')
    console.log('getApp()返回:', getApp())
    console.log('globalData:', getApp().globalData)
  },

  onReady() {
    // 页面初次渲染完成时的操作
    console.log('optimize页面onReady函数被调用')
  },

  onShow() {
    // 页面显示时的操作
    console.log('optimize页面onShow函数被调用')
  },

  onHide() {
    // 页面隐藏时的操作
    console.log('optimize页面onHide函数被调用')
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
  
  // 分析岗位
  analyzeJob() {
    console.log('analyzeJob函数被调用 - 开始')
    
    const { jobUrl } = this.data
    
    console.log('jobUrl:', jobUrl)
    
    if (!jobUrl.trim()) {
      console.log('jobUrl为空，显示提示')
      wx.showToast({
        title: '请输入职位URL',
        icon: 'none'
      })
      return
    }
    
    console.log('设置isLoading为true')
    this.setData({
      isLoading: true,
      progress: 0
    })
    
    // 模拟进度更新
    console.log('创建进度更新定时器')
    const progressInterval = setInterval(() => {
      this.setData(prevData => {
        if (prevData.progress >= 90) {
          clearInterval(progressInterval)
          return { progress: 90 }
        }
        return { progress: prevData.progress + 10 }
      })
    }, 800)
    
    // 直接调用wx.request来测试，不使用API服务
    console.log('开始调用岗位分析API...')
    console.log('直接调用wx.request')
    
    try {
      const app = getApp()
      const apiBaseUrl = app.globalData.apiBaseUrl
      console.log('apiBaseUrl:', apiBaseUrl)
      const url = `${apiBaseUrl}/api/extract-jd`
      console.log('请求URL:', url)
      
      wx.request({
        url: url,
        method: 'POST',
        data: {
          job_url: jobUrl
        },
        header: {
          'content-type': 'application/json',
          'Authorization': `Bearer ${wx.getStorageSync('accessToken')}` // 添加认证头
        },
        timeout: 600000, // 延长超时时间到10分钟，适应长响应时间
        success: (res) => {
          console.log('wx.request成功回调执行:', res)
          console.log('响应状态码:', res.statusCode)
          console.log('响应数据:', res.data)
          
          clearInterval(progressInterval)
          this.setData({ progress: 100 })
          
          // 格式化岗位信息
          const result = res.data
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
          
          wx.showToast({
            title: '岗位分析完成',
            icon: 'success'
          })
        },
        fail: (err) => {
          console.error('wx.request失败回调执行:', err)
          console.error('错误详情:', JSON.stringify(err))
          clearInterval(progressInterval)
          wx.showToast({
            title: '分析失败，请稍后重试',
            icon: 'none'
          })
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
    const { result } = this.data
    const app = getApp()
    
    wx.showLoading({
      title: '正在下载简历...',
    })
    
    // 检查是否有直接的下载链接
    let downloadUrl = result.beautified_resume_url
    
    // 如果没有直接下载链接，可以考虑使用其他方式生成下载链接
    if (!downloadUrl) {
      // 这里可以添加默认的下载链接或提示
      wx.hideLoading()
      wx.showToast({
        title: '暂无法下载简历',
        icon: 'none'
      })
      return
    }
    
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
    const { jobInfo, resumeFile } = this.data
    
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
    
    this.setData({
      isLoading: true,
      progress: 0
    })
    
    // 模拟进度更新
    const progressInterval = setInterval(() => {
      this.setData(prevData => {
        if (prevData.progress >= 90) {
          clearInterval(progressInterval)
          return { progress: 90 }
        }
        return { progress: prevData.progress + 10 }
      })
    }, 800)
    
    // 调用后端API生成面试话术
    const api = require('../../api/index')
    const app = getApp()
    
    // 从全局数据获取需要的参数
    const beautifiedResume = app.globalData.beautifiedResume || ''
    const jdText = app.globalData.jobInfo || ''
    
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
        title: '请先分析岗位信息',
        icon: 'none'
      })
      clearInterval(progressInterval)
      this.setData({ isLoading: false })
      return
    }
    
    // 调用API生成面试话术
    api.generateInterview({
      beautified_resume: beautifiedResume,
      jd_text: jdText,
      record_id: 33 // 这里需要替换为实际的record_id，暂时使用示例值
    }).then(res => {
        clearInterval(progressInterval)
        this.setData({ progress: 100 })
        
        console.log('面试话术生成成功:', res)
        
        // 保存结果到全局数据
        app.globalData.interviewScript = res.interview_script || ''
        app.globalData.jobInfo = jobInfo
        
        wx.showToast({
          title: '面试话术生成成功',
          icon: 'success'
        })
        
        // 跳转到面试话术页面
        wx.navigateTo({
          url: '/pages/interview/interview'
        })
    }).catch(error => {
        clearInterval(progressInterval)
        console.error('面试话术生成失败:', error)
        wx.showToast({
          title: '生成失败，请稍后重试',
          icon: 'none'
        })
        this.setData({ isLoading: false })
    })
  },
  
  // 生成学习计划
  generateLearningPlan() {
    const { jobInfo, resumeFile } = this.data
    
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
    
    this.setData({
      isLoading: true,
      progress: 0
    })
    
    // 模拟进度更新
    const progressInterval = setInterval(() => {
      this.setData(prevData => {
        if (prevData.progress >= 90) {
          clearInterval(progressInterval)
          return { progress: 90 }
        }
        return { progress: prevData.progress + 10 }
      })
    }, 800)
    
    // 调用后端API生成学习计划
    const api = require('../../api/index')
    const app = getApp()
    
    // 从全局数据获取需要的参数
    const beautifiedResume = app.globalData.beautifiedResume || ''
    const jdText = app.globalData.jobInfo || ''
    
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
        title: '请先分析岗位信息',
        icon: 'none'
      })
      clearInterval(progressInterval)
      this.setData({ isLoading: false })
      return
    }
    
    // 调用API生成学习计划
    api.generateLearningPath({
      beautified_resume: beautifiedResume,
      jd_text: jdText,
      record_id: 33 // 这里需要替换为实际的record_id，暂时使用示例值
    }).then(res => {
        clearInterval(progressInterval)
        this.setData({ progress: 100 })
        
        console.log('学习计划生成成功:', res)
        
        // 保存结果到全局数据
        app.globalData.learningPlan = res.learning_path || ''
        app.globalData.jobInfo = jobInfo
        
        wx.showToast({
          title: '学习计划生成成功',
          icon: 'success'
        })
        
        // 跳转到学习计划页面
        wx.navigateTo({
          url: '/pages/learning/learning'
        })
    }).catch(error => {
        clearInterval(progressInterval)
        console.error('学习计划生成失败:', error)
        wx.showToast({
          title: '生成失败，请稍后重试',
          icon: 'none'
        })
        this.setData({ isLoading: false })
    })
  },
  
  onUnload() {
    // 页面卸载时的操作
  },
  
  // 使用已上传的file_key调用API
  callApiWithFileKey(jobUrl, file_key, progressInterval) {
    const that = this
    const app = getApp()
    
    // 获取fileUrl和resumeFile信息
    const fileUrl = that.data.file_url
    const resumeFile = that.data.resumeFile
    
    console.log('📤 发送的 resume_file 对象:', {
      url: fileUrl,
      filename: resumeFile.name,
      file_type: 'document'
    });
    
    // 使用wx.request发送JSON格式请求，符合接口文档要求
    wx.request({
      url: `${app.globalData.apiBaseUrl}/stream_run`,
      method: 'POST',
      header: {
        'content-type': 'application/json',
        'Authorization': `Bearer ${wx.getStorageSync('accessToken')}` // 添加认证头
      },
      data: {
        job_url: jobUrl,
        resume_file: {
          url: fileUrl,  // 使用已上传的file_url
          filename: resumeFile.name,
          file_type: 'document'  // 添加文件类型
        }
      },
      timeout: 1800000, // 30分钟超时，适应长响应时间
      success(res) {
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
            if (responseText.includes('event: message')) {
              // 解析SSE数据
              const lines = responseText.split('\n')
              let hasError = false
              
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const jsonStr = line.substring(6)
                  try {
                    const message = JSON.parse(jsonStr)
                    console.log('解析到SSE消息:', message)
                    
                    // 处理message_end类型的消息
                    if (message.type === 'message_end') {
                      if (message.content && message.content.message_end && message.content.message_end.message) {
                        const errorMessage = message.content.message_end.message
                        console.error('SSE API返回错误:', errorMessage)
                        wx.showToast({
                          title: errorMessage,
                          icon: 'none',
                          duration: 3000
                        })
                        hasError = true
                        break
                      }
                    } else if (message.type === 'node_complete') {
                      // 合并node_complete事件中的state数据到result
                      if (message.state) {
                        result = { ...result, ...message.state }
                        console.log('合并state数据后的result:', result)
                      }
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
            app.globalData.jobInfo = result.jd_text
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
        that.setData({ progress: 100 })
        console.error('API调用失败:', error)
        wx.showToast({
          title: `请求失败: ${error.errMsg}`,
          icon: 'none',
          duration: 3000
        })
        // 延迟隐藏进度条，让用户看到完整的进度动画
        setTimeout(() => {
          that.setData({ isLoading: false })
        }, 500)
      },
      complete() {
        // 移除直接隐藏进度条的代码，改为在success和fail中处理
      }
    })
  }
})