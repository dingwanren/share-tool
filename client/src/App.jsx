import { useState, useRef } from 'react'
import './styles/chat.css'
import './lib/supabase'
import { supabase } from './lib/supabase'
import MessageItem from './components/MessageItem'

function App() {
  const [roomName, setRoomName] = useState('')
	const [currentRoom, setCurrentRoom] = useState({
		id: null,   // 从后端收到的 roomId
    name: '',   // 用户输入的房间名
  })
	const [msgText, setMsgText] = useState('')
	const [selectedFiles, setSelectedFiles] = useState([])
	const [messages, setMessages] = useState([]) // 所有信息记录
	const [isUploading, setIsUploading] = useState(false)
	const socketRef = useRef(null)
	const inputFileRef = useRef(null);

	const MAX_FILE_COUNT = 3;
	const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB，单位为字节

	const loadRoomHistory = async (roomId) => {
		console.log(`开始拉取房间 ${roomId} 的历史消息...`);
		try {
			const { data: historyData, error } = await supabase
				.from('messages')
				.select('*')
				.eq('room_id', roomId)
				.order('created_at', { ascending: true })

				if (error) {
     		 throw new Error(`查询失败: ${error.message}`);
    		}

				console.log(`成功拉取 ${historyData.length} 条历史消息`, historyData);

				// 2. 将历史消息添加到前端的 messages 状态中
				// 注意：这里直接 setMessages，因为之前是空的
				setMessages(historyData);

				// （可选）3. 模拟“间隙缺陷”：在这里可以添加一个延迟，方便后续测试
				// setTimeout(() => { console.log('延迟结束，开始接收WebSocket消息'); }, 2000);
		} catch (error) {
 			console.error('加载历史消息失败:', error);
		}
	}

	const addNewMessage = (newMessage) => {
		 // 去重逻辑：如果消息已存在（根据id），则不添加
		setMessages(prevMessages => {
			// 检查是否已存在相同id的消息
			const isDuplicate = prevMessages.some(msg => msg.id === newMessage.id);
			if (isDuplicate) {
				console.log('检测到重复消息，跳过:', newMessage.id);
				return prevMessages; // 如果是重复的，返回原状态
			}
			console.log('添加新消息到列表:', newMessage);
			// 如果不是重复的，将新消息添加到列表末尾
			return [...prevMessages, newMessage];
		});
	}
	const joinRoom = () => {
		// 如果已有连接，先关闭
    if (socketRef.current) {
      socketRef.current.close();
    }
		const ws = new WebSocket(`ws://${window.location.host}/ws?roomName=${roomName}`)
		socketRef.current = ws

		ws.onopen = () => {
			console.log('已连接房间')
		}

		ws.onmessage = (event) => {
			console.log(event)
			const data = JSON.parse(event.data)

			if (data.type === 'system' && data.roomId) {
 				setCurrentRoom({
          name: roomName,
          id: data.roomId
        });

				// 收到roomId后，立即拉取该房间的历史消息
				loadRoomHistory(data.roomId)
				return;
			}

			addNewMessage(data);
		}
	}

	const validateFiles = (files) => {
		 // 1. 校验数量
		if (files.length > MAX_FILE_COUNT) {
			alert(`最多只能选择 ${MAX_FILE_COUNT} 个文件`);
			return false;
		}

		for (const file of files) {
			if (file.size > MAX_FILE_SIZE) {
				alert(`文件 "${file.name}" 超过 ${MAX_FILE_SIZE / 1024 / 1024}MB 限制`);
				return false;
			}
		}

		return true
	}

	const onFileChange = (e) => {
		const files = Array.from(e.target.files)

		console.log('filechange', files)

		if (validateFiles(files)) {
			setSelectedFiles(files);
		} else {
			// 校验失败，清空选择
    	e.target.value = ''; // 重要：清空 input 的值，允许重新选择
			setSelectedFiles([]);
		}

		// 清空 input 的 value，否则同文件无法再次触发 change
    if (inputFileRef.current) {
      inputFileRef.current.value = '';
    }
	}

  // 删除单个文件
  const removeFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

	const sendText = () => {
		const textToSend = msgText.trim()

		if (!textToSend) return;

		if (socketRef.current?.readyState === WebSocket.OPEN) {
			const textMessage = { type: 'text', content: textToSend }
			socketRef.current.send(JSON.stringify(textMessage))
			setMsgText(''); // 清空输入框
		}
	}

	const sendFiles = async () => {
		if (selectedFiles.length === 0) return;

		setIsUploading(true)
		const filesToUpload = [...selectedFiles]

		setSelectedFiles([])

		for (const file of filesToUpload) {
			try {
				const formData = new FormData()
				formData.append('file', file)

				const uploadResponse = await fetch('/api/upload', { method: 'POST', body: formData });
				const result = await uploadResponse.json();

				if (result.success && socketRef.current?.readyState === WebSocket.OPEN) {
					const fileMessage = { type: 'file', content: result.url, file_name: result.name, size: result.size }

					socketRef.current.send(JSON.stringify(fileMessage))
					console.log(`文件 ${file.name} 已发送`);
				} else {
					console.error(`文件 ${file.name} 上传失败:`, result.error);
					// 可以选择将失败的文件重新加入待上传列表，或提示用户
				}
			} catch (error) {
					console.error(`文件 ${file.name} 处理异常:`, error);
			}
		}

		setIsUploading(false); // 所有文件处理完毕
	}

	const send = () => {
		console.log(msgText, selectedFiles)
		sendText()
		sendFiles()
	}
  return (
    <div className="app-container">
      { !currentRoom.id ? (
				/* 状态1: 未连接时，显示连接表单 */
				<div className="join-screen">
					<input value={roomName} onChange={(e) => setRoomName(e.target.value)} />
        	<button onClick={joinRoom}>加入房间</button>
      	</div>
			) : (
				/* 状态2: 已连接时，显示房间主界面 */
				<div className='room-screen'>
					<div className='room-header'>
						{currentRoom.name}
					</div>
					<div className='message-list'>
						{ isUploading ? '上传中' : '' }
						{
							messages.map((msg) => (
								<MessageItem key={msg.id} message={msg} />
							))
						}
					</div>
					<div className='operation-area'>
						{/* 输入区域 - textarea和按钮作为一个整体 */}
						<div className="input-textarea-container">
							{/* 文件列表 - 在textarea上方 */}
							{selectedFiles.length > 0 && (
								<div className='selected-files-preview'>
									<ul>
										{selectedFiles.map((file, index) => (
											<li key={`${file.name}-${index}`}>
												<div className="file-info">
													<span className="file-name">📄 {file.name}</span>
													<span className="file-size">({(file.size / 1024).toFixed(1)} KB)</span>
												</div>
												<button onClick={() => removeFile(index)}>×</button>
											</li>
										))}
									</ul>
								</div>
							)}

							{/* 文本输入区域 */}
							<textarea
								value={msgText}
								onChange={(e) => setMsgText(e.target.value)}
								placeholder="输入消息..."
								rows="3"
							/>

							{/* 按钮行 - 在textarea下方，靠右排列 */}
							<div className="button-row">
								<button
									type="button"
									className="file-button"
									onClick={() => {inputFileRef.current.click()}}
								>
									文件
									<input style={{display: 'none'}} ref={inputFileRef} type="file" multiple onChange={onFileChange} />
								</button>
								<button
									type="button"
									disabled={ !msgText && !selectedFiles.length }
									onClick={send}
								>
									发送
								</button>
							</div>
						</div>
					</div>
				</div>
			)}
    </div>
  )
}

export default App
