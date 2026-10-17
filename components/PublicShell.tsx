import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { MarcaIgreja } from './Logo';

export const inputCls = 'w-full px-4 py-3 bg-slate-50 border-2 border-transparent rounded-2xl focus:border-blue-600 focus:bg-white outline-none transition-all';

const PublicShell: React.FC<{ titulo: string; subtitulo?: string; children: React.ReactNode; wide?: boolean }> = ({ titulo, subtitulo, children, wide }) => (
  <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 py-12">
    <div className={`w-full ${wide ? 'max-w-3xl' : 'max-w-md'} bg-white rounded-[2.5rem] shadow-2xl shadow-blue-900/10 border border-slate-100 p-8 md:p-12`}>
      <Link to="/login" className="inline-flex items-center gap-2 text-slate-400 hover:text-blue-600 font-bold text-sm mb-8"><ArrowLeft size={18} /> Voltar para o login</Link>
      <div className="flex items-center gap-4 mb-8">
        <MarcaIgreja className="h-14 w-auto shrink-0" />
        <div><h1 className="text-2xl font-black text-slate-900 tracking-tight">{titulo}</h1>{subtitulo && <p className="text-slate-500 font-medium text-sm">{subtitulo}</p>}</div>
      </div>
      {children}
    </div>
  </div>
);
export default PublicShell;
