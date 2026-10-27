/**
 * Envío de mails (códigos de verificación y avisos de las solicitudes). Mismo criterio que
 * mapa-pronostico (mapa-backend/src/lib/correo.js): se usa la vía que esté configurada.
 *
 *  - MAIL_PROVIDER=consola: no envía; muestra el mail en la consola de la API. Solo desarrollo.
 *  - Gmail (SMTP con contraseña de aplicación): GMAIL_USER y GMAIL_APP_PASSWORD.
 *  - Microsoft 365 (API Graph, casilla institucional): MS_TENANT_ID, MS_CLIENT_ID,
 *    MS_CLIENT_SECRET y MAIL_FROM. El permiso de la aplicación alcanza con Mail.Send.
 *
 * MAIL_FROM_NOMBRE es cómo se ve el remitente.
 */
import nodemailer from 'nodemailer';

export interface Mail {
  para: string;
  asunto: string;
  /** Texto plano: siempre va, es lo que leen los clientes de correo sin HTML. */
  texto: string;
  html?: string;
}

const env = (k: string) => (process.env[k] ?? '').trim();
const nombreRemitente = () => env('MAIL_FROM_NOMBRE') || 'Ministerio de Ecología de Misiones';

export class ErrorCorreo extends Error {}

type Via = 'consola' | 'gmail' | 'microsoft';

function via(): Via | null {
  if (env('MAIL_PROVIDER') === 'consola') return 'consola';
  if (env('GMAIL_USER') && env('GMAIL_APP_PASSWORD')) return 'gmail';
  if (env('MS_TENANT_ID') && env('MS_CLIENT_ID') && env('MS_CLIENT_SECRET') && env('MAIL_FROM')) return 'microsoft';
  return null;
}

export const correoConfigurado = () => via() !== null;

let transporte: nodemailer.Transporter | null = null;

async function enviarGmail(m: Mail) {
  transporte ??= nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: env('GMAIL_USER'), pass: env('GMAIL_APP_PASSWORD').replace(/\s+/g, '') },
    connectionTimeout: 20_000,
    socketTimeout: 60_000,
  });
  try {
    await transporte.sendMail({
      from: { name: nombreRemitente(), address: env('GMAIL_USER') },
      to: m.para,
      subject: m.asunto,
      text: m.texto,
      html: m.html,
    });
  } catch (e) {
    throw new ErrorCorreo(`Gmail no pudo enviar el mail: ${(e as Error).message}`);
  }
}

let tokenGraph: { valor: string; vence: number } | null = null;

async function tokenMicrosoft() {
  if (tokenGraph && tokenGraph.vence > Date.now()) return tokenGraph.valor;
  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(env('MS_TENANT_ID'))}/oauth2/v2.0/token`, {
    method: 'POST',
    body: new URLSearchParams({
      client_id: env('MS_CLIENT_ID'),
      client_secret: env('MS_CLIENT_SECRET'),
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!res.ok || !json.access_token) throw new ErrorCorreo(`Microsoft no entregó el token (${res.status}).`);
  tokenGraph = { valor: json.access_token, vence: Date.now() + (Number(json.expires_in ?? 3600) - 120) * 1000 };
  return tokenGraph.valor;
}

async function enviarMicrosoft(m: Mail) {
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(env('MAIL_FROM'))}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await tokenMicrosoft()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject: m.asunto,
        body: m.html ? { contentType: 'HTML', content: m.html } : { contentType: 'Text', content: m.texto },
        toRecipients: [{ emailAddress: { address: m.para } }],
      },
      saveToSentItems: true,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new ErrorCorreo(`Microsoft respondió ${res.status} al enviar el mail.`);
}

export async function enviarCorreo(m: Mail): Promise<void> {
  switch (via()) {
    case 'consola':
      console.log(`\n✉️  [correo de desarrollo] Para: ${m.para}\n    Asunto: ${m.asunto}\n${m.texto.replace(/^/gm, '    ')}\n`);
      return;
    case 'gmail':
      return enviarGmail(m);
    case 'microsoft':
      return enviarMicrosoft(m);
    default:
      throw new ErrorCorreo(
        'El envío de mails no está configurado: falta GMAIL_USER/GMAIL_APP_PASSWORD o los datos de Microsoft 365 (o MAIL_PROVIDER=consola en desarrollo).',
      );
  }
}

const escapar = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Arma un mail con la marca del ministerio: título, párrafos, un botón opcional y pie.
 * Todo el texto se escapa; el HTML lo arma solo esta función.
 */
export function plantilla(opciones: {
  para: string;
  asunto: string;
  titulo: string;
  parrafos: string[];
  boton?: { texto: string; url: string };
  pie?: string;
}): Mail {
  const { para, asunto, titulo, parrafos, boton, pie } = opciones;
  const piePorDefecto = 'Ministerio de Ecología y Recursos Naturales Renovables · Misiones';
  const texto = [titulo, '', ...parrafos.flatMap((p) => [p, '']), ...(boton ? [`${boton.texto}: ${boton.url}`, ''] : []), pie ?? piePorDefecto].join('\n');
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#faf4eb;font-family:Arial,Helvetica,sans-serif;color:#21130d">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf4eb;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e4dac6;border-radius:16px;overflow:hidden">
<tr><td style="background:#3e6c51;padding:20px 28px;color:#ffffff;font-size:13px;letter-spacing:.12em;text-transform:uppercase">Ecología Misiones</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 16px;font-size:22px;font-weight:600;color:#2f5540">${escapar(titulo)}</h1>
${parrafos.map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.5">${escapar(p)}</p>`).join('\n')}
${boton ? `<p style="margin:24px 0"><a href="${escapar(boton.url)}" style="display:inline-block;background:#3e6c51;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600">${escapar(boton.texto)}</a></p>
<p style="margin:0;font-size:12px;color:#6b6152">Si el botón no funciona, copiá este enlace en el navegador:<br>${escapar(boton.url)}</p>` : ''}
</td></tr>
<tr><td style="border-top:1px solid #e4dac6;padding:16px 28px;font-size:12px;color:#6b6152">${escapar(pie ?? piePorDefecto)}</td></tr>
</table></td></tr></table></body></html>`;
  return { para, asunto, texto, html };
}
