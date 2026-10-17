import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { User, Mail, Lock, Building, ArrowLeft, Send, MapPin, Phone, CheckCircle2 } from 'lucide-react';
import { MarcaIgreja } from '../components/Logo';
import { apiService } from '../services/apiService';

const inputCls = 'w-full pl-12 pr-4 py-3 bg-slate-50 border-2 border-transparent rounded-2xl focus:border-blue-600 focus:bg-white outline-none transition-all';

const Field: React.FC<{ label: string; icon: any; span?: boolean; children: React.ReactNode }> = ({ label, icon: Icon, span, children }) => (
  <div className={`space-y-1 ${span ? 'md:col-span-2' : ''}`}>
    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">{label}</label>
    <div className="relative"><Icon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />{children}</div>
  </div>
);

const Register: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState('');
  const [aceitou, setAceitou] = useState(false);
  const [f, setF] = useState({ cpfCnpj: '', paroquia: '', tipo: 'PAROQUIA', distrito: '', endereco: '', contato: '', pastor: '', nome: '', email: '', senha: '', senha2: '' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<any>) => setF(p => ({ ...p, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');
    if (f.senha.length < 8) return setErro('A senha deve ter ao menos 8 caracteres.');
    if (f.senha !== f.senha2) return setErro('As senhas não conferem.');
    if (!aceitou) return setErro('É necessário aceitar os Termos de Uso e a Política de Privacidade.');
    setLoading(true);
    try {
      await apiService.solicitarCadastro(
        { cpfCnpj: f.cpfCnpj || undefined, nome: f.paroquia, tipo: f.tipo as any, distrito: f.distrito, endereco: f.endereco, contato: f.contato, pastores: f.pastor ? [f.pastor] : [] },
        { nome: f.nome, email: f.email, senha: f.senha },
        aceitou,
      );
      setEnviado(true);
    } catch (err: any) {
      setErro(err.message || 'Não foi possível enviar a solicitação.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="bg-white rounded-[2.5rem] shadow-2xl shadow-blue-900/10 overflow-hidden border border-slate-100 p-8 md:p-12">
          <Link to="/login" className="inline-flex items-center gap-2 text-slate-400 hover:text-blue-600 font-bold text-sm mb-8 transition-colors"><ArrowLeft size={18} /> Voltar para Login</Link>

          {enviado ? (
            <div className="text-center py-8 space-y-4">
              <CheckCircle2 className="mx-auto text-emerald-500" size={56} />
              <h1 className="text-2xl font-black text-slate-900">Solicitação enviada!</h1>
              <p className="text-slate-500 font-medium">A sede da IELB Castelo Forte irá analisar o cadastro de <b>{f.paroquia}</b>. Assim que for aprovado, você poderá entrar com o e-mail e a senha informados.</p>
              <Link to="/login" className="inline-block mt-4 bg-[#002878] text-white px-8 py-3 rounded-2xl font-bold">Ir para o login</Link>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-6 mb-10">
                <MarcaIgreja className="h-14 w-auto shrink-0" />
                <div>
                  <h1 className="text-2xl font-black text-slate-900 tracking-tight">Cadastrar paróquia</h1>
                  <p className="text-slate-500 font-medium">Os dados da sua paróquia ficam isolados das demais.</p>
                </div>
              </div>
              <form className="grid grid-cols-1 md:grid-cols-2 gap-6" onSubmit={submit}>
                <p className="md:col-span-2 text-xs font-black text-[#002878] uppercase tracking-widest">Dados da paróquia</p>
                <Field label="Nome" icon={Building} span><input required value={f.paroquia} onChange={set('paroquia')} placeholder="Ex.: Paróquia Bom Pastor" className={inputCls} /></Field>
                <Field label="Tipo" icon={Building}>
                  <select value={f.tipo} onChange={set('tipo')} className={inputCls + ' appearance-none cursor-pointer'}>
                    <option value="PAROQUIA">Paróquia</option><option value="COMUNIDADE">Comunidade</option>
                  </select>
                </Field>
                <Field label="Distrito" icon={MapPin}><input value={f.distrito} onChange={set('distrito')} placeholder="Ex.: Porto Alegre" className={inputCls} /></Field>
                <Field label="Endereço" icon={MapPin} span><input value={f.endereco} onChange={set('endereco')} className={inputCls} /></Field>
                <Field label="CNPJ (opcional agora)" icon={Building}><input value={f.cpfCnpj} onChange={set('cpfCnpj')} placeholder="00.000.000/0000-00" inputMode="numeric" className={inputCls} /></Field>
                <Field label="Telefone" icon={Phone}><input value={f.contato} onChange={set('contato')} className={inputCls} /></Field>
                <Field label="Pastor titular" icon={User}><input value={f.pastor} onChange={set('pastor')} className={inputCls} /></Field>

                <p className="md:col-span-2 text-xs font-black text-[#002878] uppercase tracking-widest mt-4">Responsável pelo acesso (administrador)</p>
                <Field label="Nome completo" icon={User} span><input required value={f.nome} onChange={set('nome')} className={inputCls} /></Field>
                <Field label="E-mail" icon={Mail} span><input required type="email" value={f.email} onChange={set('email')} className={inputCls} /></Field>
                <Field label="Senha" icon={Lock}><input required type="password" minLength={8} value={f.senha} onChange={set('senha')} placeholder="mín. 8 caracteres" className={inputCls} /></Field>
                <Field label="Confirmar senha" icon={Lock}><input required type="password" value={f.senha2} onChange={set('senha2')} className={inputCls} /></Field>

                <label className="md:col-span-2 flex items-start gap-3 text-sm text-slate-600">
                  <input type="checkbox" checked={aceitou} onChange={e => setAceitou(e.target.checked)} className="mt-1" />
                  <span>Li e aceito os <a href="#/legal/termos" target="_blank" rel="noreferrer" className="text-blue-600 underline font-bold">Termos de Uso</a> e a <a href="#/legal/privacidade" target="_blank" rel="noreferrer" className="text-blue-600 underline font-bold">Política de Privacidade</a>.</span>
                </label>
                {erro && <p role="alert" className="md:col-span-2 text-sm font-bold text-red-600 bg-red-50 rounded-xl px-4 py-3">{erro}</p>}
                <div className="md:col-span-2 pt-2">
                  <button type="submit" disabled={loading} className="w-full bg-[#002878] hover:bg-[#001A50] text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-xl shadow-blue-900/20 disabled:opacity-50">
                    <Send size={18} />{loading ? 'Enviando...' : 'Enviar solicitação de cadastro'}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Register;
