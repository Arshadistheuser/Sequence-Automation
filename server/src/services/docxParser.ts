import mammoth from "mammoth";
import * as cheerio from "cheerio";
import path from "path";
import { Email, ParseResult } from "../types";

export async function parseDocx(buffer: Buffer, fileName: string): Promise<ParseResult> {
  const result = await mammoth.convertToHtml({ buffer });
  const html = result.value;

  const emails = splitEmails(html);
  const sequenceName = path.basename(fileName, path.extname(fileName));

  return { sequenceName, emails };
}

/**
 * Detects what kind of separator each element is:
 * - "subject-line" for "Subject Line: ...", "Subject: ...", "SL: ..."
 * - "email-header" for "Email 1:", "Email 2:", etc.
 * - "re-line" for "RE: ..." (follow-up subject lines)
 * - null for regular body content
 */
function detectSeparator(text: string): {
  type: "subject-line" | "email-header" | "re-line";
  value: string;
} | null {
  // "Subject Line: ..." or "Subject: ..." or "SL: ..."
  const subjectMatch = text.match(/^(?:Subject\s*(?:Line)?|SL)\s*[:\-–—]\s*(.+)/i);
  if (subjectMatch) {
    return { type: "subject-line", value: subjectMatch[1].trim() };
  }

  // "Email 1:", "Email 2:", "Email #3:", etc.
  const emailHeaderMatch = text.match(/^Email\s*#?\s*(\d+)\s*[:\-–—]?\s*$/i);
  if (emailHeaderMatch) {
    return { type: "email-header", value: `Email ${emailHeaderMatch[1]}` };
  }

  // "RE:" or "Re:" as a standalone subject indicator (for follow-up emails)
  const reMatch = text.match(/^RE\s*[:\-–—]\s*(.*)$/i);
  if (reMatch) {
    return { type: "re-line", value: reMatch[1]?.trim() || "" };
  }

  return null;
}

function splitEmails(html: string): Email[] {
  const $ = cheerio.load(html);
  const allElements = $("body").children().toArray();

  // First pass: tag every element
  const tagged: Array<{
    el: any;
    html: string;
    text: string;
    separator: ReturnType<typeof detectSeparator>;
  }> = [];

  for (const el of allElements) {
    const $el = $(el);
    const text = $el.text().trim();
    const elHtml = $.html(el) || "";
    tagged.push({
      el,
      html: elHtml,
      text,
      separator: detectSeparator(text),
    });
  }

  // Check if document has any separators at all
  const hasSeparators = tagged.some((t) => t.separator !== null);
  if (!hasSeparators) {
    // Try HR/divider split as fallback
    const hrResult = tryHrSplit($, allElements);
    if (hrResult.length > 1) return hrResult;

    // No separators found — return entire doc as one email
    return [
      {
        index: 1,
        subject: "Email 1",
        bodyHtml: tagged.map((t) => t.html).join(""),
        bodyText: tagged.map((t) => t.text).join("\n").trim(),
      },
    ];
  }

  // Second pass: split into emails using separators
  const emails: Email[] = [];
  let currentSubject = "";
  let currentBodyParts: string[] = [];
  let currentTextParts: string[] = [];
  let expectingSubjectAfterHeader = false;

  function saveCurrentEmail() {
    // Strip leading/trailing empty paragraphs
    const bodyHtml = currentBodyParts
      .join("")
      .replace(/^(<p>\s*<\/p>\s*)+/, "")
      .replace(/(<p>\s*<\/p>\s*)+$/, "");
    const bodyText = currentTextParts.join("\n").trim();

    if (bodyHtml.trim() || bodyText.trim()) {
      emails.push({
        index: emails.length + 1,
        subject: currentSubject || `Email ${emails.length + 1}`,
        bodyHtml,
        bodyText,
      });
    }
    currentSubject = "";
    currentBodyParts = [];
    currentTextParts = [];
  }

  for (const item of tagged) {
    const sep = item.separator;

    if (sep?.type === "subject-line") {
      // "Subject Line: ..." — starts a new email
      saveCurrentEmail();
      currentSubject = sep.value;
      expectingSubjectAfterHeader = false;
    } else if (sep?.type === "email-header") {
      // "Email 2:" — starts a new email, subject might come next as "RE:"
      saveCurrentEmail();
      currentSubject = sep.value; // default, may be overridden by RE: line
      expectingSubjectAfterHeader = true;
    } else if (sep?.type === "re-line" && expectingSubjectAfterHeader) {
      // "RE: ..." right after "Email N:" — this is the subject
      if (sep.value) {
        currentSubject = `RE: ${sep.value}`;
      }
      expectingSubjectAfterHeader = false;
    } else {
      // Regular body content
      expectingSubjectAfterHeader = false;

      // Skip empty elements at the start of a body
      const isEmpty = item.text === "" && !item.html.includes("<img") && !item.html.includes("<br");
      if (isEmpty && currentBodyParts.length === 0) {
        continue;
      }

      currentBodyParts.push(item.html);
      currentTextParts.push(item.text);
    }
  }

  // Save the last email
  saveCurrentEmail();

  return emails;
}

function tryHrSplit($: cheerio.CheerioAPI, allElements: any[]): Email[] {
  const emails: Email[] = [];
  let currentBodyParts: string[] = [];
  let currentTextParts: string[] = [];

  for (const el of allElements) {
    const $el = $(el);
    const text = $el.text().trim();
    const tagName = (el as any).tagName?.toLowerCase();
    const isDivider = tagName === "hr" || /^[-=_]{3,}\s*$/.test(text);

    if (isDivider) {
      if (currentBodyParts.length > 0) {
        emails.push({
          index: emails.length + 1,
          subject: `Email ${emails.length + 1}`,
          bodyHtml: currentBodyParts.join(""),
          bodyText: currentTextParts.join("\n").trim(),
        });
        currentBodyParts = [];
        currentTextParts = [];
      }
    } else {
      currentBodyParts.push($.html(el) || "");
      currentTextParts.push(text);
    }
  }

  if (currentBodyParts.length > 0) {
    emails.push({
      index: emails.length + 1,
      subject: `Email ${emails.length + 1}`,
      bodyHtml: currentBodyParts.join(""),
      bodyText: currentTextParts.join("\n").trim(),
    });
  }

  return emails;
}
