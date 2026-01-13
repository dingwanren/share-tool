import { useState, useRef, useEffect } from 'react'
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
	useEffect(() => {
		const urlParams = new URLSearchParams(window.location.search);
		const roomParam = urlParams.get('room');
		console.log(roomParam)
		if (roomParam) {
			setRoomName(roomParam);
			joinRoom(roomParam); // 紧跟setRoomName 后去读取 roomName 会因为异步读不到值
		}
	}, []);
	const [msgText, setMsgText] = useState('')
	const [selectedFiles, setSelectedFiles] = useState([])
	const [messages, setMessages] = useState([]) // 所有信息记录
	const [isUploading, setIsUploading] = useState(false)
	const socketRef = useRef(null)
	const inputFileRef = useRef(null);
	const [isJoining, setIsJoining] = useState(false);

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
	const joinRoom = (roomToJoin) => {
		setIsJoining(true);
		console.log(`roomToJoin: ${roomToJoin}`, `roomName: ${roomName}`)

		// 如果已有连接，先关闭
    if (socketRef.current) {
      socketRef.current.close();
    }
		 // 1. 动态获取当前页面的协议（http: 或 https:）
		const protocol = window.location.protocol; // 返回 "http:" 或 "https:"

		// 2. 根据协议决定使用 ws:// 还是 wss://
		//    规则：http -> ws, https -> wss
		const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';

		// 3. 构造正确的 WebSocket URL
		const wsUrl = `${wsProtocol}//${window.location.host}/ws?roomName=${encodeURIComponent(roomToJoin)}`;
		const ws = new WebSocket(wsUrl)
		socketRef.current = ws

		ws.onopen = () => {
			console.log('已连接房间')
		}

		ws.onmessage = (event) => {
			console.log(event)
			const data = JSON.parse(event.data)

			if (data.type === 'system' && data.roomId) {
 				setCurrentRoom({
          name: roomToJoin,
          id: data.roomId
        });
				setIsJoining(false);

 				// 更新URL参数
				const urlParams = new URLSearchParams(window.location.search);
				urlParams.set('room', roomToJoin);
				window.history.replaceState({}, '', `${window.location.pathname}?${urlParams.toString()}`);

				// 收到roomId后，立即拉取该房间的历史消息
				loadRoomHistory(data.roomId)
				return;
			}

			addNewMessage(data);
		}
	}

	const handleJoinClick = () => {
		if (isJoining) return;

		joinRoom(roomName)
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
					<input value={roomName} onChange={(e) => setRoomName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleJoinClick()} />
        	<button onClick={handleJoinClick} disabled={isJoining}>
						{isJoining ? '连接中...' : '加入房间'}
					</button>
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
									{/* 文件 */}
									<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" strokeWidth="0"></g><g id="SVGRepo_tracerCarrier" strokeLinecap="round" strokeLinejoin="round"></g><g id="SVGRepo_iconCarrier"> <path fillRule="evenodd" clipRule="evenodd" d="M15.7598 1.00009C16.4369 0.995994 17.1077 1.12795 17.7334 1.388C18.359 1.64804 18.9266 2.03082 19.4037 2.51356C19.8807 2.99627 20.2576 3.56933 20.5133 4.19921C20.7689 4.82907 20.8984 5.50361 20.8943 6.18382C20.8903 6.86404 20.7529 7.53696 20.4898 8.16367C20.2275 8.78856 19.8452 9.35548 19.3644 9.83144L11.3058 17.9752L11.3004 17.9805C10.7202 18.5495 9.99625 18.9706 9.15388 18.9874C8.29904 19.0044 7.53661 18.6013 6.89877 17.9616C6.14878 17.2094 5.94279 16.3064 6.05131 15.4997C6.15401 14.7363 6.53228 14.0692 6.94729 13.6357L6.95275 13.63L13.1011 7.40812C13.4893 7.01528 14.1224 7.01152 14.5153 7.39971C14.9081 7.78791 14.9119 8.42106 14.5237 8.8139L8.38743 15.0236C8.2318 15.1883 8.07295 15.4728 8.03346 15.7663C7.99942 16.0194 8.04811 16.2817 8.31503 16.5494C8.69411 16.9296 8.96044 16.9908 9.11409 16.9878C9.27944 16.9845 9.54207 16.9019 9.89517 16.5574L17.9547 8.41268C18.2491 8.1219 18.4842 7.77426 18.6457 7.38949C18.8073 7.00469 18.8919 6.59084 18.8944 6.172C18.8968 5.75316 18.8171 5.33823 18.6601 4.95138C18.5031 4.56454 18.2721 4.21386 17.9811 3.91934C17.69 3.62485 17.3448 3.39238 16.9658 3.23482C16.5867 3.07727 16.181 2.99758 15.7719 3.00006C15.3629 3.00253 14.9582 3.08713 14.5811 3.24926C14.204 3.41139 13.8616 3.64802 13.5742 3.946L13.5658 3.95473L5.45484 12.1626L5.44968 12.1677C4.99589 12.6138 4.63362 13.1474 4.38454 13.7379C4.13544 14.3283 4.00466 14.9635 4.00012 15.6062C3.99558 16.249 4.11737 16.8861 4.35813 17.4803C4.58381 18.0372 5.12588 18.786 5.60643 19.2723C6.10021 19.772 6.94793 20.4178 7.48314 20.6399C8.06705 20.8822 8.69228 21.0044 9.32258 20.9999C9.95289 20.9953 10.5763 20.864 11.1566 20.6133C11.737 20.3626 12.2631 19.9972 12.704 19.5379L12.709 19.5327L20.2887 11.8623C20.6769 11.4695 21.31 11.4657 21.7029 11.8539C22.0957 12.2421 22.0995 12.8753 21.7113 13.2681L14.1416 20.9284C13.5182 21.5763 12.7734 22.0935 11.9498 22.4493C11.124 22.8061 10.2358 22.9933 9.33706 22.9998C8.43832 23.0063 7.54753 22.832 6.7166 22.4872C5.83696 22.1221 4.77137 21.2726 4.18383 20.678C3.58306 20.0701 2.85902 19.1062 2.50453 18.2313C2.16513 17.3937 1.99378 16.4967 2.00017 15.5921C2.00656 14.6876 2.19057 13.793 2.54181 12.9605C2.89207 12.1302 3.40184 11.3777 4.0422 10.7468L12.1391 2.55297C12.6093 2.06665 13.1707 1.67862 13.7912 1.41187C14.4136 1.14426 15.0828 1.00419 15.7598 1.00009Z" fill="#000000"></path> </g></svg>
									<input style={{display: 'none'}} ref={inputFileRef} type="file" multiple onChange={onFileChange} />
								</button>
								<button
									type="button"
									className="send-button"
									disabled={ !msgText && !selectedFiles.length }
									onClick={send}
								>
									{/* 发送 */}
									<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor"><g id="SVGRepo_bgCarrier" strokeWidth="0"></g><g id="SVGRepo_tracerCarrier" strokeLinecap="round" strokeLinejoin="round"></g><g id="SVGRepo_iconCarrier"> <g id="Arrow / Arrow_Up_MD"> <path id="Vector" d="M12 19V5M12 5L6 11M12 5L18 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path> </g> </g></svg>
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
