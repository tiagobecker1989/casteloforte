import nodemailer, { type Transporter } from 'nodemailer';

/**
 * E-mail transacional. Com SMTP_HOST configurado envia de verdade; sem ele (desenvolvimento)
 * apenas escreve a mensagem no console, para você copiar o link de recuperação.
 */
const APP_URL = (process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000')).replace(/\/$/, '');
export const linkApp = (hash: string) => `${APP_URL}/#/${hash.replace(/^\//, '')}`;

let transporter: Transporter | null = null;
if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === '1',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}
const FROM = process.env.MAIL_FROM || 'Castelo Forte <nao-responder@localhost>';

export async function enviarEmail(para: string, assunto: string, texto: string): Promise<void> {
  if (!transporter) { console.log(`\n[email simulado] Para: ${para}\nAssunto: ${assunto}\n${texto}\n`); return; }
  try { await transporter.sendMail({ from: FROM, to: para, subject: assunto, text: texto }); }
  catch (e) { console.error('Falha ao enviar e-mail:', (e as Error).message); } // nunca derruba a requisição
}
