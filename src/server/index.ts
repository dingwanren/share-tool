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

// import { Room } from './durable-objects/Room';
// 拆分的话,为啥这里要定义 Env, worker-configuration.d.ts 不是有声明吗
// export interface Env {
//   ROOMS: DurableObjectNamespace<Room>;
// }

import { DurableObject } from "cloudflare:workers";

export class Room extends DurableObject<Env> {
	private clients: Set<WebSocket>
 	private roomId: string;
	private createdAt: number;

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

		this.clients = new Set()
		this.createdAt = Date.now()
		console.log(`房间 ${this.roomId} 已创建或初始化`);
	}

	async fetch(request: Request) : Promise<Response> {
		// 1. 检查请求是否为WebSocket升级请求
		const upgradeHeader = request.headers.get('Upgrade')

		if (upgradeHeader === 'websocket') {
 			// 2. 接受WebSocket连接
			const webSocketPair = new WebSocketPair()
			const [client, server] = Object.values(webSocketPair)

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

	async handleWebSocketSession (webSocket: WebSocket) {
		webSocket.accept() // 1. 接受连接
		this.clients.add(webSocket) // 2. 保存到客户端列表

		// 3. 监听消息（后续用于广播文本/文件URL）
		webSocket.addEventListener("message", (event) => {
 			console.log(`房间 ${this.roomId} 收到消息:`, event.data);
      // 这里暂时只打印，后续会实现广播
		})

		webSocket.addEventListener('close', (event) => {
			this.clients.delete(webSocket)
			console.log(`一个连接关闭，房间 ${this.roomId} 剩余连接: ${this.clients.size}`);
		})

		// 5. 可选：发送一个欢迎消息
    webSocket.send(JSON.stringify({
      type: 'system',
      message: `已成功加入房间 ${this.roomId}`
    }));
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
		const url = new URL(request.url)
		const roomName = url.searchParams.get("roomName")

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
