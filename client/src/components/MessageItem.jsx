// 可以直接写在 App.jsx 内，作为一个内部组件
const MessageItem = ({ message} ) => {
  // 根据消息类型渲染不同内容
  switch (message.type) {
    case 'text':
      return (
        <div className="message text-message">
          <div className="content">{message.content}</div>
          <div className="meta">
            <span className="time">{new Date(message.created_at).toLocaleTimeString()}</span>
          </div>
        </div>
      );

    case 'file':
      return (
        <div className="message file-message">
          <div className="file-info">
            <span className="file-name">📎 {message.file_name || '文件'}</span>
            <span className="file-size">({Math.round(message.size / 1024)}KB)</span>
          </div>
          <a
            href={message.content}
            target="_blank"
            rel="noopener noreferrer"
            className="file-link"
          >
            下载/查看
          </a>
          <div className="meta">
            <span className="time">{new Date(message.created_at).toLocaleTimeString()}</span>
          </div>
        </div>
      );

    case 'system':
      return (
        <div className="message system-message">
          <div className="content">🛈 {message.message}</div>
        </div>
      );

    default:
      return null;
  }
};

export default MessageItem
