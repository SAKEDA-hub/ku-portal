'use strict';
/*
 * Отправка писем через системный sendmail (на alwaysdata есть на всех машинах, без паролей SMTP в коде).
 *   KU_SENDMAIL — путь к sendmail (по умолчанию /usr/sbin/sendmail); KU_MAIL_FROM — адрес отправителя.
 * Без sendmail письма не уходят: mailReady() === false, функции, которым нужна почта, сообщают об этом пользователю.
 */
const fs = require('fs');
const { spawn } = require('child_process');

const SENDMAIL = process.env.KU_SENDMAIL || '/usr/sbin/sendmail';
const FROM_NAME = 'KU Portal';
const FROM = process.env.KU_MAIL_FROM || 'noreply@ku-portal.alwaysdata.net';
const SEND_TIMEOUT_MS = 20_000;

const mailReady = () => { try { fs.accessSync(SENDMAIL, fs.constants.X_OK); return true; } catch { return false; } };
const encodeWord = text => '=?UTF-8?B?' + Buffer.from(text, 'utf8').toString('base64') + '?=';
const safeHeader = value => String(value).replace(/[\r\n]+/g, ' ').trim(); // перевод строки в заголовке = подмена письма
const wrap = b64 => b64.replace(/.{1,76}/g, line => line + '\r\n');

function buildMessage({ to, subject, text }) {
  return [
    `From: ${encodeWord(FROM_NAME)} <${safeHeader(FROM)}>`,
    `To: <${safeHeader(to)}>`,
    `Subject: ${encodeWord(safeHeader(subject))}`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    'Auto-Submitted: auto-generated',
    '',
    wrap(Buffer.from(text, 'utf8').toString('base64')),
  ].join('\r\n');
}

/* Письмо одному адресату. Адрес проверяется, получатель передаётся в -t через заголовок To (не в аргументах) */
function sendMail({ to, subject, text }) {
  return new Promise((resolve, reject) => {
    if (!/^[^\s<>@,;"]+@[^\s<>@,;"]+\.[^\s<>@,;"]+$/.test(String(to))) return reject(new Error('bad address'));
    const child = spawn(SENDMAIL, ['-t', '-i', '-f', safeHeader(FROM)], { stdio: ['pipe', 'ignore', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), SEND_TIMEOUT_MS);
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve(); else reject(new Error(`sendmail exit ${code}: ${stderr.trim().slice(0, 200)}`));
    });
    child.stdin.on('error', () => {}); // sendmail завершился раньше — ошибку сообщит 'close'/'error', процесс не падает
    child.stdin.end(buildMessage({ to, subject, text }));
  });
}

module.exports = { sendMail, mailReady, buildMessage };
