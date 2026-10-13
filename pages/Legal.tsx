import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import PublicShell from '../components/PublicShell';
import { apiService, Legal as LegalT } from '../services/apiService';

const Legal: React.FC = () => {
  const { tipo } = useParams();
  const [d, setD] = useState<LegalT | null>(null);
  useEffect(() => { apiService.getLegal().then(setD).catch(() => setD(null)); }, []);
  const t = d ? (tipo === 'privacidade' ? d.privacidade : d.termos) : null;
  return (
    <PublicShell titulo={t?.titulo || 'Documento legal'} subtitulo={d ? `Versão ${d.versao}` : undefined} wide>
      {!t ? <p className="text-slate-400 font-bold">Carregando...</p> : (
        <div className="space-y-4 text-slate-700 leading-relaxed">{t.paragrafos.map((p, i) => <p key={i}>{p}</p>)}</div>
      )}
    </PublicShell>
  );
};
export default Legal;
