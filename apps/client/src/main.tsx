import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/index.css'
import { initializeTelemetry } from './telemetry'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthProvider.tsx'
import { TestAuthProvider } from './auth/TestAuthProvider.tsx'
import { AppErrorBoundary } from './ui/AppErrorBoundary.tsx'

// Initialize telemetry early but non-blocking; it will fail gracefully if not configured
void initializeTelemetry()

const AuthenticationProvider = import.meta.env.VITE_E2E_TEST_MODE === 'true'
  ? TestAuthProvider
  : AuthProvider

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <AuthenticationProvider>
        <App />
      </AuthenticationProvider>
    </AppErrorBoundary>
  </StrictMode>,
)
