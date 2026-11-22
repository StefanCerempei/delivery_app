import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import BookingPage from './pages/BookingPage';
import { BookingProvider } from './context/BookingContext';
import { AuthProvider } from './context/AuthContext';
import GlobalLoadingBar from './components/GlobalLoadingBar';
import { PageLoader } from './components/Spinner';

// Restul paginilor se descarcă doar când sunt deschise: prima pagină (rezervarea) încarcă mai puțin cod
const AdminLogin = lazy(() => import('./pages/AdminLogin'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AdminOrderDetail = lazy(() => import('./pages/AdminOrderDetail'));
const DriverJobPage = lazy(() => import('./pages/DriverJobPage'));
const DriverPortal = lazy(() => import('./pages/DriverPortal'));
const AboutPage = lazy(() => import('./pages/CompanyPages').then((m) => ({ default: m.AboutPage })));
const ContactPage = lazy(() => import('./pages/CompanyPages').then((m) => ({ default: m.ContactPage })));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const TermsOfService = lazy(() => import('./pages/TermsOfService'));
const AuthPage = lazy(() => import('./pages/AuthPage'));
const AccountPage = lazy(() => import('./pages/AccountPage'));
const AccountSettingsPage = lazy(() => import('./pages/AccountSettingsPage'));
const ForgotPasswordPage = lazy(() => import('./pages/PasswordResetPages').then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import('./pages/PasswordResetPages').then((m) => ({ default: m.ResetPasswordPage })));
import './App.css';

function App() {
    return (
        <Router>
            <AuthProvider>
            <GlobalLoadingBar />
            <Suspense fallback={<PageLoader />}>
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
                <Route path="/about" element={<AboutPage />} />
                <Route path="/contact" element={<ContactPage />} />

                {/* Zona de Administrare */}
                <Route path="/job/:token" element={<DriverJobPage />} />
                <Route path="/driver" element={<DriverPortal />} />
                <Route path="/driver/login" element={<DriverPortal />} />
                {/* aceeași pagină de job, dar în interiorul aplicației instalabile (scope /driver) */}
                <Route path="/driver/job/:token" element={<DriverJobPage />} />
                <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
                <Route path="/admin/login" element={<AdminLogin />} />
                <Route path="/admin/dashboard" element={<AdminDashboard />} />
                <Route path="/admin/order/:id" element={<AdminOrderDetail />} />

                {/* Orice altă rută nevalidă redirecționează la pagina principală */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </Suspense>
            </AuthProvider>
        </Router>
    );
}

export default App;