
import React, { useState, useEffect, useCallback } from 'react';
import FichaMembroModal from '../components/FichaMembroModal';
import { useAuth } from '../services/AuthContext';
import { 
  Search, 
  UserPlus, 
  CheckCircle2,
  Users as UsersIcon,
  ChevronRight,
  ChevronLeft,
  Loader2,
  X,
  Save,
  Database as DbIcon,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  Calendar,
  ShieldCheck,
  User
} from 'lucide-react';
import { apiService } from '../services/apiService';
import { Membro, MembroStatus, CargoDiretoria } from '../types';

interface MembershipProps {
  activeUnidadeId?: string;
}

const CARGO_LABELS: Record<CargoDiretoria, string> = {
  PRESIDENTE: 'Presidente',
  VICE_PRESIDENTE: 'Vice-Presidente',
  SECRETARIO: 'Secretário(a)',
  VICE_SECRETARIO: 'Vice-Secretário(a)',
  TESOUREIRO: 'Tesoureiro(a)',
  VICE_TESOUREIRO: 'Vice-Tesoureiro(a)',
  CONSELHEIRO: 'Conselheiro(a)',
  VICE_CONSELHEIRO: 'Vice-Conselheiro(a)',
  FISCAL_1: 'Fiscal 1',
  FISCAL_2: 'Fiscal 2',
  FISCAL_3: 'Fiscal 3',
};

