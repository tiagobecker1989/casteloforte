import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import app from './server/app';
import { rodarCobranca } from './server/billing';
import { limparLimites } from './server/auth';
import { sincronizarTodas } from './server/banco';

// Servidor LOCAL / VPS (npm run dev | npm start). Na Vercel a entrada é server/vercel.ts (ver DEPLOY-VERCEL.md).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Cobrança: gera faturas do mês e atualiza inadimplência ao subir e a cada 6 horas
const tarefa = () => rodarCobranca().then(() => sincronizarTodas()).then(limparLimites).catch(e => console.error('Falha na rotina de cobrança:', e));
tarefa();
setInterval(tarefa, 6 * 60 * 60_000).unref();

if (process.env.NODE_ENV !== 'production') {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.resolve(__dirname, 'dist')));
  app.get('/{*splat}', (_req, res) => { res.sendFile(path.resolve(__dirname, 'dist', 'index.html')); });
}
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
