import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    server: {
        // În dezvoltare, cererile /api merg la serverul Express (npm run dev:api, portul 3000)
        proxy: {
            '/api': 'http://localhost:3000'
        }
    }
})
