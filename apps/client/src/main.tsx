import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/index.css'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthProvider.tsx'
import { TestAuthProvider } from './auth/TestAuthProvider.tsx'

const AuthenticationProvider = import.meta.env.VITE_E2E_TEST_MODE === 'true'
  ? TestAuthProvider
  : AuthProvider

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthenticationProvider>
      <App />
    </AuthenticationProvider>
  </StrictMode>,
)
