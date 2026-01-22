const towxml = require('./index');

Component({
  options:{
    styleIsolation:'shared'
  },
  properties:{
    nodes:{
      type:Object,
      value:{}
    },
    markdown:{
      type:String,
      value:'',
      observer(newVal) {
        if (newVal) {
          let nodes = towxml(newVal, 'markdown');
          // 确保nodes是对象类型
          if (typeof nodes !== 'object' || nodes === null) {
            nodes = {};
          }
          this.setData({ nodes });
        } else {
          // 如果markdown为空，清空nodes
          this.setData({ nodes: {} });
        }
      }
    }
  },
  data:{
    someData:{
      
    }
  }
})