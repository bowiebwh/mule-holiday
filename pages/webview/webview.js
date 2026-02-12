// pages/webview/webview.js
Page({
  data: {
    url: ''
  },

  onLoad: function (options) {
    // 获取传递的url参数
    if (options.url) {
      this.setData({
        url: decodeURIComponent(options.url)
      })
    }
  },

  handleMessage: function (e) {
    // 处理来自web-view的消息
    console.log('web-view message:', e.detail)
  },

  handleLoad: function (e) {
    // 页面加载完成
    console.log('web-view loaded:', e.detail)
  },

  handleError: function (e) {
    // 页面加载失败
    console.error('web-view error:', e.detail)
    wx.showToast({
      title: '页面加载失败',
      icon: 'none'
    })
  }
})
