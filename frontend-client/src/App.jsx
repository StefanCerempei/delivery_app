import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import BookingPage from './pages/BookingPage';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import AdminOrderDetail from './pages/AdminOrderDetail';
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