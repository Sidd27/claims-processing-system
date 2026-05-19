import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ClaimsList } from './pages/ClaimsList';
import { ClaimDetail } from './pages/ClaimDetail';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ClaimsList />} />
        <Route path="/claims/:id" element={<ClaimDetail />} />
      </Routes>
    </BrowserRouter>
  );
}
