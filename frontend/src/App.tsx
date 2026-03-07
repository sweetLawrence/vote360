import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import CandidatePage from './pages/CandidatePage';

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/candidate/:id" element={<CandidatePage />} />
          </Routes>
        </main>
        <footer className="bg-brand-navy text-gray-400 text-center text-sm py-6 mt-16">
          <p>VoteTrace360 · Kenya Campaign Transparency · Data is anonymised and community-sourced.</p>
          <p className="mt-1 text-gray-600">Reports do not constitute legal findings.</p>
        </footer>
      </div>
    </BrowserRouter>
  );
}
