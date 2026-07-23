import { createBrowserRouter } from 'react-router-dom';
import App from './App';
import Home from './ui/Home';
import QuickAdd from './ui/QuickAdd';
import AccountsList from './ui/AccountsList';
import AccountDetail from './ui/AccountDetail';
import MonthView from './ui/MonthView';
import ReconcileForm from './ui/ReconcileForm';
import DataPanel from './ui/DataPanel';
import BudgetEditor from './ui/BudgetEditor';
import CatalogPage from './ui/CatalogPage';
import SearchPage from './ui/SearchPage';
import IncidentsPage from './ui/IncidentsPage';
import YearView from './ui/YearView';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Home /> },
      { path: 'nuevo', element: <QuickAdd /> },
      { path: 'cuentas', element: <AccountsList /> },
      { path: 'cuentas/:accountId', element: <AccountDetail /> },
      { path: 'mes', element: <MonthView /> },
      { path: 'mes/:ym', element: <MonthView /> },
      { path: 'anio', element: <YearView /> },
      { path: 'anio/:yyyy', element: <YearView /> },
      { path: 'presupuesto', element: <BudgetEditor /> },
      { path: 'presupuesto/:ym', element: <BudgetEditor /> },
      { path: 'reconciliar/:accountId', element: <ReconcileForm /> },
      { path: 'buscar', element: <SearchPage /> },
      { path: 'datos', element: <DataPanel /> },
      { path: 'catalogo', element: <CatalogPage /> },
      { path: 'incidencias', element: <IncidentsPage /> },
    ],
  },
]);
