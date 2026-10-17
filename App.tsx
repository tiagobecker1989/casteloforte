import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout, { caminhoInicial } from './components/Layout';
import Arquivos from './pages/Arquivos';
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
import ImportarMembros from './pages/ImportarMembros';
import Ofertas from './pages/Ofertas';
import ConciliacaoPix from './pages/ConciliacaoPix';
import Despesas from './pages/Despesas';
import Relatorios from './pages/Relatorios';
import { AuthProvider, RequireAuth, useAuth } from './services/AuthContext';
import { UserRole } from './types';

const LOCAL: UserRole[] = ['ADMIN_PAROQUIA', 'PASTOR', 'TESOUREIRO', 'SECRETARIA'];
const ADMIN: UserRole[] = ['ADMIN_PAROQUIA'];

const Home: React.FC = () => {
  const { user, pode } = useAuth();
  if (user?.role === 'SUPER_ADMIN') return <Navigate to="/paroquias" replace />;
  if (pode('dashboard.ver')) return <Dashboard activeUnidadeId={user?.unidadeId ?? ''} />;
  const destino = user ? caminhoInicial(user, pode) : null;
  return destino && destino !== '/' ? <Navigate to={destino} replace /> : <p className="text-slate-500 font-bold">Seu usuário ainda não tem nenhuma tela liberada. Peça ao presidente para configurar o seu acesso.</p>;
};

const Private: React.FC<{ roles?: UserRole[]; perm?: string[]; children: React.ReactElement }> = ({ roles, perm, children }) => (
  <RequireAuth roles={roles} perm={perm}><Layout>{children}</Layout></RequireAuth>
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
      <Route path="/assinatura" element={<Private perm={['assinatura.ver']}><Assinatura /></Private>} />
      <Route path="/privacidade" element={<Private roles={ADMIN}><Privacidade /></Private>} />
      <Route path="/conta" element={<Private roles={[...LOCAL, 'SUPER_ADMIN']}><Conta /></Private>} />
      <Route path="/membros" element={<Private perm={['membros.ver']}><Membership activeUnidadeId={un} /></Private>} />
      <Route path="/membros/importar" element={<Private perm={['membros.importar']}><ImportarMembros /></Private>} />
      <Route path="/ofertas" element={<Private perm={['ofertas.ver']}><Ofertas /></Private>} />
      <Route path="/conciliacao" element={<Private perm={['conciliacao.ver']}><ConciliacaoPix /></Private>} />
      <Route path="/despesas" element={<Private perm={['despesas.ver']}><Despesas /></Private>} />
      <Route path="/relatorios" element={<Private perm={['relatorios.ver']}><Relatorios /></Private>} />
      <Route path="/diretoria" element={<Private perm={['diretoria.ver']}><Diretoria /></Private>} />
      <Route path="/financeiro" element={<Private perm={['financeiro.ver']}><Finance activeUnidadeId={un} /></Private>} />
      <Route path="/calendario" element={<Private perm={['calendario.ver']}><CalendarPage /></Private>} />
      <Route path="/departamentos" element={<Private perm={['departamentos.ver']}><Groups activeUnidadeId={un} /></Private>} />
      <Route path="/atas" element={<Private perm={['arquivos.ver']}><Arquivos /></Private>} />
      <Route path="/arquivos" element={<Navigate to="/atas" replace />} />
      <Route path="/usuarios" element={<Private roles={ADMIN}><Usuarios /></Private>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

const Root: React.FC = () => (
  <HashRouter><AuthProvider><App /></AuthProvider></HashRouter>
);
export default Root;
