import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import BookingPage from './pages/BookingPage';
import { BookingProvider } from './context/BookingContext';
import './App.css';

function App() {
    return (
        <Router>
            <Routes>
                <Route
                    path="/"
                    element={
                        <BookingProvider>
                            <BookingPage />
                        </BookingProvider>
                    }
                />
                {/* Orice altă rută ne trimite momentan la pagina principală */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </Router>
    );
}

export default App;