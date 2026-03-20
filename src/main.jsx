import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import WelcomeGate from './components/WelcomeGate.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <WelcomeGate>
      <App />
    </WelcomeGate>
  </React.StrictMode>,
)
