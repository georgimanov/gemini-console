// Send email via Gmail SMTP, using GMAIL_USER / GMAIL_PASS from the environment.
import nodemailer from "nodemailer";
import { markdownToHtml } from "./markdown.js";
import { wrapEmailHtml } from "./template.js";
import type { SendMailOptions, SendMailResult } from "./types.js";

export async function sendMail({ to, subject, body, format = "text" }: SendMailOptions): Promise<SendMailResult> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_PASS;
  if (!user || !pass) {
    throw new Error("GMAIL_USER / GMAIL_PASS are not set.");
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user, pass },
  });

  const mailOptions: Parameters<typeof transporter.sendMail>[0] = {
    from: `"AI Coach" <${user}>`,
    to,
    subject,
    text: body,
  };

  if (format === "markdown") {
    mailOptions.html = wrapEmailHtml(subject, markdownToHtml(body));
  } else if (format === "html") {
    mailOptions.html = wrapEmailHtml(subject, body);
  }

  const info = await transporter.sendMail(mailOptions);
  return { messageId: info.messageId };
}
