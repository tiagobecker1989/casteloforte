
import React, { useState, useRef, useEffect } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  FileDown, 
  Plus, 
  Filter,
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  Loader2,
  X,
  Save,
  Type as TypeIcon
} from 'lucide-react';
// @ts-ignore
import html2pdf from 'html2pdf.js';
import { apiService } from '../services/apiService';
import { Evento, EventoTipo } from '../types';

type ViewType = 'YEAR' | 'MONTH' | 'WEEK' | 'DAY';

const CalendarPage: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(new Date()); 
  const [view, setView] = useState<ViewType>('MONTH');
  const [isExporting, setIsExporting] = useState(false);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [localEvents, setLocalEvents] = useState<Evento[]>([]);
  useEffect(() => { apiService.getEventos().then(setLocalEvents).catch(() => setLocalEvents([])); }, []);

  const [newEvent, setNewEvent] = useState<Partial<Evento>>({
    titulo: '',
    tipo: 'CULTO',
    data: new Date().toISOString().split('T')[0],
    horario: '09:00',
    descricao: ''
  });

  const calendarRef = useRef<HTMLDivElement>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const daysOfWeek = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  const getDaysInMonth = (month: number, year: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (month: number, year: number) => new Date(year, month, 1).getDay();

  const handlePrev = () => {
    const d = new Date(currentDate);
    if (view === 'YEAR') d.setFullYear(d.getFullYear() - 1);
    else if (view === 'MONTH') d.setMonth(d.getMonth() - 1);
    else if (view === 'WEEK') d.setDate(d.getDate() - 7);
    else d.setDate(d.getDate() - 1);
    setCurrentDate(d);
  };

  const handleNext = () => {
    const d = new Date(currentDate);
    if (view === 'YEAR') d.setFullYear(d.getFullYear() + 1);
    else if (view === 'MONTH') d.setMonth(d.getMonth() + 1);
    else if (view === 'WEEK') d.setDate(d.getDate() + 7);
    else d.setDate(d.getDate() + 1);
    setCurrentDate(d);
  };

  const getEventsForDate = (dateStr: string) => localEvents.filter(e => e.data === dateStr);

  const renderMonthGrid = (monthIdx: number, year: number, isPrint = false) => {
    const daysInMonth = getDaysInMonth(monthIdx, year);
    const firstDay = getFirstDayOfMonth(monthIdx, year);
    const calendarDays = [];
    for (let i = 0; i < firstDay; i++) calendarDays.push(null);
    for (let i = 1; i <= daysInMonth; i++) calendarDays.push(i);

    return (
      <div className={`bg-white rounded-2xl border border-slate-200 overflow-hidden ${isPrint ? 'shadow-none border-slate-300' : 'shadow-xl'}`}>
        <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/50">
          {daysOfWeek.map(d => (
            <div key={d} className="py-2 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {calendarDays.map((day, idx) => {
            const dateStr = day ? `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : '';
            const events = day ? getEventsForDate(dateStr) : [];
            return (
              <div key={idx} className={`${isPrint ? 'min-h-[70px]' : 'min-h-[100px]'} p-2 border-b border-r border-slate-50 ${!day ? 'bg-slate-50/10' : 'bg-white'}`}>
                {day && (
                  <div className="flex flex-col h-full">
                    <span className="text-[10px] font-black text-slate-400 mb-1">{day}</span>
                    <div className="space-y-1">
                      {events.slice(0, isPrint ? 3 : 5).map(e => (
                        <div key={e.id} className={`text-[8px] p-1 rounded font-bold border truncate ${
                          e.tipo === 'CULTO' ? 'bg-blue-50 text-[#002878] border-blue-100' : 'bg-slate-50 text-slate-600'
                        }`}>
                          {e.horario} {e.titulo}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderDayDetail = (date: Date) => {
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const events = getEventsForDate(dateStr);
    return (
      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-xl">
        <div className="flex items-center gap-6 mb-8 border-b pb-6">
          <div className="bg-[#002878] text-white p-4 rounded-2xl text-center min-w-[80px]">
            <p className="text-[8px] font-black uppercase tracking-widest opacity-80">{daysOfWeek[date.getDay()]}</p>
            <p className="text-3xl font-black">{date.getDate()}</p>
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900">{months[date.getMonth()]} {date.getFullYear()}</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{events.length} Eventos Agendados</p>
          </div>
        </div>
        <div className="space-y-6">
          {events.length > 0 ? events.map(e => (
            <div key={e.id} className="flex gap-6 border-l-2 border-slate-100 pl-6 relative">
              <div className="absolute -left-[5px] top-0 w-2 h-2 rounded-full bg-[#00A3E0]"></div>
              <div className="flex-1 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-black text-slate-800 text-sm">{e.titulo}</h4>
                  <span className="text-[10px] bg-white px-2 py-1 rounded-lg border font-black text-[#002878]">{e.horario}</span>
                </div>
                <p className="text-xs text-slate-500 font-medium">{e.descricao || 'Sem descrição registrada.'}</p>
              </div>
            </div>
          )) : <p className="text-center py-10 text-slate-400 font-bold uppercase text-[10px]">Sem atividades para este dia.</p>}
        </div>
      </div>
    );
  };

  const handleExportPDF = async () => {
    setIsExporting(true);
    
    // Robust detection of html2pdf function
    const html2pdfLib = (window as any).html2pdf || html2pdf;
    const pdfFunc = typeof html2pdfLib === 'function' ? html2pdfLib : (html2pdfLib as any)?.default;
    
    if (typeof pdfFunc !== 'function') {
      console.error("PDF generator library not found or invalid", html2pdfLib);
      setIsExporting(false);
      alert("Erro ao carregar o gerador de PDF. Por favor, tente recarregar a página.");
      return;
    }

    const container = printRef.current;
    if (!container) return;
    
    container.innerHTML = ''; 
    container.style.display = 'block';

    const year = currentDate.getFullYear();
    const currentMonthIdx = currentDate.getMonth();

    const addHeader = (title: string) => {
      const header = document.createElement('div');
      header.style.textAlign = 'center';
      header.style.marginBottom = '20px';
      header.style.paddingBottom = '15px';
      header.style.borderBottom = '3px solid #002878';
      header.innerHTML = `
        <h1 style="font-size: 24px; font-weight: 900; color: #002878; margin: 0; text-transform: uppercase; font-family: 'Inter', sans-serif;">IELB - Planejamento Paroquial</h1>
        <h2 style="font-size: 16px; font-weight: 700; color: #64748b; margin: 4px 0; font-family: 'Inter', sans-serif;">${title}</h2>
        <p style="font-size: 11px; color: #94a3b8; font-weight: bold; margin: 0; font-family: 'Inter', sans-serif;">Paróquia Bom Pastor • Emitido em ${new Date().toLocaleDateString()}</p>
      `;
      return header;
    };

    const addPage = (contentHTML: string, title: string) => {
      const page = document.createElement('div');
      page.style.pageBreakAfter = 'always';
      page.style.backgroundColor = 'white';
      page.style.padding = '15mm';
      page.appendChild(addHeader(title));
      
      const content = document.createElement('div');
      content.innerHTML = contentHTML;
      page.appendChild(content);
      container.appendChild(page);
    };

    try {
      if (view === 'YEAR') {
        for (let m = 0; m < 12; m++) {
          const gridId = `grid-m-${m}`;
          const gridElement = document.getElementById(gridId);
          if (gridElement) {
            addPage(gridElement.innerHTML, `Calendário Mensal - ${months[m].toUpperCase()} ${year}`);
          }
        }
      } else if (view === 'MONTH') {
        const gridId = `grid-m-${currentMonthIdx}`;
        const gridElement = document.getElementById(gridId);
        if (gridElement) {
          addPage(gridElement.innerHTML, `Planejamento Mensal - ${months[currentMonthIdx].toUpperCase()} ${year}`);
        }
      } else {
        addPage(calendarRef.current?.innerHTML || '', `Planejamento de Atividades - ${year}`);
      }

      const opt = {
        margin: 0,
        filename: `IELB-Agenda-${view}-${year}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
      };

      // Ensure proper method chaining sequence: set -> from -> save
      await pdfFunc().set(opt).from(container).save();
    } catch (e) {
      console.error("Export failed:", e);
      alert("Ocorreu um erro ao gerar o PDF. Verifique os dados e tente novamente.");
    } finally {
      container.style.display = 'none';
      setIsExporting(false);
    }
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const saved = await apiService.saveEvento(newEvent);
      setLocalEvents(prev => [...prev, saved]);
    } catch (err: any) {
      alert(err.message || 'Não foi possível salvar o evento.');
      return;
    }
    setIsEventModalOpen(false);
    setNewEvent({
      titulo: '',
      tipo: 'CULTO',
      data: new Date().toISOString().split('T')[0],
      horario: '09:00',
      descricao: ''
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-[#002878] tracking-tight">Agenda Paroquial</h2>
          <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest mt-1">Sincronizado com Diretoria Nacional</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleExportPDF}
            disabled={isExporting}
            className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 text-slate-700 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-50 transition-all shadow-sm active:scale-95"
          >
            {isExporting ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} className="text-[#00A3E0]" />}
            Exportar {view} (PDF)
          </button>
          <button 
            onClick={() => setIsEventModalOpen(true)}
            className="flex items-center gap-2 px-6 py-3 bg-[#002878] text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl hover:bg-[#001A50] transition-all"
          >
            <Plus size={16} /> Novo Evento
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white p-4 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex items-center bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
          {(['YEAR', 'MONTH', 'WEEK', 'DAY'] as ViewType[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                view === v ? 'bg-white text-[#002878] shadow-lg border border-slate-200' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {v === 'YEAR' ? 'Ano' : v === 'MONTH' ? 'Mês' : v === 'WEEK' ? 'Semana' : 'Dia'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-8">
          <button onClick={handlePrev} className="p-2.5 bg-slate-50 hover:bg-blue-50 text-slate-400 hover:text-[#002878] rounded-xl transition-all border border-slate-100">
            <ChevronLeft size={20} />
          </button>
          <h3 className="text-xl font-black text-slate-900 min-w-[200px] text-center uppercase tracking-tight">
            {view === 'YEAR' ? currentDate.getFullYear() : 
             view === 'MONTH' ? `${months[currentDate.getMonth()]} ${currentDate.getFullYear()}` :
             view === 'WEEK' ? `Semana ${currentDate.getDate()}/${currentDate.getMonth() + 1}` :
             `${currentDate.getDate()} de ${months[currentDate.getMonth()]}`}
          </h3>
          <button onClick={handleNext} className="p-2.5 bg-slate-50 hover:bg-blue-50 text-slate-400 hover:text-[#002878] rounded-xl transition-all border border-slate-100">
            <ChevronRight size={20} />
          </button>
        </div>
        
        <button className="flex items-center gap-2 px-4 py-2 bg-slate-50 text-slate-500 font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-blue-50 hover:text-[#002878] transition-all border border-slate-100">
          <Filter size={14} />
          Filtros
        </button>
      </div>

      <div ref={calendarRef}>
        {view === 'YEAR' && (
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {months.map((m, i) => (
                <div key={i} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                  <h4 className="font-bold text-slate-800 mb-2 text-center text-xs uppercase">{m}</h4>
                  <div id={`grid-m-${i}`}>
                    {renderMonthGrid(i, currentDate.getFullYear())}
                  </div>
                </div>
              ))}
           </div>
        )}
        {view === 'MONTH' && (
          <div id={`grid-m-${currentDate.getMonth()}`}>
            {renderMonthGrid(currentDate.getMonth(), currentDate.getFullYear())}
          </div>
        )}
        {view === 'DAY' && (
          <div className="day-view-container">
            {renderDayDetail(currentDate)}
          </div>
        )}
      </div>

      <div 
        ref={printRef} 
        style={{ 
          display: 'none', 
          position: 'absolute', 
          left: '-9999px', 
          width: '297mm', 
          backgroundColor: 'white' 
        }}
      ></div>

      {isEventModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
           <div className="bg-white rounded-[2.5rem] w-full max-w-xl shadow-2xl overflow-hidden border border-slate-200">
              <header className="px-8 py-6 border-b flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-[#002878] rounded-2xl text-white shadow-lg">
                    <CalendarIcon size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 uppercase">Novo Evento Paroquial</h3>
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Lançamento em tempo real</p>
                  </div>
                </div>
                <button onClick={() => setIsEventModalOpen(false)} className="p-2 hover:bg-white rounded-full transition-colors text-slate-400">
                  <X size={24} />
                </button>
              </header>
              <form onSubmit={handleSaveEvent} className="p-8 space-y-6">
                <div className="space-y-1.5">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Título</label>
                   <input 
                      type="text" 
                      required 
                      value={newEvent.titulo}
                      onChange={(e) => setNewEvent({...newEvent, titulo: e.target.value})}
                      placeholder="Ex: Culto da Colheita"
                      className="w-full px-5 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:border-[#002878] outline-none" 
                   />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Horário</label>
                     <input type="time" required value={newEvent.horario} onChange={(e) => setNewEvent({...newEvent, horario: e.target.value})} className="w-full px-5 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:border-[#002878] outline-none" />
                  </div>
                  <div className="space-y-1.5">
                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Data</label>
                     <input type="date" required value={newEvent.data} onChange={(e) => setNewEvent({...newEvent, data: e.target.value})} className="w-full px-5 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:border-[#002878] outline-none" />
                  </div>
                </div>
                <div className="space-y-1.5">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Descrição</label>
                   <textarea 
                      placeholder="Detalhes opcionais..." 
                      className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl h-24 resize-none text-sm font-medium focus:border-[#002878] outline-none"
                      value={newEvent.descricao}
                      onChange={(e) => setNewEvent({...newEvent, descricao: e.target.value})}
                   />
                </div>
                <button type="submit" className="w-full py-4 bg-[#002878] text-white rounded-2xl font-black uppercase tracking-widest shadow-xl hover:bg-[#001A50] transition-all">Gravar na Agenda</button>
              </form>
           </div>
        </div>
      )}
    </div>
  );
};

export default CalendarPage;
