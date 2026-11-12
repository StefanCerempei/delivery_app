import React from 'react'
import ReactDOM from 'react-dom/client'
// Fonturi găzduite pe serverul nostru (nu de pe Google): niciun IP de vizitator nu ajunge la Google
import '@fontsource-variable/bricolage-grotesque/opsz.css'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import App from './App.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)