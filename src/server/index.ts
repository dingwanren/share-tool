/**
 * Welcome to Cloudflare Workers! This is your first Durable Objects application.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your Durable Object in action
 * - Run `npm run deploy` to publish your application
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/durable-objects
 */

import { DurableObject } from 'cloudflare:workers';
// 导入 Supabase 客户端创建函数
import { createClient } from '@supabase/supabase-js';

// import { Room } from './durable-objects/Room';
// 拆分的话,为啥这里要定义 Env, worker-configuration.d.ts 不是有声明吗
// export interface Env {
//   ROOMS: DurableObjectNamespace<Room>;
// }

export class Room extends DurableObject<Env> {
	private clients: Set<WebSocket>;
	private roomId: string;
	private createdAt: number;
	private supabase: any; // 用于存储 Supabase 客户端实例

	/**
	 * The constructor is invoked once upon creation of the Durable Object, i.e. the first call to
	 * 	`DurableObjectStub::get` for a given identifier (no-op constructors can be omitted)
	 *
	 * @param ctx - The interface for interacting with Durable Object state
	 * @param env - The interface to reference bindings declared in wrangler.jsonc
	 */
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		// 获取此Durable Object实例的唯一ID并转换为字符串
		this.roomId = ctx.id.toString();

		this.clients = new Set();
		this.createdAt = Date.now();
		console.log('调试: SUPABASE_URL=', env.SUPABASE_URL); // 添加这行
		console.log('调试: SUPABASE_ANON_KEY 前几位=', env.SUPABASE_ANON_KEY?.substring(0, 10)); // 安全地打印密钥前几位
		// 初始化 Supabase 客户端
		// 注意：你需要提前将 SUPABASE_URL 和 SUPABASE_ANON_KEY 通过 wrangler secret put 命令设置好
		this.supabase = createClient(
			env.SUPABASE_URL, // 从环境变量读取
			env.SUPABASE_ANON_KEY // 从环境变量读取
		);
		console.log(`房间 ${this.roomId} 已创建或初始化`);
	}

	async fetch(request: Request): Promise<Response> {
		// 1. 检查请求是否为WebSocket升级请求
		const upgradeHeader = request.headers.get('Upgrade');

		if (upgradeHeader === 'websocket') {
			// 2. 接受WebSocket连接
			const webSocketPair = new WebSocketPair();
			const [client, server] = Object.values(webSocketPair);

			// 3. 处理这个新连接（保存、设置监听器）
			await this.handleWebSocketSession(server);

			// 4. 返回101响应，完成握手，将client端返回给前端
			return new Response(null, {
				status: 101,
				webSocket: client, // 这个client就是前端的WebSocket对象
			});
		}

		// 如果不是WebSocket请求，可以返回404或房间信息
		return new Response('请使用WebSocket协议连接', { status: 400 });
	}

	async handleWebSocketSession(webSocket: WebSocket) {
		webSocket.accept(); // 1. 接受连接
		this.clients.add(webSocket); // 2. 保存到客户端列表

		// 发送一个欢迎消息
		webSocket.send(
			JSON.stringify({
				type: 'system',
				roomId: this.roomId, // 前端将用这个ID查询历史
				message: `已成功加入房间 ${this.roomId}`,
			})
		);

		// 3. 监听消息（后续用于广播文本/文件URL）
		webSocket.addEventListener('message', async (event) => {
			console.log(`房间 ${this.roomId} 收到消息:`, event.data);
			// 这里暂时只打印，后续会实现广播

			// 解析消息（假设是JSON）
			let message;
			try {
				message = JSON.parse(event.data);
			} catch {
				// 如果不是JSON，按纯文本处理
				message = { type: 'text', content: event.data };
			}

			const dbInsertData = {
				room_id: this.roomId, // 使用 Durable Object 实例ID作为房间标识
				type: message.type, // 'text' 或 'file'
				content: message.content, // 文本内容或文件URL
				file_name: message.file_name || null, // 文件名，是文本就没有, 如果没有则为 null
				size: message.size || null
			};

			// 插入数据库
			const { data: insertedData, error } = await this.supabase
				.from('messages')
				.insert(dbInsertData)
				.select() // 关键：使用 .select() 获取插入后的完整数据
				.single(); // 获取单条记录

			if (error) {
				console.error('插入消息到数据库失败:', error.message);
				return; // 插入失败，不再广播
			}

			console.log('消息已持久化到数据库，ID:', insertedData.id);
			// 广播给房间内所有其他客户端
			this.broadcast(insertedData, webSocket);
		});

		webSocket.addEventListener('close', (event) => {
			this.clients.delete(webSocket);
			console.log(`一个连接关闭，房间 ${this.roomId} 剩余连接: ${this.clients.size}`);
		});
	}
	// 广播方法
	private async broadcast(message: any, sender: WebSocket) {
		const messageStr = typeof message === 'string' ? message : JSON.stringify(message);

		this.clients.forEach((client) => {
			if (
				// client !== sender && // 不发送给消息来源者（除非需要回显）
				client.readyState === WebSocket.READY_STATE_OPEN
			) {
				client.send(messageStr);
			}
		});

		console.log(`已广播消息给 ${this.clients.size} 个客户端`);
	}

	/**
	 * The Durable Object exposes an RPC method sayHello which will be invoked when a Durable
	 *  Object instance receives a request from a Worker via the same method invocation on the stub
	 *
	 * @param name - The name provided to a Durable Object instance from a Worker
	 * @returns The greeting to be sent back to the Worker
	 */
	async sayHello(name: string): Promise<string> {
		return `Heaaallio, ${name}!`;
	}
}

