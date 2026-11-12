import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import BookingPage from './pages/BookingPage';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import AdminOrderDetail from './pages/AdminOrderDetail';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';
import { BookingProvider } from './context/BookingContext';
import { AuthProvider } from './context/AuthContext';
import AuthPage from './pages/AuthPage';
import AccountPage from './pages/AccountPage';
import AccountSettingsPage from './pages/AccountSettingsPage';
import { ForgotPasswordPage, ResetPasswordPage } from './pages/PasswordResetPages';
import './App.css';

function App() {
    return (
        <Router>
            <AuthProvider>
            <Routes>
                {/* Fluxul Clientului */}
                <Route
                    path="/"
                    element={
                        <BookingProvider>
                            <BookingPage />
                        </BookingProvider>
                    }
                />

                {/* Contul clientului */}
                <Route path="/login" element={<AuthPage mode="login" />} />
                <Route path="/signup" element={<AuthPage mode="signup" />} />
                <Route path="/account" element={<AccountPage />} />
                <Route path="/account/settings" element={<AccountSettingsPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />

                {/* Pagini legale */}
                <Route path="/privacy" element={<PrivacyPolicy />} />
                <Route path="/terms" element={<TermsOfService />} />

                {/* Zona de Administrare */}
                <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
                <Route path="/admin/login" element={<AdminLogin />} />
                <Route path="/admin/dashboard" element={<AdminDashboard />} />
                <Route path="/admin/order/:id" element={<AdminOrderDetail />} />

                {/* Orice altă rută nevalidă redirecționează la pagina principală */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </AuthProvider>
        </Router>
    );
}

export default App;