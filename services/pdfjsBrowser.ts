/** Carrega o pdf.js só quando o usuário escolhe um PDF (mantém o resto do site leve). */
export async function carregarPdfJs() {
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  return pdfjs;
}
