import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { MySkills } from './pages/MySkills';
import { Favorites } from './pages/Favorites';
import { Distributed } from './pages/Distributed';
import { Pending } from './pages/Pending';
import { Store } from './pages/Store';
import { StoreSkillDetail } from './pages/StoreSkillDetail';
import { Resources } from './pages/Resources';
import { Settings } from './pages/Settings';
import { SkillDetail } from './pages/SkillDetail';
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
          <Route path="store/:owner/:repo" element={<Store />} />
          <Route path="store/:owner/:repo/:skillName" element={<StoreSkillDetail />} />
          <Route path="resources" element={<Resources />} />
          <Route path="settings" element={<Settings />} />
          <Route path="skill/:skillName" element={<SkillDetail />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
