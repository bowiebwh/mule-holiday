const config = require('./config');

Component({
	options: {
		styleIsolation: 'apply-shared'
	},
	properties: {
		nodes: {
			type: Object,
			value: {}
		}
	},
	lifetimes: {
		attached: function () {
			const _ts = this;

			config.events.forEach(item => {
				_ts['_' + item] = function (...arg) {
					if (global._events && typeof global._events[item] === 'function') {
						global._events[item](...arg);
					}
				};
			});
		}
	},
	methods: {
		// 处理链接点击事件
		_handleLinkClick(e) {
			const url = e.currentTarget.dataset.url;
			if (url) {
				// 使用navigateTo打开webview页面
				wx.navigateTo({
					url: `/pages/webview/webview?url=${encodeURIComponent(url)}`,
					fail: (err) => {
						console.error('打开链接失败:', err);
						// 如果navigateTo失败，将链接复制到剪贴板
						wx.setClipboardData({
							data: url,
							success: () => {
								wx.showToast({
									title: '链接已复制，请在浏览器中打开',
									icon: 'success',
									duration: 2000
								});
							},
							fail: (clipboardErr) => {
								console.error('复制链接失败:', clipboardErr);
								wx.showToast({
									title: '打开链接失败，请手动复制链接',
									icon: 'none'
								});
							}
						});
					}
				});
			}
		}
	}
})