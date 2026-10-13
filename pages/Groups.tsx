
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  UsersRound, 
  Settings, 
  ChevronRight, 
  Calendar,
  MessageSquare,
  Plus,
  X,
  Save,
  User,
  Type,
  Target,
  Palette,
  Send,
  Mail,
  MessageCircle,
  CheckCircle2,
  Loader2
} from 'lucide-react';
import { apiService } from '../services/apiService';
import { Departamento } from '../types';

interface GroupsProps {
  activeUnidadeId?: string;
}

const Groups: React.FC<GroupsProps> = ({ activeUnidadeId = '1' }) => {
  const navigate = useNavigate();
  const [depts, setDepts] = useState<Departamento[]>([]);
  React.useEffect(() => { apiService.getDepartamentos().then(setDepts).catch(() => setDepts([])); }, [activeUnidadeId]);
  
  // Estados dos Modais
  const [isNewDeptModalOpen, setIsNewDeptModalOpen] = useState(false);
  const [isCommModalOpen, setIsCommModalOpen] = useState(false);
  const [selectedDept, setSelectedDept] = useState<Departamento | null>(null);
  
  // Estados de Formulário
  const [loading, setLoading] = useState(false);
  const [newDept, setNewDept] = useState<Partial<Departamento>>({
    nome: '',
    lider: '',
    membrosCount: 0
  });

  const handleSaveDept = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const saved = await apiService.saveDepartamento({
        nome: newDept.nome || 'Novo Departamento',
        lider: newDept.lider || 'Líder a definir',
        membrosCount: 0,
      });
      setDepts(prev => [...prev, saved]);
      setIsNewDeptModalOpen(false);
      setNewDept({ nome: '', lider: '' });
    } catch (err: any) {
      alert(err.message || 'Não foi possível salvar o departamento.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCommunication = (dept: Departamento) => {
    setSelectedDept(dept);
    setIsCommModalOpen(true);
  };

  const handleNavigateToAgenda = (deptName: string) => {
    // Poderia passar o filtro por estado, mas aqui faremos o redirecionamento simples
    navigate('/calendario');
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-[#002878] tracking-tight">Departamentos e Grupos</h2>
          <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest mt-1">Gestão de ministérios e sociedades</p>
        </div>
        <button 
          onClick={() => setIsNewDeptModalOpen(true)}
          className="flex items-center gap-2 px-6 py-3 bg-[#002878] text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl hover:bg-[#001A50] transition-all active:scale-95"
        >
          <Plus size={16} /> Novo Departamento
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {depts.map(dept => (
          <div key={dept.id} className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm hover:shadow-xl hover:shadow-blue-900/5 transition-all group relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110"></div>
            
            <div className="relative z-10">
              <div className="flex justify-between items-start mb-6">
                <div className="p-4 bg-blue-50 text-[#002878] rounded-2xl shadow-inner">
                  <UsersRound size={28} />
                </div>
                <button className="text-slate-300 hover:text-[#002878] p-2 hover:bg-slate-50 rounded-xl transition-colors">
                  <Settings size={20} />
                </button>
              </div>
              
              <div className="mb-8">
                <h3 className="text-xl font-black text-slate-900 mb-1 group-hover:text-[#002878] transition-colors">{dept.nome}</h3>
                <div className="flex items-center gap-2 text-slate-400 font-bold uppercase text-[10px] tracking-widest">
                  <User size={12} className="text-[#00A3E0]" />
                  Líder: {dept.lider}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-100">
                  <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest mb-1">Membros</p>
                  <p className="text-xl font-black text-[#002878]">{dept.membrosCount}</p>
                </div>
                <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-100">
                  <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest mb-1">Atividades</p>
                  <p className="text-xl font-black text-[#002878]">Mensais</p>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => handleNavigateToAgenda(dept.nome)}
                    className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-[#002878] text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#001A50] transition-all shadow-lg shadow-blue-900/10"
                  >
                    <Calendar size={14} />
                    Agenda
                  </button>
                  <button 
                    onClick={() => handleOpenCommunication(dept)}
                    className="flex-1 flex items-center justify-center gap-2 py-3.5 border-2 border-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all"
                  >
                    <MessageSquare size={14} />
                    Comunicar
                  </button>
                </div>
                <button className="w-full flex items-center justify-between px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-[#00A3E0] transition-all group/btn">
                  Detalhes do Grupo
                  <ChevronRight size={14} className="group-hover/btn:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          </div>
        ))}

        {/* Botão de Adição Rápida Estilizado */}
        <button 
          onClick={() => setIsNewDeptModalOpen(true)}
          className="border-4 border-dashed border-slate-100 rounded-[2rem] flex flex-col items-center justify-center p-12 text-slate-300 hover:bg-white hover:border-[#00A3E0] hover:text-[#00A3E0] transition-all group hover:shadow-2xl hover:shadow-blue-900/5"
        >
          <div className="w-20 h-20 rounded-full bg-slate-50 group-hover:bg-blue-50 flex items-center justify-center mb-6 transition-all group-hover:scale-110">
            <Plus size={40} strokeWidth={3} />
          </div>
          <span className="font-black uppercase text-xs tracking-[0.2em]">Criar Novo Grupo</span>
          <p className="text-[10px] font-bold mt-2 opacity-60">Expanda os ministérios</p>
        </button>
      </div>

      {/* MODAL: Novo Departamento */}
      {isNewDeptModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[2.5rem] w-full max-w-xl shadow-2xl overflow-hidden border border-slate-200">
            <header className="px-8 py-6 border-b flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-[#002878] rounded-2xl text-white shadow-lg">
                  <UsersRound size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 uppercase">Novo Departamento</h3>
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Cadastro de Sociedade ou Ministério</p>
                </div>
              </div>
              <button onClick={() => setIsNewDeptModalOpen(false)} className="p-2 hover:bg-white rounded-full transition-colors text-slate-400">
                <X size={24} />
              </button>
            </header>
            
            <form onSubmit={handleSaveDept} className="p-8 space-y-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                  <Type size={12} className="text-[#00A3E0]" /> Nome do Departamento
                </label>
                <input 
                  type="text" 
                  required 
                  value={newDept.nome}
                  onChange={(e) => setNewDept({...newDept, nome: e.target.value})}
                  placeholder="Ex: JELB - Jovens Luteranos"
                  className="w-full px-5 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:border-[#002878] outline-none transition-all" 
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                  <User size={12} className="text-[#00A3E0]" /> Líder Responsável
                </label>
                <input 
                  type="text" 
                  required 
                  value={newDept.lider}
                  onChange={(e) => setNewDept({...newDept, lider: e.target.value})}
                  placeholder="Nome do líder do grupo"
                  className="w-full px-5 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:border-[#002878] outline-none transition-all" 
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                  <Target size={12} className="text-[#00A3E0]" /> Objetivo Principal
                </label>
                <textarea 
                  placeholder="Descreva brevemente a finalidade deste grupo..."
                  className="w-full px-5 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-medium focus:border-[#002878] outline-none h-24 resize-none transition-all shadow-inner"
                ></textarea>
              </div>

              <div className="flex items-center gap-4 p-4 bg-blue-50/50 rounded-2xl border border-blue-100/50">
                <Palette size={20} className="text-[#00A3E0]" />
                <div className="flex-1">
                  <p className="text-[10px] font-black text-[#002878] uppercase tracking-widest">Identidade Visual</p>
                  <div className="flex gap-2 mt-2">
                    {['#002878', '#00A3E0', '#10b981', '#f59e0b', '#ef4444'].map(color => (
                      <button key={color} type="button" className="w-6 h-6 rounded-full shadow-sm hover:scale-110 transition-transform" style={{ backgroundColor: color }}></button>
                    ))}
                  </div>
                </div>
              </div>

              <button 
                type="submit" 
                disabled={loading}
                className="w-full py-4 bg-[#002878] text-white rounded-2xl font-black uppercase text-xs tracking-[0.2em] shadow-xl hover:bg-[#001A50] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <><Save size={18} /> Criar Departamento</>}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Comunicar */}
      {isCommModalOpen && selectedDept && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden border border-slate-200">
            <header className="px-8 py-6 border-b flex items-center justify-between bg-indigo-600 text-white">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-md">
                  <Send size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black uppercase">Central de Comunicados</h3>
                  <p className="text-xs text-indigo-100 font-bold uppercase tracking-widest">{selectedDept.nome}</p>
                </div>
              </div>
              <button onClick={() => setIsCommModalOpen(false)} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                <X size={24} />
              </button>
            </header>
            
            <div className="p-8 space-y-6">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-4">
                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center font-black text-indigo-600 shadow-sm">
                  {selectedDept.nome.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-black text-slate-900">{selectedDept.lider}</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Líder do Departamento</p>
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Escolha o canal de envio</p>
                
                <button className="w-full p-4 bg-white border-2 border-slate-100 rounded-2xl flex items-center gap-4 hover:border-[#25D366] hover:bg-green-50/30 transition-all group">
                  <div className="p-3 bg-[#25D366]/10 text-[#25D366] rounded-xl group-hover:scale-110 transition-transform">
                    <MessageCircle size={24} />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-black text-slate-900 uppercase tracking-tight">WhatsApp do Grupo</p>
                    <p className="text-[10px] text-slate-500 font-medium">Enviar mensagem instantânea para todos os membros.</p>
                  </div>
                </button>

                <button className="w-full p-4 bg-white border-2 border-slate-100 rounded-2xl flex items-center gap-4 hover:border-indigo-600 hover:bg-indigo-50/30 transition-all group">
                  <div className="p-3 bg-indigo-100 text-indigo-600 rounded-xl group-hover:scale-110 transition-transform">
                    <Mail size={24} />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-black text-slate-900 uppercase tracking-tight">E-mail para Liderança</p>
                    <p className="text-[10px] text-slate-500 font-medium">Encaminhar documento ou circular oficial por e-mail.</p>
                  </div>
                </button>
              </div>

              <div className="pt-4 flex items-center gap-2 text-slate-400">
                <CheckCircle2 size={16} className="text-indigo-500" />
                <span className="text-[10px] font-black uppercase tracking-widest italic">Histórico de envios gravado no Log Pastoral</span>
              </div>
            </div>

            <footer className="p-6 bg-slate-50 border-t flex justify-end">
               <button onClick={() => setIsCommModalOpen(false)} className="px-8 py-3 bg-slate-900 text-white rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-800 transition-all">Fechar</button>
            </footer>
          </div>
        </div>
      )}

    </div>
  );
};

export default Groups;
