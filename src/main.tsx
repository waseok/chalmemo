import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// StrictMode는 개발 중 effect가 2번 돌아 캡처가 중복 삽입될 수 있어 제외합니다.
createRoot(document.getElementById('root')!).render(<App />)