export default {
	/**
	 * This is the standard fetch handler for a Cloudflare Worker
	 *
	 * @param request - The request submitted to the Worker from the client
	 * @param env - The interface to reference bindings declared in wrangler.jsonc
	 * @param ctx - The execution context of the Worker
	 * @returns The response to be sent back to the client
	 */
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);

		// 文件上传路由
		if (url.pathname === '/api/upload' && request.method === 'POST') {
			try {
				// 1. 从请求中解析 FormData
				const formData = await request.formData();
				// 2. 获取文件字段（前端字段名需一致，例如 'file'）
				const file = formData.get('file') as File;

				if (!file) {
					return new Response(JSON.stringify({ error: '未提供文件' }), {
						status: 400,
						headers: { 'Content-Type': 'application/json' },
					});
				}
				// 3. 初始化 Supabase 客户端（使用 env 中的密钥）
				const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
				// 4. 生成唯一文件名，避免冲突
				const timestamp = Date.now();
				const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
				const uniqueFileName = `public/${timestamp}_${safeFileName}`;

				// 5. 上传到 Supabase Storage 的 'shared-files' 桶
				const { data: uploadData, error: uploadError } = await supabase.storage.from('shared-files').upload(uniqueFileName, file, {
					contentType: file.type,
					cacheControl: '3600', // 缓存控制可选
				});

				if (uploadError) {
					throw new Error(`存储上传失败: ${uploadError.message}`);
				}

				// 6. 获取文件的公开访问 URL
				const {
					data: { publicUrl },
				} = supabase.storage.from('shared-files').getPublicUrl(uploadData.path);

				// 7. 返回成功响应（包含前端广播所需的所有信息）
				return new Response(
					JSON.stringify({
						success: true,
						url: publicUrl,
						name: file.name,
						size: file.size,
						type: file.type,
					}),
					{
						headers: { 'Content-Type': 'application/json' },
					}
				);
			} catch (error) {
				let errorMessage = '上传处理失败';
				// 1. 检查 error 是否为 Error 对象
				if (error instanceof Error) {
					errorMessage = error.message;
				}
				// 2. 检查 error 是否为普通对象且有 message 属性
				else if (error && typeof error === 'object' && 'message' in error) {
					errorMessage = String((error as any).message);
				}
				// 3. 如果是其他类型（如字符串），直接转换
				else if (typeof error === 'string') {
					errorMessage = error;
				}

				return new Response(
					JSON.stringify({
						error: '上传处理失败',
						details: errorMessage, // error.message 会提示错误 'error' is of type 'unknown', 上面那一串是为了解决它,ai教的
					}),
					{
						status: 500,
						headers: { 'Content-Type': 'application/json' },
					}
				);
			}
		}

		const roomName = url.searchParams.get('roomName');

		if (roomName) {
			// 根据房间名生成确定性ID
			const roomObj = env.ROOMS.getByName(roomName);
			// 获取该ID对应的Durable Object实例的“桩”(stub)
			// 将整个请求（包括WebSocket升级头）转发给房间实例处理
			return roomObj.fetch(request);
		}

		// 3. 如果没有房间名，可以返回一个简单提示或前端页面
		return new Response('请提供房间名 (例如 ?roomName=你的房间码)', { status: 400 });
	},
} satisfies ExportedHandler<Env>;
