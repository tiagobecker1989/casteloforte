export const TIPOS_PARENTESCO: { id: string; label: string }[] = [
  { id: 'CONJUGE', label: 'Cônjuge' }, { id: 'PAI_MAE', label: 'Pai/Mãe' }, { id: 'FILHO', label: 'Filho(a)' }, { id: 'IRMAO', label: 'Irmão(ã)' },
  { id: 'AVO', label: 'Avô/Avó' }, { id: 'NETO', label: 'Neto(a)' }, { id: 'TIO', label: 'Tio(a)' }, { id: 'SOBRINHO', label: 'Sobrinho(a)' },
  { id: 'PRIMO', label: 'Primo(a)' }, { id: 'SOGRO', label: 'Sogro(a)' }, { id: 'GENRO_NORA', label: 'Genro/Nora' }, { id: 'CUNHADO', label: 'Cunhado(a)' }, { id: 'OUTRO', label: 'Outro parentesco' },
];
export const rotuloParentesco = (id: string) => TIPOS_PARENTESCO.find(t => t.id === id)?.label ?? id;
