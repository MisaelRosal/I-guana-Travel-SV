import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n/config.js'
import App from './App.jsx'
import './style.css'

createRoot(document.getElementById('app')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
