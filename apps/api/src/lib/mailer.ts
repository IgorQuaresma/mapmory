import nodemailer from 'nodemailer';

export interface Mailer {
  sendMagicLink(to: string, url: string): Promise<void>;
}

export function createMailer(smtpUrl: string, from: string): Mailer {
  const transport = nodemailer.createTransport(smtpUrl);
  return {
    async sendMagicLink(to, url) {
      await transport.sendMail({
        from,
        to,
        subject: 'Your Mapmory sign-in link',
        text: `Hello,\n\nUse this link to sign in to Mapmory. It works once and expires in 15 minutes:\n\n${url}\n\nIf you didn't ask for it, you can ignore this email.\n`,
        html: `<p>Hello,</p><p>Use this link to sign in to Mapmory. It works once and expires in 15 minutes:</p><p><a href="${escapeHtml(url)}">Sign in to Mapmory</a></p><p>If you didn't ask for it, you can ignore this email.</p>`,
      });
    },
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
