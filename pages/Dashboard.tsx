
import React, { useEffect, useState, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  AreaChart, Area 
} from 'recharts';
import { 
  Users, 
  UserPlus, 
  UserMinus, 
  Calendar, 
  ChevronRight, 
  Activity,
  AlertTriangle,
  Sparkles,
  Loader2,
  X,
  FileText,
  Download,
  Share2,
  Send,
  MessageCircle,
  Mail
} from 'lucide-react';
import { apiService } from '../services/apiService';
import { analyzeCongregationHealth, generateDetailedPastoralReport, generateBaptismMessage } from '../services/geminiService';
import { Membro } from '../types';

interface DashboardProps {
  activeUnidadeId?: string;
}

const Dashboard: React.FC<DashboardProps> = ({ activeUnidadeId = '1' }) => {
  const [summaryInsights, setSummaryInsights] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  
  const [detailedReport, setDetailedReport] = useState<string | null>(null);
  const [loadingDetailed, setLoadingDetailed] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Estados para Mensagem de Batismo
  const [selectedMembroMessage, setSelectedMembroMessage] = useState<Membro | null>(null);
  const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
  const [generatedMessage, setGeneratedMessage] = useState('');
  const [loadingMessage, setLoadingMessage] = useState(false);

  // Filtro de membros por unidade ativa
  const [localMembros, setLocalMembros] = useState<Membro[]>([]);
  useEffect(() => { apiService.getTodosMembros().then(setLocalMembros).catch(() => setLocalMembros([])); }, [activeUnidadeId]);

  useEffect(() => {
    const fetchSummary = async () => {
      setLoadingSummary(true);
      // Passamos apenas os membros da unidade ativa para a IA
      const result = await analyzeCongregationHealth(localMembros);
      setSummaryInsights(result || "Análise concluída.");
      setLoadingSummary(false);
    };
    if (localMembros.length > 0) {
      fetchSummary();
    } else {
      setSummaryInsights("Nenhum dado de membro disponível para esta unidade.");
    }
  }, [localMembros]);

  const handleOpenDetailedReport = async () => {
    setIsModalOpen(true);
    if (!detailedReport) {
      setLoadingDetailed(true);
      const report = await generateDetailedPastoralReport(localMembros);
      setDetailedReport(report);
      setLoadingDetailed(false);
    }
  };

  const handleOpenMessageModal = async (membro: Membro) => {
    setSelectedMembroMessage(membro);
    setIsMessageModalOpen(true);
    setLoadingMessage(true);
    const msg = await generateBaptismMessage(membro.nome, 14);
    setGeneratedMessage(msg || '');
    setLoadingMessage(false);
  };

  const handleSendWhatsApp = () => {
    if (!selectedMembroMessage) return;
    const phone = selectedMembroMessage.telefone?.replace(/\D/g, '') || '';
    const text = encodeURIComponent(generatedMessage);
    window.open(`https://wa.me/55${phone}?text=${text}`, '_blank');
    setIsMessageModalOpen(false);
  };

  const dataEngajamento = [
    { name: 'Jan', ativos: 120, risco: 5 },
    { name: 'Fev', ativos: 125, risco: 8 },
    { name: 'Mar', ativos: 122, risco: 12 },
    { name: 'Abr', ativos: 130, risco: 10 },
    { name: 'Mai', ativos: 128, risco: 15 },
  ];

  const emRisco = localMembros.filter(m => m.pontuacaoEngajamento < 30);
  const aniversariantesBatismo = localMembros.slice(0, 2);

  return (
    <div className="space-y-8">
      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Membros na Unidade" 
          value={localMembros.length.toString()} 
          change="Dados locais" 
          icon={<Users className="text-blue-600" />} 
          color="blue"
        />
        <StatCard 
          title="Novas Profissões" 
          value="2" 
          change="Unidade Ativa" 
          icon={<UserPlus className="text-emerald-600" />} 
          color="emerald"
        />
        <StatCard 
          title="Membros em Risco" 
          value={emRisco.length.toString()} 
          change="Ação Necessária" 
          icon={<UserMinus className="text-amber-600" />} 
          color="amber"
        />
        <StatCard 
          title="Frequência Média" 
          value="78%" 
          change="Últimos 30 dias" 
          icon={<Activity className="text-indigo-600" />} 
          color="indigo"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Engagement Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Termômetro da Congregação</h2>
              <p className="text-sm text-slate-500 font-medium">Engajamento local da unidade ativa</p>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dataEngajamento}>
                <defs>
                  <linearGradient id="colorAtivos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}
                />
                <Area type="monotone" dataKey="ativos" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorAtivos)" />
                <Area type="monotone" dataKey="risco" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 5" fill="none" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* AI Insights Panel */}
        <div className="bg-gradient-to-br from-[#002878] to-[#005CB9] p-8 rounded-[2.5rem] text-white shadow-2xl shadow-blue-900/20 relative overflow-hidden flex flex-col justify-between">
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-white/20 rounded-xl backdrop-blur-md">
                <Sparkles className="text-blue-300" size={24} />
              </div>
              <h2 className="text-xl font-black tracking-tight">IA Pastoral Local</h2>
            </div>
            
            <div className="min-h-[140px]">
              {loadingSummary ? (
                <div className="animate-pulse space-y-3">
                  <div className="h-3 bg-white/20 rounded-full w-full"></div>
                  <div className="h-3 bg-white/20 rounded-full w-5/6"></div>
                  <div className="h-3 bg-white/20 rounded-full w-4/6"></div>
                </div>
              ) : (
                <p className="text-sm text-blue-50 leading-relaxed font-medium">
                  {summaryInsights || "Preparando análise da congregação..."}
                </p>
              )}
            </div>
          </div>

          <button 
            onClick={handleOpenDetailedReport}
            className="relative z-10 w-full mt-8 py-4 bg-white text-[#002878] rounded-2xl font-black uppercase text-[11px] tracking-widest transition-all hover:bg-blue-50 hover:-translate-y-1 shadow-xl shadow-black/10 active:scale-95 flex items-center justify-center gap-2"
          >
            Relatório de Cuidado Completo
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Urgent Care List */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-black text-[#002878] text-sm uppercase tracking-widest flex items-center gap-3">
              <AlertTriangle className="text-amber-500" size={20} />
              Atenção Pastoral (Evasão)
            </h2>
          </div>
          <div className="divide-y divide-slate-50">
            {emRisco.length > 0 ? emRisco.map(membro => (
              <div key={membro.id} className="px-8 py-5 flex items-center justify-between hover:bg-slate-50 transition-colors group">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center font-black text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-all">
                    {membro.nome.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{membro.nome}</p>
                    <p className="text-xs text-slate-400 font-medium">Score Crítico: {membro.pontuacaoEngajamento}%</p>
                  </div>
                </div>
                <button className="p-2 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all">
                  <ChevronRight size={20} />
                </button>
              </div>
            )) : (
              <div className="p-10 text-center text-slate-400 font-bold uppercase text-[10px]">Parabéns! Nenhum membro em risco crítico.</div>
            )}
          </div>
        </div>

        {/* Baptism Anniversaries */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-black text-[#002878] text-sm uppercase tracking-widest flex items-center gap-3">
              <Calendar className="text-indigo-500" size={20} />
              Datas de Batismo (Mês)
            </h2>
          </div>
          <div className="divide-y divide-slate-50">
            {aniversariantesBatismo.length > 0 ? aniversariantesBatismo.map(membro => (
              <div key={membro.id} className="px-8 py-5 flex items-center justify-between group">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black group-hover:scale-110 transition-transform">
                    {membro.nome.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{membro.nome}</p>
                    <p className="text-xs text-slate-400 font-medium italic">Aniversário de Batismo Celebração</p>
                  </div>
                </div>
                <button 
                  onClick={() => handleOpenMessageModal(membro)}
                  className="px-5 py-2.5 bg-indigo-50 text-indigo-600 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-600 hover:text-white transition-all shadow-sm flex items-center gap-2"
                >
                  <Send size={12} />
                  Enviar
                </button>
              </div>
            )) : (
              <div className="p-10 text-center text-slate-400 font-bold uppercase text-[10px]">Sem aniversários de batismo registrados hoje.</div>
            )}
          </div>
        </div>
      </div>

      {/* Reutilizando Modais existentes de Dashboard... */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] w-full max-w-4xl max-h-[90vh] shadow-2xl flex flex-col relative overflow-hidden">
            <header className="px-8 py-6 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white z-10">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-50 rounded-2xl text-[#002878]">
                  <FileText size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900">Relatório Estratégico Local</h3>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Análise Exclusiva da Unidade Ativa</p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400"><X size={24} /></button>
            </header>
            <div className="flex-1 overflow-y-auto p-8 md:p-12 prose prose-slate max-w-none">
              {loadingDetailed ? <div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue-600" size={40} /></div> : detailedReport}
            </div>
          </div>
        </div>
      )}

      {isMessageModalOpen && selectedMembroMessage && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-white rounded-[2rem] w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
            <header className="px-6 py-5 bg-indigo-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-3"><Sparkles size={20} /><h3 className="font-bold">IA Mensagem Pastoral</h3></div>
              <button onClick={() => setIsMessageModalOpen(false)} className="p-1 hover:bg-white/20 rounded-lg"><X size={20} /></button>
            </header>
            <div className="p-6 space-y-4">
              <textarea value={generatedMessage} onChange={(e) => setGeneratedMessage(e.target.value)} className="w-full h-40 p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-medium outline-none resize-none" />
              <button onClick={handleSendWhatsApp} className="w-full py-4 bg-[#25D366] text-white rounded-2xl font-black uppercase text-[10px] tracking-widest">Enviar via WhatsApp</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const StatCard: React.FC<{ title: string; value: string; change: string; icon: React.ReactNode; color: string }> = ({ title, value, change, icon, color }) => (
  <div className="bg-white p-6 rounded-[1.5rem] border border-slate-200 shadow-sm flex items-start justify-between hover:shadow-xl hover:shadow-blue-900/5 transition-all">
    <div>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">{title}</p>
      <h3 className="text-2xl font-black text-slate-900 tracking-tight">{value}</h3>
      <p className={`text-[10px] mt-1.5 font-black uppercase tracking-wider text-${color}-600`}>{change}</p>
    </div>
    <div className={`p-3.5 bg-${color}-50 rounded-2xl text-${color}-600 shadow-inner`}>{icon}</div>
  </div>
);

export default Dashboard;
