import { createBrowserRouter, RouterProvider } from 'react-router';
import { NotesPage } from './pages/NotesPage';

const router = createBrowserRouter([{ path: '*', element: <NotesPage /> }]);

export default function App() {
  return <RouterProvider router={router} />;
}
