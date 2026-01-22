// 全面的Markdown转HTML工具函数
// 支持完整的Markdown语法，生成适合mp-html组件渲染的HTML
const markdownToHtml = (mdText) => {
  if (!mdText) return '';
  
  let html = mdText;
  
  // 1. 处理标题（# 到 ######）
  // 优先处理行中的标题，如 #标题#
  for (let i = 6; i >= 1; i--) {
    const inlineRegex = new RegExp(`#{${i}}([^#]+)#{${i}}`, 'g');
    html = html.replace(inlineRegex, `<h${i}>$1</h${i}>`);
  }
  
  // 然后处理行首的标题，如 # 一级标题
  for (let i = 6; i >= 1; i--) {
    const regex = new RegExp(`^(#{${i}})\s*(.*)$`, 'gm');
    html = html.replace(regex, `<h${i}>$2</h${i}>`);
  }
  
  // 2. 处理粗体文本（**text** 和 __text__）
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
  
  // 3. 处理斜体文本（*text* 和 _text_）
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.*?)_/g, '<em>$1</em>');
  
  // 4. 处理删除线（~~text~~）
  html = html.replace(/\~\~(.*?)\~\~/g, '<del>$1</del>');
  
  // 5. 处理分隔线（---, ***, ***）
  html = html.replace(/^(?:---|\*\*\*|___)\s*$/gm, '<hr>');
  
  // 6. 处理无序列表（- 或 * 或 + 开头）
  html = html.replace(/^(?:-|\*|\+)\s+(.*)$/gm, '<li>$1</li>');
  // 将连续的li标签包裹成ul
  html = html.replace(/(<li>.*?<\/li>)+/gs, '<ul>$&</ul>');
  
  // 7. 处理有序列表（数字. 开头）
  html = html.replace(/^(\d+)\.\s+(.*)$/gm, '<li>$2</li>');
  // 将连续的li标签包裹成ol
  html = html.replace(/(<li>.*?<\/li>)+/gs, '<ol>$&</ol>');
  
  // 8. 处理引用（> quote）
  html = html.replace(/^(>+)\s+(.*)$/gm, '<blockquote>$2</blockquote>');
  
  // 9. 处理链接（[text](url)）
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');
  
  // 10. 处理图片（![alt](url)）
  html = html.replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1">');
  
  // 11. 处理代码块（```code```）
  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  
  // 12. 处理行内代码（`code`）
  html = html.replace(/`(.*?)`/g, '<code>$1</code>');
  
  // 13. 处理换行符，转换为HTML换行
  html = html.replace(/\n/g, '<br>');
  
  // 14. 处理段落（将连续换行转换为段落）
  html = html.replace(/(<br>){2,}/g, '</p><p>');
  
  // 15. 为整个内容添加合适的样式类
  html = `<div class="markdown-content"><p>${html}</p></div>`;
  
  // 16. 清理多余的标签
  html = html.replace(/<\/p><p>\s*<\/ul><\/p>/g, '</ul>');
  html = html.replace(/<\/p><p>\s*<\/ol><\/p>/g, '</ol>');
  html = html.replace(/<\/p><p>\s*<\/blockquote><\/p>/g, '</blockquote>');
  html = html.replace(/<\/p><p>\s*<\/pre><\/p>/g, '</pre>');
  html = html.replace(/<\/p><p>\s*<\/hr><\/p>/g, '</hr>');
  
  return html;
};

module.exports = markdownToHtml;