const Membership: React.FC<MembershipProps> = ({ activeUnidadeId = '1' }) => {
  const [membros, setMembros] = useState<Membro[]>([]);
  const [totalMembros, setTotalMembros] = useState(0);
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selecionado, setSelecionado] = useState<Membro | null>(null);
  const { user } = useAuth();
  const [showSuccess, setShowSuccess] = useState(false);

  // Estado inicial completo do formulário conforme a interface Membro
  const initialFormState: Partial<Membro> = {
    nome: '',
    status: 'ATIVO' as MembroStatus,
    email: '',
    telefone: '',
    endereco: '',
    profissao: '',
    dataBatismo: '',
    dataConfirmacao: '',
    temCargo: false,
    cargoDiretoria: undefined,
    unidadeId: activeUnidadeId,
    pontuacaoEngajamento: 100
  };

  const [formData, setFormData] = useState<Partial<Membro>>(initialFormState);

  const limit = 10;

  const loadMembros = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiService.getMembros(activeUnidadeId, page, limit, searchTerm);
      setMembros(result.data);
      setTotalMembros(result.total);
    } finally {
      setLoading(false);
    }
  }, [activeUnidadeId, page, searchTerm]);

  useEffect(() => {
    loadMembros();
  }, [loadMembros]);

  const handleSaveMembro = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiService.saveMembro({ ...formData, unidadeId: activeUnidadeId });
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
      setIsFormOpen(false);
      setFormData(initialFormState);
      loadMembros();
    } finally {
      setSaving(false);
    }
  };

  const totalPages = Math.ceil(totalMembros / limit);

  return (
    <div className="space-y-6">
      {showSuccess && (
        <div className="fixed top-8 right-8 z-[150] bg-emerald-600 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-right duration-300">
          <CheckCircle2 size={24} />
          <p className="font-bold">Cadastro salvo com sucesso!</p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
             <h2 className="text-2xl font-black text-[#002878] tracking-tight">Gestão de Membros</h2>
          </div>
          <p className="text-slate-500 font-medium">Cadastro e ficha dos membros da sua paróquia.</p>
        </div>
        <button 
          onClick={() => { setFormData(initialFormState); setIsFormOpen(true); }}
          className="flex items-center gap-2 px-6 py-3 bg-[#002878] text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-blue-900/10 hover:bg-[#001A50] transition-all"
        >
          <UserPlus size={18} /> Novo Cadastro
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input 
            type="text" 
            placeholder="Buscar por nome no banco de dados local..." 
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
            className="w-full pl-12 pr-4 py-3.5 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-[#002878] focus:outline-none transition-all font-medium text-slate-700 shadow-sm"
          />
        </div>
      </div>

      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-xl shadow-blue-900/5 overflow-hidden min-h-[500px] flex flex-col">
        <div className="flex-1 overflow-x-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-[400px] gap-4">
              <Loader2 className="animate-spin text-[#002878]" size={40} />
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Consultando Registros...</p>
            </div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Membro / Contato</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Eclesiástico</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {membros.length > 0 ? membros.map((m) => (
                  <tr key={m.id} className="hover:bg-blue-50/20 transition-colors group">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center font-black text-[#002878]">
                          {m.nome.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">{m.nome}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase">{m.email || m.telefone || 'Sem contato'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="space-y-0.5">
                        <p className="text-[10px] font-bold text-slate-600 uppercase">Batismo: {m.dataBatismo || 'N/A'}</p>
                        {m.temCargo && (
                          <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-black uppercase tracking-tighter">
                            {CARGO_LABELS[m.cargoDiretoria!] || 'Diretoria'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${m.status === 'ATIVO' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                        {m.status}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <button onClick={() => setSelecionado(m)} aria-label={`Abrir ficha de ${m.nome}`} className="p-2 text-slate-300 hover:text-[#002878] hover:bg-white rounded-xl transition-all shadow-sm">
                        <ChevronRight size={18} />
                      </button>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={4} className="px-8 py-20 text-center">
                      <UsersIcon className="mx-auto text-slate-200 mb-4" size={48} />
                      <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest">Nenhum registro para esta busca no banco.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-8 py-6 border-t border-slate-50 flex items-center justify-between bg-slate-50/30">
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
            Página {page} de {totalPages || 1} • {totalMembros} Membros totais
          </p>
          <div className="flex items-center gap-2">
            <button 
              disabled={page === 1 || loading}
              onClick={() => setPage(p => p - 1)}
              className="p-2 bg-white border border-slate-200 rounded-xl disabled:opacity-30 hover:bg-slate-50 transition-all shadow-sm"
            >
              <ChevronLeft size={20} />
            </button>
            <button 
              disabled={page === totalPages || loading}
              onClick={() => setPage(p => p + 1)}
              className="p-2 bg-white border border-slate-200 rounded-xl disabled:opacity-30 hover:bg-slate-50 transition-all shadow-sm"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* MODAL DE CADASTRO COMPLETO RESTAURADO */}
      {isFormOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-white rounded-[2.5rem] w-full max-w-2xl shadow-2xl flex flex-col relative border border-slate-200 max-h-[95vh]">
            <header className="px-8 py-6 border-b flex items-center justify-between bg-slate-50/50 sticky top-0 z-10">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-[#002878] rounded-2xl text-white shadow-lg">
                  <UserPlus size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 uppercase">Ficha Cadastral de Membro</h3>
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Todos os dados serão persistidos localmente</p>
                </div>
              </div>
              <button onClick={() => setIsFormOpen(false)} className="p-2 hover:bg-white rounded-full transition-colors text-slate-400">
                <X size={24} />
              </button>
            </header>
            
            <form onSubmit={handleSaveMembro} className="flex-1 overflow-y-auto p-8 space-y-8">
              {/* Seção 1: Dados Pessoais */}
              <div className="space-y-4">
                <h4 className="flex items-center gap-2 text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] border-b border-blue-50 pb-2">
                  <User size={14} /> Dados Pessoais e Contato
                </h4>
                
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome Completo</label>
                  <input 
                    type="text" required 
                    value={formData.nome}
                    onChange={(e) => setFormData({...formData, nome: e.target.value})}
                    placeholder="Nome completo do membro"
                    className="w-full px-5 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:border-[#002878] outline-none transition-all" 
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1"><Mail size={12} /> E-mail</label>
                    <input type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="w-full px-5 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:border-[#002878] outline-none" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1"><Phone size={12} /> Telefone</label>
                    <input type="text" value={formData.telefone} onChange={(e) => setFormData({...formData, telefone: e.target.value})} placeholder="(00) 00000-0000" className="w-full px-5 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:border-[#002878] outline-none" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1"><Briefcase size={12} /> Profissão</label>
                    <input type="text" value={formData.profissao} onChange={(e) => setFormData({...formData, profissao: e.target.value})} className="w-full px-5 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:border-[#002878] outline-none" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1"><MapPin size={12} /> Endereço</label>
                    <input type="text" value={formData.endereco} onChange={(e) => setFormData({...formData, endereco: e.target.value})} placeholder="Rua, Nº, Bairro" className="w-full px-5 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:border-[#002878] outline-none" />
                  </div>
                </div>
              </div>

              {/* Seção 2: Dados Eclesiásticos */}
              <div className="space-y-4">
                <h4 className="flex items-center gap-2 text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] border-b border-blue-50 pb-2">
                  <ShieldCheck size={14} /> Vínculo Eclesiástico
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1"><Calendar size={12} /> Data de Batismo</label>
                    <input type="date" value={formData.dataBatismo} onChange={(e) => setFormData({...formData, dataBatismo: e.target.value})} className="w-full px-5 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:border-[#002878] outline-none" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1"><Calendar size={12} /> Data de Confirmação</label>
                    <input type="date" value={formData.dataConfirmacao} onChange={(e) => setFormData({...formData, dataConfirmacao: e.target.value})} className="w-full px-5 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:border-[#002878] outline-none" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Status de Membresia</label>
                    <select 
                      value={formData.status}
                      onChange={(e) => setFormData({...formData, status: e.target.value as MembroStatus})}
                      className="w-full px-5 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:border-[#002878] outline-none appearance-none cursor-pointer"
                    >
                      <option value="ATIVO">Ativo</option>
                      <option value="INATIVO">Inativo</option>
                      <option value="TRANSFERIDO">Transferido</option>
                      <option value="FALECIDO">Falecido</option>
                    </select>
                  </div>
                  <div className="space-y-4 flex flex-col justify-end">
                    <label className="flex items-center gap-3 p-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl cursor-pointer hover:border-blue-100 transition-all">
                      <input 
                        type="checkbox" 
                        checked={formData.temCargo} 
                        onChange={(e) => setFormData({...formData, temCargo: e.target.checked})}
                        className="w-5 h-5 rounded border-slate-300 text-[#002878] focus:ring-[#002878]"
                      />
                      <span className="text-xs font-bold text-slate-700">Ocupa Cargo em Diretoria</span>
                    </label>
                  </div>
                </div>

                {formData.temCargo && (
                  <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-300">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Selecione o Cargo</label>
                    <select 
                      value={formData.cargoDiretoria}
                      onChange={(e) => setFormData({...formData, cargoDiretoria: e.target.value as CargoDiretoria})}
                      className="w-full px-5 py-3.5 bg-white border-2 border-blue-100 rounded-2xl text-sm font-bold text-[#002878] focus:border-[#002878] outline-none appearance-none cursor-pointer"
                    >
                      <option value="">Selecione um cargo...</option>
                      {Object.entries(CARGO_LABELS).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t sticky bottom-0 bg-white py-4 z-10">
                <button 
                  type="submit" 
                  disabled={saving}
                  className="w-full py-4 bg-[#002878] text-white rounded-2xl font-black uppercase text-xs tracking-[0.2em] shadow-xl hover:bg-[#001A50] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  {saving ? <Loader2 size={18} className="animate-spin" /> : <><Save size={18} /> Persistir Ficha Cadastral</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {selecionado && (
        <FichaMembroModal membro={selecionado} podeGerir={user?.role !== 'TESOUREIRO'} onClose={() => setSelecionado(null)} onChanged={loadMembros} />
      )}
    </div>
  );
};



export default Membership;
