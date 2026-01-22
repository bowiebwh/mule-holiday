// pages/learning/learning.js
const app = getApp()
const towxml = require('../../components/towxml/index')

Page({
  data: {
    learningList: [], // 学习计划列表
    expandedCards: {}, // 记录每个卡片的展开状态
    isLoading: false, // 加载状态
    currentPage: 1, // 当前页码
    total: 0, // 总记录数
    hasMore: true, // 是否还有更多数据
    loadingContent: {}, // 记录正在加载内容的卡片
    keyword: '' // 搜索关键词
  },

  onLoad() {
    this.loadLearningList()
  },

  onShow() {
    // 每次页面显示时都重置状态并重新加载数据
    this.setData({
      learningList: [], // 清空现有数据
      currentPage: 1, // 重置页码
      hasMore: true, // 重置加载更多状态
      expandedCards: {}, // 重置卡片展开状态
      loadingContent: {} // 重置内容加载状态
    })
    this.loadLearningList()
  },

  // 加载学习计划列表
  loadLearningList() {
    // 添加调试日志
    console.log('loadLearningList called, hasMore:', this.data.hasMore, 'isLoading:', this.data.isLoading)
    
    // 如果已经没有更多数据，或者正在加载中，不再请求
    if (!this.data.hasMore || this.data.isLoading) {
      console.log('loadLearningList skipped, hasMore or isLoading is false')
      return
    }

    this.setData({
      isLoading: true
    })
    
    const app = getApp()
    const apiBaseUrl = app.globalData.apiBaseUrl
    
    // 调试API基础URL
    console.log('API Base URL:', apiBaseUrl)
    
    // 调用后端API获取学习计划列表
    wx.request({
      url: `${apiBaseUrl}/api/job-analysis`,
      method: 'GET',
      data: {
        page: this.data.currentPage,
        page_size: 20,
        keyword: this.data.keyword,
        has_learning_path: true // 只获取有学习计划的记录
      },
      header: {
        'content-type': 'application/json',
        'Authorization': `Bearer ${wx.getStorageSync('accessToken')}` // 添加认证头
      },
      timeout: 1800000, // 30分钟超时
      success: (res) => {
        if (res.data.success) {
          const data = res.data.data
          const items = data.items || []
          
          // 处理返回的数据，提取学习计划相关信息
          const learningList = items.map(item => {
            // 列表接口不包含完整内容，只保存基本信息和内容类型
            // 完整内容在卡片展开时通过单条记录接口获取
            // 根据后端返回的字段判断内容类型
            const contentType = item.has_learning_path_html ? 'html' : 'markdown';
            
            return {
              id: item.id,
              position: this.extractPositionName(item.jd_text),
              content: '', // 初始内容为空，展开时加载
              contentType: contentType, // 根据后端字段设置内容类型
              fullData: item // 保存完整数据，便于后续使用
            };
          });
          
          // 合并新数据到现有列表
          const newLearningList = this.data.currentPage === 1 
            ? learningList 
            : [...this.data.learningList, ...learningList]
          
          this.setData({
            learningList: newLearningList,
            total: data.total || 0,
            hasMore: newLearningList.length < data.total,
            currentPage: this.data.currentPage + 1
          })
        } else {
          console.error('获取学习计划列表失败:', res.data.message)
        }
      },
      fail: (err) => {
        console.error('请求学习计划列表接口失败:', err)
      },
      complete: () => {
        this.setData({
          isLoading: false
        })
      }
    })
  },

  // 从JD文本中提取岗位名称
  extractPositionName(jdText) {
    if (!jdText) return '未知岗位'
    
    // 尝试从JD文本中提取职位名称
    const positionMatch = jdText.match(/职位名称：([^\n]+)/)
    if (positionMatch && positionMatch[1]) {
      return positionMatch[1].trim()
    }
    
    // 备选方案：从文本开头提取
    return jdText.replace(/^#+/, '').trim().substring(0, 30).trim()
  },

  // 切换学习计划卡片的展开/收起状态
  toggleLearningItem(e) {
    const id = e.currentTarget.dataset.id
    const expandedCards = this.data.expandedCards
    
    // 切换状态
    const isExpanded = expandedCards[id] = !expandedCards[id]
    
    this.setData({
      expandedCards
    })
    
    // 如果是展开状态，且内容为空或默认文本，调用单条数据查询获取完整内容
    const learningList = this.data.learningList
    const currentItem = learningList.find(item => item.id === id)
    
    if (isExpanded && (currentItem.content === '' || currentItem.content === '暂无学习计划内容')) {
      this.loadLearningDetail(id)
    }
  },

  // 加载单个学习计划详情
  loadLearningDetail(recordId) {
    // 如果已经在加载中，不再请求
    if (this.data.loadingContent[recordId]) {
      return
    }
    
    // 更新加载状态
    this.setData({
      [`loadingContent[${recordId}]`]: true
    })
    
    const app = getApp()
    const apiBaseUrl = app.globalData.apiBaseUrl
    
    // 调用后端API获取单个学习计划详情
    wx.request({
      url: `${apiBaseUrl}/api/job-analysis/${recordId}`,
      method: 'GET',
      header: {
        'content-type': 'application/json',
        'Authorization': `Bearer ${wx.getStorageSync('accessToken')}` // 添加认证头
      },
      timeout: 1800000, // 30分钟超时
      success: (res) => {
        if (res.data.success) {
          const data = res.data.data
          
          // 更新对应卡片的内容
          const learningList = this.data.learningList.map(item => {
            if (item.id === recordId) {
              let content = '';
              let contentType = 'markdown'; // 使用towxml组件渲染Markdown内容
              let towxmlContent = null;
              
              // 优先使用learning_path_html字段（虽然名为html，但实际是Markdown内容）
              if (data.learning_path_html && data.learning_path_html.trim() !== '') {
                content = data.learning_path_html;
                // 使用towxml将Markdown转换为towxml格式
                towxmlContent = towxml(data.learning_path_html, 'markdown');
                console.log('Using learning_path_html content with towxml, contentType:', contentType);
              } 
              // 如果没有learning_path_html，使用learning_path字段
              else if (data.learning_path && data.learning_path.trim() !== '') {
                content = data.learning_path;
                // 使用towxml将Markdown转换为towxml格式
                towxmlContent = towxml(data.learning_path, 'markdown');
                console.log('Using learning_path content with towxml, contentType:', contentType);
              }
              // 如果都没有，显示默认文本
              else {
                content = '暂无学习计划内容';
                contentType = 'text';
                console.log('Using default content, contentType:', contentType);
              }
              
              // 直接传递原始内容给mp-html，让它自动处理
              // mp-html组件内部支持Markdown渲染
              
              return {
                ...item,
                content: content,
                towxmlContent: towxmlContent, // 添加towxml转换后的内容
                contentType: contentType, // 使用towxml组件渲染Markdown内容
                fullData: data // 更新完整数据
              }
            }
            return item
          })
          
          this.setData({
            learningList
          })
        } else {
          console.error('获取学习计划详情失败:', res.data.message)
        }
      },
      fail: (err) => {
        console.error('请求学习计划详情接口失败:', err)
      },
      complete: () => {
        // 更新加载状态
        this.setData({
          [`loadingContent[${recordId}]`]: false
        })
      }
    })
  },

  // 加载更多数据
  loadMore() {
    this.loadLearningList()
  },

  // 一键复制学习计划内容
  copyLearningContent(e) {
    const id = e.currentTarget.dataset.id
    const learningList = this.data.learningList
    const currentItem = learningList.find(item => item.id === id)
    
    if (currentItem) {
      // 从HTML中提取纯文本，保留原始格式
      // 移除HTML标签，只保留纯文本
      let textContent = currentItem.content.replace(/<[^>]+>/g, '')
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
  }
})