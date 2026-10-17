import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Wallet, UsersRound, Menu, X, LogOut, Calendar, Building2, Landmark, UserCog, Network, Coins, CreditCard, ShieldCheck, AlertTriangle, HandCoins, ArrowLeftRight, Receipt, FileBarChart, FileUp, Bell } from 'lucide-react';
import { MarcaIgreja } from './Logo';
import { UserRole } from '../types';
import { useAuth } from '../services/AuthContext';
import AceiteModal from './AceiteModal';

const ROLE_LABEL: Record<UserRole, string> = {
  SUPER_ADMIN: 'Administração da Sede', ADMIN_PAROQUIA: 'Presidente (Administrador)', PASTOR: 'Pastor', TESOUREIRO: 'Tesoureiro', SECRETARIA: 'Secretaria',
};

export const ITEMS: { name: string; path: string; icon: any; roles?: UserRole[]; perm?: string[] }[] = [
  { name: 'Painel da Sede', path: '/paroquias', icon: Network, roles: ['SUPER_ADMIN'] },
  { name: 'Financeiro Consolidado', path: '/financeiro-sede', icon: Coins, roles: ['SUPER_ADMIN'] },
  { name: 'Planos e Cobrança', path: '/planos', icon: CreditCard, roles: ['SUPER_ADMIN'] },
  { name: 'Dashboard', path: '/', icon: LayoutDashboard, perm: ['dashboard.ver'] },
  { name: 'Membros', path: '/membros', icon: Users, perm: ['membros.ver'] },
  { name: 'Diretoria', path: '/diretoria', icon: Landmark, perm: ['diretoria.ver'] },
  { name: 'Financeiro', path: '/financeiro', icon: Wallet, perm: ['financeiro.ver'] },
  { name: 'Ofertas', path: '/ofertas', icon: HandCoins, perm: ['ofertas.ver'] },
  { name: 'Conciliação Pix', path: '/conciliacao', icon: ArrowLeftRight, perm: ['conciliacao.ver'] },
  { name: 'Despesas e Tópicos', path: '/despesas', icon: Receipt, perm: ['despesas.ver'] },
  { name: 'Relatórios', path: '/relatorios', icon: FileBarChart, perm: ['relatorios.ver'] },
  { name: 'Calendário', path: '/calendario', icon: Calendar, perm: ['calendario.ver'] },
  { name: 'Departamentos', path: '/departamentos', icon: UsersRound, perm: ['departamentos.ver'] },
  { name: 'Atas', path: '/atas', icon: FileUp, perm: ['arquivos.ver'] },
  { name: 'Usuários', path: '/usuarios', icon: UserCog, roles: ['ADMIN_PAROQUIA'] },
  { name: 'Assinatura', path: '/assinatura', icon: CreditCard, perm: ['assinatura.ver'] },
  { name: 'Privacidade', path: '/privacidade', icon: ShieldCheck, roles: ['ADMIN_PAROQUIA'] },
];

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [open, setOpen] = useState(false);
  const { user, logout, pode } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  if (!user) return null;

  const menu = ITEMS.filter(i => (i.perm ? pode(...i.perm) : !!i.roles?.includes(user.role)));
  const avisos = user.role === 'ADMIN_PAROQUIA' ? user.pendenciasDiretoria ?? 0 : 0;
  const unidade = user.unidade;

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <button onClick={() => setOpen(!open)} className="p-2 bg-white rounded-lg shadow-md border border-slate-200">
          {open ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-slate-200 transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:inset-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-3 px-6 py-8">
            <MarcaIgreja className="h-11 w-auto shrink-0" decorativa />
            <span className="text-xl font-black text-[#002878]">Castelo Forte</span>
          </div>
          <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
            {menu.map(item => (
              <Link key={item.path} to={item.path} onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${location.pathname === item.path ? 'bg-blue-50 text-[#002878] font-bold' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
                <item.icon size={20} />{item.name}
                {item.path === '/diretoria' && avisos > 0 && <span aria-label={`${avisos} aviso(s)`} className="ml-auto bg-amber-500 text-white text-[10px] font-black rounded-full px-2 py-0.5">{avisos}</span>}
              </Link>
            ))}
          </nav>
          <div className="p-4 border-t border-slate-100">
            <div className="bg-slate-50 rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-[#002878] font-black">{user.nome.charAt(0)}</div>
              <Link to="/conta" title="Minha conta" className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900 truncate">{user.nome}</p>
                <p className="text-[10px] font-bold text-blue-600 truncate uppercase tracking-tighter">{ROLE_LABEL[user.role]}</p>
              </Link>
              <button title="Sair" onClick={() => { logout(); navigate('/login'); }} className="text-slate-400 hover:text-red-500 transition-colors"><LogOut size={18} /></button>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <header className="h-16 flex items-center px-6 bg-white border-b border-slate-200 sticky top-0 z-30">
          <div className="flex items-center gap-4 ml-12 lg:ml-0">
            <h1 className="text-sm font-black text-[#002878] uppercase tracking-tight hidden md:block">{menu.find(i => i.path === location.pathname)?.name || 'Início'}</h1>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl">
              <Building2 size={16} className="text-[#00A3E0]" />
              <div className="text-left">
                <p className="text-[10px] font-black text-[#002878] uppercase leading-none">{unidade?.nome || 'IELB Castelo Forte'}</p>
                <p className="text-[9px] text-slate-400 font-bold uppercase leading-none mt-0.5">{unidade?.distrito || 'Sede'}</p>
              </div>
            </div>
          </div>
        </header>
        {avisos > 0 && (
          <div role="alert" className="flex items-center gap-3 bg-amber-500 text-white px-6 py-3 text-sm font-bold">
            <Bell size={18} className="shrink-0" />
            <span>{avisos === 1 ? 'Há 1 alteração da diretoria' : `Há ${avisos} alterações da diretoria`} aguardando a sua confirmação. <Link to="/diretoria" className="underline">Revisar e confirmar com a minha senha</Link></span>
          </div>
        )}
        {(user.assinatura?.status === 'INADIMPLENTE' || user.assinatura?.status === 'CANCELADA') && (
          <div role="alert" className="flex items-center gap-3 bg-red-600 text-white px-6 py-3 text-sm font-bold">
            <AlertTriangle size={18} className="shrink-0" />
            <span>Modo somente leitura: a assinatura está {user.assinatura.status === 'CANCELADA' ? 'cancelada' : 'com fatura em atraso'}. <Link to="/assinatura" className="underline">Ver assinatura</Link></span>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto space-y-8">{children}</div>
        </div>
      </main>
      {user.aceitePendente && <AceiteModal />}
    </div>
  );
};

export default Layout;

/** Primeira tela a que o usuário tem acesso (para quem não vê o Dashboard). */
export function caminhoInicial(user: { role: UserRole }, pode: (...k: string[]) => boolean): string | null {
  const i = ITEMS.find(x => (x.perm ? pode(...x.perm) : !!x.roles?.includes(user.role)));
  return i ? i.path : null;
}
