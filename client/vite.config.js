import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
	server: {
    proxy: {
      // 将以 /api 开头的请求代理到你的 Worker 开发服务器
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
      // 将以 /ws 开头的 WebSocket 连接也进行代理
      '/ws': {
        target: 'ws://localhost:8787',
        ws: true,
      }
    }
  }
})
