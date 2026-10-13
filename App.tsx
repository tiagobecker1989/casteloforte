import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Membership from './pages/Membership';
import Finance from './pages/Finance';
import Groups from './pages/Groups';
import CalendarPage from './pages/CalendarPage';
import Login from './pages/Login';
import Register from './pages/Register';
import Paroquias from './pages/Paroquias';
import Diretoria from './pages/Diretoria';
import Usuarios from './pages/Usuarios';
import FinanceiroSede from './pages/FinanceiroSede';
import PlanosSede from './pages/PlanosSede';
import Assinatura from './pages/Assinatura';
import Privacidade from './pages/Privacidade';
import Conta from './pages/Conta';
import EsqueciSenha from './pages/EsqueciSenha';
import RedefinirSenha from './pages/RedefinirSenha';
import Legal from './pages/Legal';
import { AuthProvider, RequireAuth, useAuth } from './services/AuthContext';
import { UserRole } from './types';

const LOCAL: UserRole[] = ['ADMIN_PAROQUIA', 'PASTOR', 'TESOUREIRO', 'SECRETARIA'];

const Home: React.FC = () => {
  const { user } = useAuth();
  return user?.role === 'SUPER_ADMIN' ? <Navigate to="/paroquias" replace /> : <Dashboard activeUnidadeId={user?.unidadeId ?? ''} />;
};

const Private: React.FC<{ roles: UserRole[]; children: React.ReactElement }> = ({ roles, children }) => (
  <RequireAuth roles={roles}><Layout>{children}</Layout></RequireAuth>
);

const App: React.FC = () => {
  const { user } = useAuth();
  const un = user?.unidadeId ?? '';
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/cadastro" element={<Register />} />
      <Route path="/esqueci-senha" element={<EsqueciSenha />} />
      <Route path="/redefinir-senha/:token" element={<RedefinirSenha />} />
      <Route path="/legal/:tipo" element={<Legal />} />
      <Route path="/" element={<Private roles={[...LOCAL, 'SUPER_ADMIN']}><Home /></Private>} />
      <Route path="/paroquias" element={<Private roles={['SUPER_ADMIN']}><Paroquias /></Private>} />
      <Route path="/financeiro-sede" element={<Private roles={['SUPER_ADMIN']}><FinanceiroSede /></Private>} />
      <Route path="/planos" element={<Private roles={['SUPER_ADMIN']}><PlanosSede /></Private>} />
      <Route path="/assinatura" element={<Private roles={['ADMIN_PAROQUIA', 'PASTOR', 'TESOUREIRO']}><Assinatura /></Private>} />
      <Route path="/privacidade" element={<Private roles={['ADMIN_PAROQUIA']}><Privacidade /></Private>} />
      <Route path="/conta" element={<Private roles={[...LOCAL, 'SUPER_ADMIN']}><Conta /></Private>} />
      <Route path="/membros" element={<Private roles={LOCAL}><Membership activeUnidadeId={un} /></Private>} />
      <Route path="/diretoria" element={<Private roles={LOCAL}><Diretoria /></Private>} />
      <Route path="/financeiro" element={<Private roles={['ADMIN_PAROQUIA', 'PASTOR', 'TESOUREIRO']}><Finance activeUnidadeId={un} /></Private>} />
      <Route path="/calendario" element={<Private roles={LOCAL}><CalendarPage /></Private>} />
      <Route path="/departamentos" element={<Private roles={LOCAL}><Groups activeUnidadeId={un} /></Private>} />
      <Route path="/usuarios" element={<Private roles={['ADMIN_PAROQUIA']}><Usuarios /></Private>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

const Root: React.FC = () => (
  <HashRouter><AuthProvider><App /></AuthProvider></HashRouter>
);
export default Root;
