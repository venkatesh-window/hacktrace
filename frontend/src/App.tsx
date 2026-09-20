import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { TraceProvider } from './contexts/TraceContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { Dashboard } from './pages/Dashboard';
import { TraceLive } from './pages/TraceLive';
import { ATMIntelligence } from './pages/ATMIntelligence';

function App() {
  return (
    <LanguageProvider>
      <TraceProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<DashboardLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="trace" element={<TraceLive />} />
              <Route path="atm" element={<ATMIntelligence />} />
              <Route path="alerts" element={<div className="page-container"><h2>Alerts Center</h2><p>Select an ATM to generate alerts.</p></div>} />
            </Route>
          </Routes>
        </BrowserRouter>
      </TraceProvider>
    </LanguageProvider>
  );
}

export default App;
