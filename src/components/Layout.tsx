import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import UpdateNotification from './UpdateNotification';

export function Layout() {
  const location = useLocation();

  return (
    <div className="app-container">
      <Sidebar />
      <div className="main-wrapper">
        <Header key={location.pathname} />
        <UpdateNotification />
        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
