
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { 
  Plus, 
  ArrowUpRight, 
  ArrowDownRight, 
  Wallet, 
  CheckCircle2,
  X,
  History,
  Loader2,
  QrCode,
  Calendar,
  Save,
  Banknote,
  ArrowRightLeft,
  FileText,
  DollarSign,
  UserX,
  Download,
  Printer
} from 'lucide-react';
// @ts-ignore
import html2pdf from 'html2pdf.js';
import { apiService } from '../services/apiService';
import { Lancamento, LancamentoTipo, CategoriaFinanceira, CotaConfig } from '../types';

interface FinanceProps {
  activeUnidadeId?: string;
}

interface PendingPix {
  id: string;
  nome: string;
  valor: number;
}

const CATEGORIAS: CategoriaFinanceira[] = [
  'OFERTA', 'DIZIMO', 'COTA_COOPERATIVA', 'MANUTENCAO', 'SALARIOS', 'MISSOES', 'CONSTRUCAO'
];

const CATEGORIA_LABELS: Record<CategoriaFinanceira, string> = {
  OFERTA: 'Oferta',
  DIZIMO: 'Dízimo',
  COTA_COOPERATIVA: 'Cota Cooperativa',
  MANUTENCAO: 'Manutenção',
  SALARIOS: 'Salários/Folha',
  MISSOES: 'Missões',
  CONSTRUCAO: 'Construção/Reforma'
};

