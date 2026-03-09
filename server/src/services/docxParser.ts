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

function splitEmails(html: string): Email[] {
  const $ = cheerio.load(html);

  // Strategy 1: Look for "Subject:" lines
  const subjectEmails = trySubjectSplit($);
  if (subjectEmails.length > 0) return subjectEmails;

  // Strategy 2: Look for "Email N" / "Step N" headings or bold text
  const headingEmails = tryHeadingSplit($);
  if (headingEmails.length > 0) return headingEmails;

  // Strategy 3: Split by horizontal rules or lines of dashes
  const hrEmails = tryHrSplit($);
  if (hrEmails.length > 0) return hrEmails;

  // Fallback: treat entire document as one email
  const bodyHtml = $.html("body") || html;
  const bodyText = $.text().trim();
  return [
    {
      index: 1,
      subject: "Email 1",
      bodyHtml,
      bodyText,
    },
  ];
}

function trySubjectSplit($: cheerio.CheerioAPI): Email[] {
  const emails: Email[] = [];
  const allElements = $("body").children().toArray();
  let currentSubject = "";
  let currentBodyParts: string[] = [];
  let currentTextParts: string[] = [];

  for (const el of allElements) {
    const $el = $(el);
    const text = $el.text().trim();
    // Match variations: "Subject:", "Subject Line:", "Subject line -", "SL:", etc.
    const subjectMatch = text.match(/^(?:Subject\s*(?:Line)?|SL)\s*[:\-–—]\s*(.+)/i);

    if (subjectMatch) {
      // Save previous email if exists
      if (currentSubject || currentBodyParts.length > 0) {
        emails.push({
          index: emails.length + 1,
          subject: currentSubject || `Email ${emails.length + 1}`,
          bodyHtml: currentBodyParts.join(""),
          bodyText: currentTextParts.join("\n").trim(),
        });
      }
      currentSubject = subjectMatch[1].trim();
      currentBodyParts = [];
      currentTextParts = [];
    } else {
      // Skip empty paragraphs at the start of body (before any real content)
      const isEmptyElement = text === "" && !$el.find("img, br").length;
      if (isEmptyElement && currentBodyParts.length === 0) {
        continue;
      }
      currentBodyParts.push($.html(el) || "");
      currentTextParts.push(text);
    }
  }

  // Save last email
  if (currentSubject || currentBodyParts.length > 0) {
    emails.push({
      index: emails.length + 1,
      subject: currentSubject || `Email ${emails.length + 1}`,
      bodyHtml: currentBodyParts.join(""),
      bodyText: currentTextParts.join("\n").trim(),
    });
  }

  // Also check: strip any leading empty paragraphs from each email body
  for (const email of emails) {
    email.bodyHtml = email.bodyHtml.replace(/^(<p>\s*<\/p>\s*)+/, "");
    email.bodyText = email.bodyText.replace(/^\s*\n+/, "");
  }

  return emails.length > 1 ? emails : [];
}

function tryHeadingSplit($: cheerio.CheerioAPI): Email[] {
  const emails: Email[] = [];
  const allElements = $("body").children().toArray();
  let currentTitle = "";
  let currentBodyParts: string[] = [];
  let currentTextParts: string[] = [];
  const headingPattern = /^(Email|Step|Message)\s*#?\s*(\d+)/i;

  for (const el of allElements) {
    const $el = $(el);
    const text = $el.text().trim();
    const tagName = (el as any).tagName?.toLowerCase();
    const isBold = $el.find("strong, b").length > 0 && $el.find("strong, b").text().trim() === text;
    const isHeading = tagName === "h1" || tagName === "h2" || tagName === "h3" || isBold;

    if (isHeading && headingPattern.test(text)) {
      if (currentBodyParts.length > 0) {
        emails.push({
          index: emails.length + 1,
          subject: currentTitle || `Email ${emails.length + 1}`,
          bodyHtml: currentBodyParts.join(""),
          bodyText: currentTextParts.join("\n").trim(),
        });
      }
      currentTitle = text;
      currentBodyParts = [];
      currentTextParts = [];
    } else {
      currentBodyParts.push($.html(el) || "");
      currentTextParts.push(text);
    }
  }

  if (currentBodyParts.length > 0) {
    emails.push({
      index: emails.length + 1,
      subject: currentTitle || `Email ${emails.length + 1}`,
      bodyHtml: currentBodyParts.join(""),
      bodyText: currentTextParts.join("\n").trim(),
    });
  }

  return emails.length > 1 ? emails : [];
}

function tryHrSplit($: cheerio.CheerioAPI): Email[] {
  const emails: Email[] = [];
  const allElements = $("body").children().toArray();
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

  return emails.length > 1 ? emails : [];
}
