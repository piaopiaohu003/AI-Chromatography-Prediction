'use strict';

/* Minimal SMTP client (no npm dependencies) used for password-reset mail.
 *
 * Configuration via environment variables:
 *   CHROM_SMTP_URL  smtp://[user:pass@]host[:port]  or  smtps://... (implicit TLS)
 *   CHROM_MAIL_FROM envelope/header sender (default: derived from URL user,
 *                   otherwise chromai@<host>)
 *
 * If CHROM_SMTP_URL is not set, sendMail() resolves with { sent: false } and
 * the caller is expected to log/expose the token through a debug channel.
 * STARTTLS is intentionally not supported — use smtps:// for TLS servers. */

const net = require('net');
const tls = require('tls');

const CRLF = '\r\n';

function parseSmtpUrl(raw) {
  let u = String(raw || '').trim();
  if (!/^smtps?:\/\//i.test(u)) u = `smtp://${u}`;
  const parsed = new URL(u);
  const tlsEnabled = parsed.protocol === 'smtps:';
  return {
    host: parsed.hostname,
    port: Number(parsed.port) || (tlsEnabled ? 465 : 25),
    user: decodeURIComponent(parsed.username || ''),
    pass: decodeURIComponent(parsed.password || ''),
    tls: tlsEnabled,
  };
}

function configFromEnv() {
  if (!process.env.CHROM_SMTP_URL) return null;
  const cfg = parseSmtpUrl(process.env.CHROM_SMTP_URL);
  cfg.from = process.env.CHROM_MAIL_FROM
    || (cfg.user && cfg.user.includes('@') ? cfg.user : `chromai@${cfg.host}`);
  return cfg;
}

function readReply(socket) {
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    const onData = (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      const text = buf.toString('utf8');
      // A complete reply ends with "NNN <text>\r\n" where the code is not
      // followed by a hyphen (multi-line continuation).
      const lines = text.split(CRLF).filter((l) => l.length > 0);
      const last = lines[lines.length - 1];
      if (text.endsWith(CRLF) && /^\d{3} /.test(last)) {
        cleanup();
        resolve({ code: Number(last.slice(0, 3)), text });
      }
    };
    const onError = (e) => { cleanup(); reject(e); };
    const cleanup = () => {
      socket.off('data', onData);
      socket.off('error', onError);
    };
    socket.on('data', onData);
    socket.once('error', onError);
  });
}

async function expect(socket, command, okCodes) {
  if (command !== null) socket.write(command + CRLF);
  const reply = await readReply(socket);
  if (!okCodes.includes(reply.code)) {
    throw new Error(`SMTP ${command ? command.split(' ')[0] : 'CONNECT'} failed: ${reply.text.trim()}`);
  }
  return reply;
}

function encodeSubject(subject) {
  // RFC 2047 encoded-word for non-ASCII subjects (UTF-8 base64).
  if (/^[\x20-\x7e]*$/.test(subject)) return subject;
  return `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
}

function dotStuff(text) {
  return text.split(/\r?\n/).map((line) => (line.startsWith('.') ? `.${line}` : line)).join(CRLF);
}

async function sendMail({ to, subject, text }) {
  const cfg = configFromEnv();
  if (!cfg) return { sent: false, reason: 'smtp-not-configured' };

  const connect = cfg.tls ? tls.connect.bind(tls) : net.connect.bind(net);
  const socket = await new Promise((resolve, reject) => {
    const s = connect({ host: cfg.host, port: cfg.port, servername: cfg.host, timeout: 5000 });
    s.once(cfg.tls ? 'secureConnect' : 'connect', () => resolve(s));
    s.once('error', reject);
    s.once('timeout', () => s.destroy(new Error('smtp connect timeout')));
  });
  socket.setTimeout(8000);

  try {
    await expect(socket, null, [220]);
    await expect(socket, `EHLO chromai.local`, [250]);
    if (cfg.user) {
      await expect(socket, 'AUTH LOGIN', [334]);
      await expect(socket, Buffer.from(cfg.user, 'utf8').toString('base64'), [334]);
      await expect(socket, Buffer.from(cfg.pass || '', 'utf8').toString('base64'), [235]);
    }
    await expect(socket, `MAIL FROM:<${cfg.from}>`, [250]);
    await expect(socket, `RCPT TO:<${to}>`, [250, 251]);
    await expect(socket, 'DATA', [354]);
    const message = [
      `From: ${cfg.from}`,
      `To: ${to}`,
      `Subject: ${encodeSubject(subject)}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      dotStuff(text),
      '.',
    ].join(CRLF);
    await expect(socket, message, [250]);
    socket.write(`QUIT${CRLF}`);
    return { sent: true };
  } finally {
    try { socket.end(); } catch { /* ignore */ }
    try { socket.destroy(); } catch { /* ignore */ }
  }
}

module.exports = { sendMail, configFromEnv };
