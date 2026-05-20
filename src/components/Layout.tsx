import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import UpdateNotification from './UpdateNotification';

export function Layout() {
  return (
    <div className="app-container">
      <Sidebar />
      <div className="main-wrapper">
        <Header />
        <UpdateNotification />
        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
