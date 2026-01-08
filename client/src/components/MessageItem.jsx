import { useState } from 'react';

const MessageItem = ({ message }) => {
  // 根据消息类型渲染不同内容
  switch (message.type) {
    case 'text':
      return (
        <div className="message text-message">
          <div className="content">{message.content}</div>
          <div className="message-actions">
            <button
              className="copy-icon"
              onClick={() => navigator.clipboard.writeText(message.content)}
              title="Copy text"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <g id="SVGRepo_bgCarrier" stroke-width="0"></g>
                <g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g>
                <g id="SVGRepo_iconCarrier">
                  <path fill-rule="evenodd" clip-rule="evenodd" d="M21 8C21 6.34315 19.6569 5 18 5H10C8.34315 5 7 6.34315 7 8V20C7 21.6569 8.34315 23 10 23H18C19.6569 23 21 21.6569 21 20V8ZM19 8C19 7.44772 18.5523 7 18 7H10C9.44772 7 9 7.44772 9 8V20C9 20.5523 9.44772 21 10 21H18C18.5523 21 19 20.5523 19 20V8Z" fill="#0F0F0F"></path>
                  <path d="M6 3H16C16.5523 3 17 2.55228 17 2C17 1.44772 16.5523 1 16 1H6C4.34315 1 3 2.34315 3 4V18C3 18.5523 3.44772 19 4 19C4.55228 19 5 18.5523 5 18V4C5 3.44772 5.44772 3 6 3Z" fill="#0F0F0F"></path>
                </g>
              </svg>
            </button>
            <span className="time">{new Date(message.created_at).toLocaleTimeString()}</span>
          </div>
        </div>
      );

    case 'file':
      return (
        <div className="message file-message">
          <div className="file-info">
            <span className="file-name">{message.file_name || '文件'}</span>
            <span className="file-size">({Math.round(message.size / 1024)}KB)</span>
          </div>
          <div className="file-actions">
            <a
              href={message.content}
              rel="noopener noreferrer"
							target="_blank"
              download
              className="file-link"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <g id="SVGRepo_bgCarrier" stroke-width="0"></g>
                <g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g>
                <g id="SVGRepo_iconCarrier">
                  <path d="M21 15V16.2C21 17.8802 21 18.7202 20.673 19.362C20.3854 19.9265 19.9265 20.3854 19.362 20.673C18.7202 21 17.8802 21 16.2 21H7.8C6.11984 21 5.27976 21 4.63803 20.673C4.07354 20.3854 3.6146 19.9265 3.32698 19.362C3 18.7202 3 17.8802 3 16.2V15M17 10L12 15M12 15L7 10M12 15V3" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
                </g>
              </svg>
            </a>
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
