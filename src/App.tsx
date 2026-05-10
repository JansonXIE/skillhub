import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { MySkills } from './pages/MySkills';
import { Favorites } from './pages/Favorites';
import { Distributed } from './pages/Distributed';
import { Pending } from './pages/Pending';
import { Store } from './pages/Store';
import { Settings } from './pages/Settings';
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<MySkills />} />
          <Route path="favorites" element={<Favorites />} />
          <Route path="distributed" element={<Distributed />} />
          <Route path="pending" element={<Pending />} />
          <Route path="store" element={<Store />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
