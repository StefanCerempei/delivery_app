import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import BookingPage from './pages/BookingPage';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import AdminOrderDetail from './pages/AdminOrderDetail';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';
import { BookingProvider } from './context/BookingContext';
import './App.css';

function App() {
    return (
        <Router>
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
        </Router>
    );
}

export default App;