const Finance: React.FC<FinanceProps> = ({ activeUnidadeId = '1' }) => {
  const [viewMode, setViewMode] = useState<'OVERVIEW' | 'DETAILED'>('OVERVIEW');
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isGuiaModalOpen, setIsGuiaModalOpen] = useState(false);

  // Estado do formulário
  const initialFormState: Partial<Lancamento> = {
    tipo: 'ENTRADA',
    categoria: 'OFERTA',
    valor: 0,
    data: new Date().toISOString().split('T')[0],
    descricao: '',
    unidadeId: activeUnidadeId
  };
  const [formData, setFormData] = useState<Partial<Lancamento>>(initialFormState);

  const [pendingPix, setPendingPix] = useState<PendingPix[]>([
    { id: 'pix1', nome: 'João S.', valor: 150.00 },
    { id: 'pix2', nome: 'Maria O.', valor: 200.00 },
  ]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiService.getLancamentos(activeUnidadeId);
      setLancamentos(data.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()));
    } finally {
      setLoading(false);
    }
  }, [activeUnidadeId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totals = useMemo(() => {
    const entradas = lancamentos.reduce((acc, l) => l.tipo === 'ENTRADA' ? acc + l.valor : acc, 0);
    const saidas = lancamentos.reduce((acc, l) => l.tipo === 'SAIDA' ? acc + l.valor : acc, 0);
    
    return {
      entradas,
      saidas,
      saldo: entradas - saidas,
      cotaIelb: entradas * 0.06,
      cotaDivasi: entradas * 0.03,
      cotaTotal: entradas * 0.09
    };
  }, [lancamentos]);

  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.valor || formData.valor <= 0) return alert("Insira um valor válido");
    
    setIsSaving(true);
    try {
      await apiService.saveLancamento({
        ...formData,
        unidadeId: activeUnidadeId
      });
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
      setIsEntryModalOpen(false);
      setFormData(initialFormState);
      loadData();
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmPix = async (pix: PendingPix) => {
    setIsSaving(true);
    try {
      // Cria o lançamento real baseado no PIX
      await apiService.saveLancamento({
        tipo: 'ENTRADA',
        categoria: 'OFERTA',
        valor: pix.valor,
        data: new Date().toISOString().split('T')[0],
        descricao: `PIX Conciliado: ${pix.nome}`,
        unidadeId: activeUnidadeId
      });
      
      // Remove da lista de pendências
      setPendingPix(prev => prev.filter(p => p.id !== pix.id));
      
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
      loadData();
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportGuia = () => {
    const element = document.getElementById('guia-recolhimento');
    const opt = {
      margin: 10,
      filename: `Guia_IELB_Repasse_${new Date().getMonth() + 1}_${activeUnidadeId}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {showSuccess && (
        <div className="fixed top-8 right-8 z-[200] bg-emerald-600 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-right duration-300">
          <CheckCircle2 size={24} />
          <p className="font-bold">Lançamento registrado com sucesso!</p>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black text-[#002878] tracking-tight">Tesouraria Local</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest">Sincronizado com IndexedDB</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsEntryModalOpen(true)}
            className="flex items-center gap-2 px-6 py-3 bg-[#002878] text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-blue-900/10 hover:bg-[#001A50] transition-all active:scale-95"
          >
            <Plus size={18} /> Novo Lançamento
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
        <SummaryCard title="Saldo em Caixa" value={totals.saldo} icon={<Wallet className="text-emerald-600" />} trend="Disponível" color="emerald" />
        <SummaryCard title="Entradas (Total)" value={totals.entradas} icon={<ArrowUpRight className="text-blue-600" />} trend="Bruto" color="blue" />
        <SummaryCard title="Saídas (Total)" value={totals.saidas} icon={<ArrowDownRight className="text-red-500" />} trend="Despesas" color="red" />
        <div className="bg-gradient-to-br from-[#002878] to-[#005CB9] p-6 rounded-3xl text-white shadow-xl shadow-blue-900/20 relative overflow-hidden group col-span-1">
          <p className="text-[10px] font-black text-blue-200 uppercase tracking-widest mb-1.5">A Repassar (Nacional)</p>
          <h3 className="text-2xl font-black mb-6">{totals.cotaTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</h3>
          <button onClick={() => setIsGuiaModalOpen(true)} className="w-full py-2 bg-white text-[#002878] rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-blue-50 transition-all">Gerar Guia</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden min-h-[400px]">
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-black text-[#002878] text-sm uppercase tracking-widest flex items-center gap-2">
                <History size={16} /> Movimentações Recentes
              </h3>
            </div>
            <div className="divide-y divide-slate-50">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Loader2 className="animate-spin text-blue-600" />
                  <p className="text-[10px] font-black text-slate-400 uppercase">Lendo Banco de Dados...</p>
                </div>
              ) : lancamentos.length > 0 ? (
                lancamentos.map(l => (
                  <TransactionItem key={l.id} item={l} />
                ))
              ) : (
                <div className="p-20 text-center">
                  <Banknote className="mx-auto text-slate-200 mb-4" size={48} />
                  <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest">Nenhuma movimentação registrada.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-slate-900 rounded-[2rem] p-8 text-white shadow-2xl">
            <div className="flex items-center gap-3 mb-6">
              <QrCode size={24} className="text-[#00A3E0]" />
              <h3 className="font-black text-sm uppercase tracking-widest">Conciliação PIX</h3>
            </div>
            {pendingPix.length > 0 ? (
              <div className="space-y-4">
                <p className="text-xs text-slate-400 font-medium">Pendências identificadas no CNPJ.</p>
                <div className="space-y-2">
                  {pendingPix.map(pix => (
                    <div key={pix.id} className="p-3 bg-white/5 border border-white/10 rounded-xl flex justify-between items-center group">
                      <div>
                        <p className="text-xs font-bold">{pix.nome}</p>
                        <p className="text-[10px] text-emerald-400 font-black">{pix.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                      </div>
                      <button 
                        onClick={() => handleConfirmPix(pix)} 
                        className="p-2 bg-[#00A3E0] text-[#002878] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110 active:scale-95"
                      >
                        <CheckCircle2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-6">
                <CheckCircle2 size={32} className="text-emerald-500 mx-auto mb-2" />
                <p className="text-xs text-slate-500 font-medium">Tudo conciliado.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODAL: NOVO LANÇAMENTO */}
      {isEntryModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden border border-slate-200">
            <header className="px-8 py-6 border-b flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-2xl text-white shadow-lg ${formData.tipo === 'ENTRADA' ? 'bg-emerald-600' : 'bg-red-500'}`}>
                  {formData.tipo === 'ENTRADA' ? <ArrowUpRight size={24} /> : <ArrowDownRight size={24} />}
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 uppercase">Novo Lançamento</h3>
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Tesouraria Local • IELB</p>
                </div>
              </div>
              <button onClick={() => setIsEntryModalOpen(false)} className="p-2 hover:bg-white rounded-full transition-colors text-slate-400">
                <X size={24} />
              </button>
            </header>
            
            <form onSubmit={handleSaveEntry} className="p-8 space-y-6">
              <div className="flex bg-slate-100 p-1.5 rounded-2xl gap-1">
                <button type="button" onClick={() => setFormData({...formData, tipo: 'ENTRADA'})} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${formData.tipo === 'ENTRADA' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>Entrada (+)</button>
                <button type="button" onClick={() => setFormData({...formData, tipo: 'SAIDA'})} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${formData.tipo === 'SAIDA' ? 'bg-red-500 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>Saída (-)</button>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Descrição</label>
                <input type="text" required value={formData.descricao} onChange={(e) => setFormData({...formData, descricao: e.target.value})} placeholder="Ex: Oferta Culto de Domingo" className="w-full px-5 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:border-[#002878] outline-none transition-all" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Valor (R$)</label>
                  <input type="number" step="0.01" required value={formData.valor || ''} onChange={(e) => setFormData({...formData, valor: parseFloat(e.target.value)})} placeholder="0,00" className="w-full px-5 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-black focus:border-[#002878] outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Data</label>
                  <input type="date" required value={formData.data} onChange={(e) => setFormData({...formData, data: e.target.value})} className="w-full px-5 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:border-[#002878] outline-none" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Categoria</label>
                <select value={formData.categoria} onChange={(e) => setFormData({...formData, categoria: e.target.value as CategoriaFinanceira})} className="w-full px-5 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:border-[#002878] outline-none cursor-pointer">
                  {CATEGORIAS.map(cat => (<option key={cat} value={cat}>{CATEGORIA_LABELS[cat]}</option>))}
                </select>
              </div>
              <button type="submit" disabled={isSaving} className={`w-full py-4 text-white rounded-2xl font-black uppercase text-xs tracking-[0.2em] shadow-xl transition-all flex items-center justify-center gap-3 disabled:opacity-50 ${formData.tipo === 'ENTRADA' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-500 hover:bg-red-600'}`}>
                {isSaving ? <Loader2 size={18} className="animate-spin" /> : <><Save size={18} /> Confirmar Lançamento</>}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: GUIA DE RECOLHIMENTO NACIONAL */}
      {isGuiaModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[2.5rem] w-full max-w-2xl shadow-2xl overflow-hidden border border-slate-200">
            <header className="px-8 py-6 border-b flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-[#002878] rounded-2xl text-white shadow-lg">
                  <FileText size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 uppercase">Guia de Repasse Nacional</h3>
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Consolidado Mensal • IELB</p>
                </div>
              </div>
              <button onClick={() => setIsGuiaModalOpen(false)} className="p-2 hover:bg-white rounded-full transition-colors text-slate-400">
                <X size={24} />
              </button>
            </header>
            
            <div className="p-8 space-y-8">
              <div id="guia-recolhimento" className="bg-slate-50 p-8 rounded-3xl border-2 border-dashed border-slate-200 space-y-6">
                <div className="text-center pb-4 border-b border-slate-200">
                  <h4 className="text-sm font-black text-[#002878] uppercase tracking-widest">IELB - Tesouraria Nacional</h4>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Guia de Recolhimento de Cotas Cooperativas</p>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Unidade</p>
                    <p className="text-xs font-bold text-slate-900">Paróquia ID: {activeUnidadeId}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Mês de Referência</p>
                    <p className="text-xs font-bold text-slate-900">{new Date().toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}</p>
                  </div>
                </div>

                <div className="space-y-3 pt-4">
                  <div className="flex justify-between items-center py-2 border-b border-slate-100">
                    <p className="text-xs font-medium text-slate-600">Total de Entradas Brutas (Ofertas/Dízimos)</p>
                    <p className="text-xs font-black text-slate-900">{totals.entradas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <p className="text-xs font-bold text-slate-700">Cota IELB Nacional (6%)</p>
                    <p className="text-xs font-black text-blue-600">{totals.cotaIelb.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <p className="text-xs font-bold text-slate-700">Cota DIVASI (3%)</p>
                    <p className="text-xs font-black text-blue-600">{totals.cotaDivasi.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                  </div>
                  <div className="flex justify-between items-center py-4 bg-[#002878] rounded-xl px-4 mt-4">
                    <p className="text-xs font-black text-white uppercase tracking-widest">Total a Repassar</p>
                    <p className="text-lg font-black text-white">{totals.cotaTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                  </div>
                </div>

                <div className="pt-6 text-center">
                  <p className="text-[8px] text-slate-400 italic">Esta guia é um documento interno para fins de conciliação estatística e fiscal entre a Unidade e o Conselho Nacional da IELB.</p>
                </div>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={handleExportGuia}
                  className="flex-1 py-4 bg-[#002878] text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl hover:bg-[#001A50] transition-all flex items-center justify-center gap-3"
                >
                  <Download size={18} /> Baixar PDF
                </button>
                <button 
                  onClick={() => window.print()}
                  className="px-6 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase text-xs hover:bg-slate-200 transition-all"
                >
                  <Printer size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const SummaryCard: React.FC<{ title: string; value: number; icon: React.ReactNode; trend: string; color: string }> = ({ title, value, icon, trend, color }) => (
  <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-xl hover:shadow-blue-900/5 transition-all">
    <div className="flex items-center justify-between mb-4">
      <div className={`p-3 bg-${color}-50 rounded-2xl text-${color}-600`}>{icon}</div>
      <span className={`text-[10px] font-black uppercase tracking-widest text-${color}-600 bg-${color}-50/50 px-2 py-0.5 rounded`}>{trend}</span>
    </div>
    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{title}</p>
    <h3 className="text-2xl font-black text-slate-900 tracking-tight">
      {value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
    </h3>
  </div>
);

const TransactionItem: React.FC<{ item: Lancamento }> = ({ item }) => (
  <div className="px-8 py-5 flex items-center justify-between group hover:bg-slate-50 transition-colors">
    <div className="flex items-center gap-5">
      <div className={`p-3 rounded-2xl ${item.tipo === 'ENTRADA' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
        {item.tipo === 'ENTRADA' ? <ArrowUpRight size={20} /> : <ArrowDownRight size={20} />}
      </div>
      <div>
        <p className="text-sm font-black text-slate-900">{item.descricao}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{CATEGORIA_LABELS[item.categoria]}</span>
          <span className="w-1 h-1 rounded-full bg-slate-300"></span>
          <span className="text-[10px] text-slate-400 font-medium">{new Date(item.data).toLocaleDateString('pt-BR')}</span>
        </div>
      </div>
    </div>
    <p className={`text-sm font-black ${item.tipo === 'ENTRADA' ? 'text-emerald-600' : 'text-red-500'}`}>
      {item.tipo === 'ENTRADA' ? '+' : '-'} {item.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
    </p>
  </div>
);

export default Finance;
