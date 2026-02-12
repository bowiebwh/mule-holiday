// components/disclaimer/disclaimer.js
Component({
  /**
   * 组件的属性列表
   */
  properties: {
    visible: {
      type: Boolean,
      value: false
    }
  },

  /**
   * 组件的初始数据
   */
  data: {

  },

  /**
   * 组件的方法列表
   */
  methods: {
    // 点击确认按钮
    onConfirm() {
      // 触发确认事件
      this.triggerEvent('confirm', {});
    },

    // 点击关闭按钮
    onClose() {
      // 触发关闭事件
      this.triggerEvent('close', {});
    },

    // 点击遮罩层
    onOverlayTap() {
      // 不做任何操作，确保只有点击"我已了解"按钮才能关闭弹窗
    }
  }
})