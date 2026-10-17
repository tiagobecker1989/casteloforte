export const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const dataBr = (d?: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—');
export const mesAtual = () => new Date().toISOString().slice(0, 7);
export const hojeIso = () => new Date().toISOString().slice(0, 10);
export const inputCls = 'px-3 py-2 bg-slate-50 border-2 border-transparent rounded-xl focus:border-blue-600 focus:bg-white outline-none text-sm';
export const cartao = 'bg-white rounded-3xl border border-slate-100';
