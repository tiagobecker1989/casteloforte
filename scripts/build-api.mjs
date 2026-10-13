// Empacota a API (Express + todo o código do servidor) em UM arquivo: api/index.js, a função da Vercel.
// Assim não dependemos de como a Vercel resolve imports TypeScript/ESM.
import { build } from 'esbuild';

await build({
  entryPoints: ['server/vercel.ts'],
  outfile: 'api/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: false,
  minify: false,
  logLevel: 'info',
  // pg-native é opcional do pg; pglite é só para testes locais (carregado dinamicamente)
  external: ['pg-native', '@electric-sql/pglite', 'node:sqlite'],
  banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
});
