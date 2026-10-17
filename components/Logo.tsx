import React from 'react';

const ALT = 'Igreja Evangélica Luterana do Brasil - Castelo Forte, Sapiranga/RS';

/** Logotipo completo (prédio + nome da igreja). Use sobre fundo claro. */
export const LogoCompleto: React.FC<{ className?: string }> = ({ className = 'h-40 w-auto' }) => (
  <img src="/logo-castelo-forte.png" alt={ALT} width={177} height={177} className={className} decoding="async" />
);

/** Só o desenho da igreja, para cabeçalhos pequenos. */
export const MarcaIgreja: React.FC<{ className?: string; decorativa?: boolean }> = ({ className = 'h-10 w-auto', decorativa }) => (
  <img src="/marca-igreja.png" alt={decorativa ? '' : ALT} width={177} height={129} className={className} decoding="async" />
);
