export type MailFormat = "text" | "markdown" | "html";

export interface SendMailOptions {
  to: string;
  subject: string;
  body: string;
  /** "markdown" renders body through the markdown-to-HTML template; "html" wraps body as-is; "text" sends plain text only. */
  format?: MailFormat;
}

export interface SendMailResult {
  messageId: string;
}
