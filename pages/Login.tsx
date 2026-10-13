
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, LogIn, ArrowRight } from 'lucide-react';
import { LogoCompleto } from '../components/Logo';
import { useAuth } from '../services/AuthContext';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [lembrar, setLembrar] = useState(false);
  const [erro, setErro] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErro('');
    try {
      await login(email, senha, lembrar);
      navigate('/');
    } catch (err: any) {
      setErro(err.message || 'Não foi possível entrar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 relative overflow-hidden">
      {/* Background Decorative Circles */}
      <div className="absolute -top-24 -left-24 w-96 h-96 bg-blue-100 rounded-full blur-3xl opacity-50"></div>
      <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-blue-200 rounded-full blur-3xl opacity-30"></div>

      <div className="w-full max-w-md z-10">
        <div className="bg-white rounded-[2.5rem] shadow-2xl shadow-blue-900/10 overflow-hidden border border-slate-100">
          <div className="p-8 md:p-12">
            <div className="flex flex-col items-center mb-10 text-center">
              <div className="mb-5">
                <LogoCompleto className="h-44 w-auto" />
              </div>
              <h1 className="sr-only">Castelo Forte</h1>
              <p className="text-slate-500 font-medium">Plataforma de gestão para paróquias</p>
            </div>

            <form className="space-y-6" onSubmit={handleLogin}>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">E-mail de Acesso</label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors">
                    <Mail size={18} />
                  </div>
                  <input 
                    type="email" 
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    placeholder="seu@email.com"
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-transparent rounded-2xl focus:border-blue-600 focus:bg-white focus:ring-0 transition-all outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between ml-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Senha</label>
                  <Link to="/esqueci-senha" className="text-xs font-bold text-blue-600 hover:underline">Esqueceu?</Link>
                </div>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors">
                    <Lock size={18} />
                  </div>
                  <input 
                    type="password" 
                    value={senha}
                    onChange={e => setSenha(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-transparent rounded-2xl focus:border-blue-600 focus:bg-white focus:ring-0 transition-all outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 py-2">
                <input type="checkbox" checked={lembrar} onChange={e => setLembrar(e.target.checked)} className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-600" id="remember" />
                <label htmlFor="remember" className="text-sm text-slate-600 font-medium cursor-pointer">Manter conectado</label>
              </div>

              {erro && <p role="alert" className="text-sm font-bold text-red-600 bg-red-50 rounded-xl px-4 py-3">{erro}</p>}

              <button 
                type="submit"
                disabled={loading}
                className="w-full bg-[#002878] hover:bg-[#001A50] text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-xl shadow-blue-900/20 transition-all active:scale-95 disabled:opacity-50"
              >
                {loading ? 'Autenticando...' : (
                  <>
                    <LogIn size={20} />
                    Entrar no Sistema
                  </>
                )}
              </button>
            </form>

            <div className="mt-10 text-center">
              <p className="text-slate-500 text-sm font-medium">
                Sua paróquia ainda não está na plataforma?{' '}
                <Link to="/cadastro" className="text-blue-600 font-bold hover:underline inline-flex items-center gap-1">
                  Cadastrar minha paróquia <ArrowRight size={14} />
                </Link>
              </p>
            </div>
          </div>
          
          <div className="bg-slate-50 p-6 text-center border-t border-slate-100">
             <p className="text-[10px] text-slate-400 uppercase font-bold tracking-[0.2em]">Igreja Evangélica Luterana do Brasil</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
