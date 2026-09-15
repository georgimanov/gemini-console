// Wraps rendered HTML content in the coaching email chrome (header/footer, table layout
// for email-client compatibility). Ported from ai-coach/tools/send_email.js.
export function wrapEmailHtml(subject: string, htmlContent: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f1f5f9; padding: 20px 10px;">
    <tr>
      <td align="center">
        <!--[if mso]>
        <table role="presentation" width="600" border="0" cellspacing="0" cellpadding="0">
        <tr>
        <td>
        <![endif]-->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06); overflow: hidden; border: 1px solid #e2e8f0;">
          <tr style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);">
            <td style="padding: 24px 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.025em;">AI Coach</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 30px; background-color: #ffffff;">
              ${htmlContent}
            </td>
          </tr>
          <tr style="background-color: #f8fafc; border-top: 1px solid #e2e8f0;">
            <td style="padding: 20px 30px; text-align: center; font-size: 12px; color: #64748b; line-height: 1.5;">
              © ${new Date().getFullYear()} AI Coach. All rights reserved.
            </td>
          </tr>
        </table>
        <!--[if mso]>
        </td>
        </tr>
        </table>
        <![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}
