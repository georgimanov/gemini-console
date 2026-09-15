// A lightweight Markdown-to-HTML converter focused on the elements coaching
// emails actually use: headers, lists, tables, blockquote alerts, links, bold/italic.
// Ported from ai-coach/tools/send_email.js.

export function markdownToHtml(md: string): string {
  let html = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const lines = html.split("\n");
  let inList = false;
  let inTable = false;
  let tableHeaders: string[] | null = null;
  let tableRows: string[][] = [];
  let inBlockquote = false;
  let blockquoteType = "";
  let blockquoteLines: string[] = [];

  const resultLines: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Table parsing
    if (line.startsWith("|")) {
      if (inList) {
        resultLines.push("</ul>");
        inList = false;
      }
      if (inBlockquote) {
        resultLines.push(renderBlockquote(blockquoteType, blockquoteLines.join("<br>")));
        inBlockquote = false;
        blockquoteLines = [];
      }

      if (line.includes("---")) continue; // separator row

      const cells = line
        .split("|")
        .map((c) => c.trim())
        .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
      if (!inTable) {
        inTable = true;
        tableHeaders = cells;
      } else {
        tableRows.push(cells);
      }
      continue;
    } else if (inTable) {
      resultLines.push(renderTable(tableHeaders ?? [], tableRows));
      inTable = false;
      tableHeaders = null;
      tableRows = [];
    }

    // Blockquote/alert parsing
    if (line.startsWith("&gt;")) {
      if (inList) {
        resultLines.push("</ul>");
        inList = false;
      }

      const content = line.substring(4).trim();
      if (content.startsWith("[!")) {
        inBlockquote = true;
        const match = content.match(/\[!(.*?)\]/);
        blockquoteType = match ? match[1] : "NOTE";
        continue;
      } else if (inBlockquote) {
        blockquoteLines.push(content);
        continue;
      } else {
        inBlockquote = true;
        blockquoteType = "NOTE";
        blockquoteLines.push(content);
        continue;
      }
    } else if (inBlockquote) {
      resultLines.push(renderBlockquote(blockquoteType, blockquoteLines.join("<br>")));
      inBlockquote = false;
      blockquoteLines = [];
    }

    // List parsing
    if (line.startsWith("- ") || line.startsWith("* ")) {
      if (!inList) {
        resultLines.push('<ul style="margin: 5px 0 15px 20px; padding: 0; list-style: disc;">');
        inList = true;
      }
      const content = line.substring(2).trim();
      resultLines.push(
        `<li style="margin-bottom: 5px; font-size: 15px; color: #333333;">${inlineFormatting(content)}</li>`
      );
      continue;
    } else if (inList) {
      resultLines.push("</ul>");
      inList = false;
    }

    // Headers, rules, paragraphs
    if (line.startsWith("# ")) {
      resultLines.push(
        `<h1 style="color: #0f172a; border-bottom: 1px solid #cbd5e1; padding-bottom: 8px; margin-top: 30px; margin-bottom: 15px; font-size: 24px;">${inlineFormatting(line.substring(2))}</h1>`
      );
    } else if (line.startsWith("## ")) {
      resultLines.push(
        `<h2 style="color: #1e293b; margin-top: 25px; margin-bottom: 12px; font-size: 18px; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px;">${inlineFormatting(line.substring(3))}</h2>`
      );
    } else if (line.startsWith("### ")) {
      resultLines.push(
        `<h3 style="color: #334155; margin-top: 20px; margin-bottom: 10px; font-size: 15px;">${inlineFormatting(line.substring(4))}</h3>`
      );
    } else if (line === "---") {
      resultLines.push('<hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 25px 0;">');
    } else if (line !== "") {
      resultLines.push(
        `<p style="line-height: 1.6; margin-top: 0; margin-bottom: 15px; font-size: 15px; color: #333333;">${inlineFormatting(line)}</p>`
      );
    }
  }

  if (inList) resultLines.push("</ul>");
  if (inTable) resultLines.push(renderTable(tableHeaders ?? [], tableRows));
  if (inBlockquote) resultLines.push(renderBlockquote(blockquoteType, blockquoteLines.join("<br>")));

  return resultLines.join("\n");
}

function inlineFormatting(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    // Local markdown file:/// links render as inert code chips instead of broken hyperlinks.
    .replace(
      /\[(.*?)\]\(file:\/\/\/(.*?)\)/g,
      '<span style="color: #475569; background-color: #f1f5f9; padding: 2px 4px; border-radius: 4px; font-family: monospace; font-size: 13px;">$1</span>'
    )
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" style="color: #2563eb; text-decoration: underline;">$1</a>');
}

function renderTable(headers: string[], rows: string[][]): string {
  let html =
    '<div style="overflow-x: auto; margin: 15px 0 25px 0;"><table style="width: 100%; border-collapse: collapse; font-size: 14px; text-align: left; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden;">';

  html += '<tr style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0;">';
  for (const h of headers) {
    html += `<th style="padding: 10px 12px; font-weight: 600; color: #334155; border: 1px solid #e2e8f0;">${inlineFormatting(h)}</th>`;
  }
  html += "</tr>";

  rows.forEach((r, idx) => {
    const bgColor = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
    html += `<tr style="background-color: ${bgColor}; border-bottom: 1px solid #edf2f7;">`;
    for (const cell of r) {
      const cellText = inlineFormatting(cell).replace(/&lt;br\s*\/?&gt;/gi, "<br>");
      html += `<td style="padding: 10px 12px; color: #475569; line-height: 1.4; border: 1px solid #e2e8f0;">${cellText}</td>`;
    }
    html += "</tr>";
  });

  html += "</table></div>";
  return html;
}

function renderBlockquote(type: string, content: string): string {
  let bgColor = "#f8fafc";
  let borderLeftColor = "#64748b";
  let titleColor = "#475569";
  const title = type || "NOTE";

  if (type === "IMPORTANT") {
    bgColor = "#fef2f2";
    borderLeftColor = "#ef4444";
    titleColor = "#991b1b";
  } else if (type === "WARNING") {
    bgColor = "#fffbeb";
    borderLeftColor = "#f59e0b";
    titleColor = "#92400e";
  } else if (type === "TIP") {
    bgColor = "#f0fdf4";
    borderLeftColor = "#22c55e";
    titleColor = "#166534";
  }

  const text = inlineFormatting(content).replace(/&lt;br\s*\/?&gt;/gi, "<br>");

  return `
  <div style="background-color: ${bgColor}; border-left: 4px solid ${borderLeftColor}; padding: 12px 16px; margin: 15px 0 20px 0; border-radius: 0 4px 4px 0;">
    <strong style="color: ${titleColor}; display: block; margin-bottom: 4px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">${title}</strong>
    <div style="color: #334155; font-size: 14px; line-height: 1.5;">${text}</div>
  </div>`;
}
