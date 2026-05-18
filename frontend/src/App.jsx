import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastManagerProvider } from './contexts/ToastManagerContext';
import Login from './components/Login';
import ChatPage from './pages/ChatPage';

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>Loading...</div>;
  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

const AppRoutes = () => {
  const { isAuthenticated } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ?<Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<ProtectedRoute><ChatPage canLeaveChat={false} /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <ToastManagerProvider>
        <AppRoutes />
      </ToastManagerProvider>
    </AuthProvider>
  );
}
