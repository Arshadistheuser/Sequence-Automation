import React, { useState } from "react";
import { Email } from "../types";

interface EmailPreviewProps {
  emails: Email[];
  sequenceName: string;
}

interface ContentBlock {
  type: "paragraph" | "list";
  html?: string;
  ordered?: boolean;
  items?: string[];
}

/**
 * Parses email body HTML into structured blocks for the Chrome extension.
 */
function parseIntoBlocks(bodyHtml: string): ContentBlock[] {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = bodyHtml;

  const blocks: ContentBlock[] = [];

  for (const child of Array.from(wrapper.children)) {
    const el = child as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === "ul" || tag === "ol") {
      const items = Array.from(el.querySelectorAll("li")).map(
        (li) => li.innerHTML.trim()
      );
      blocks.push({ type: "list", ordered: tag === "ol", items });
    } else if (tag === "p") {
      const content = el.innerHTML.trim();
      blocks.push({
        type: "paragraph",
        html: content === "" || content === "<br>" ? "" : content,
      });
    } else {
      const content = el.innerHTML.trim();
      if (content) {
        blocks.push({ type: "paragraph", html: content });
      }
    }
  }

  return blocks;
}

/**
 * Builds fallback flat HTML for pasting WITHOUT the Chrome extension.
 * Uses <br> between paragraphs and inline bullets.
 */
function buildFallbackHtml(blocks: ContentBlock[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.type === "list") {
      const tag = block.ordered ? "ol" : "ul";
      const items = (block.items || []).map((item) => `<li>${item}</li>`).join("");
      parts.push(`<${tag}>${items}</${tag}>`);
    } else {
      if (!block.html) {
        parts.push("<p><br></p>");
      } else {
        parts.push(`<p>${block.html}</p>`);
      }
    }
  }
  return parts.join("");
}

/**
 * Builds clipboard HTML with:
 * 1. SEQAUTO_V1 sentinel for Chrome extension detection
 * 2. JSON blocks in a <template> tag (invisible, won't render)
 * 3. Fallback flat HTML for pasting without extension
 */
function buildClipboardHtml(bodyHtml: string): string {
  const blocks = parseIntoBlocks(bodyHtml);
  // Encode JSON as HTML attribute (escape quotes for safety)
  const json = JSON.stringify(blocks).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const fallback = buildFallbackHtml(blocks);
  // Hidden span with data-seqauto carries the structured blocks.
  // Fallback HTML follows for pasting without the extension.
  return `<span data-seqauto="${json}" style="display:none"></span>${fallback}`;
}

async function copyRichHtml(bodyHtml: string, plainText: string): Promise<void> {
  const html = buildClipboardHtml(bodyHtml);

  try {
    const htmlBlob = new Blob([html], { type: "text/html" });
    const textBlob = new Blob([plainText], { type: "text/plain" });
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": htmlBlob,
        "text/plain": textBlob,
      }),
    ]);
  } catch {
    const container = document.createElement("div");
    container.innerHTML = html;
    container.style.position = "fixed";
    container.style.left = "-9999px";
    container.contentEditable = "true";
    document.body.appendChild(container);
    const range = document.createRange();
    range.selectNodeContents(container);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.execCommand("copy");
    document.body.removeChild(container);
  }
}

async function copyPlainText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

function EmailCard({ email }: { email: Email }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState<"" | "subject" | "body">("");

  const handleCopySubject = async () => {
    await copyPlainText(email.subject);
    setCopied("subject");
    setTimeout(() => setCopied(""), 2000);
  };

  const handleCopyBody = async () => {
    await copyRichHtml(email.bodyHtml, email.bodyText);
    setCopied("body");
    setTimeout(() => setCopied(""), 2000);
  };

  return (
    <div className="email-card">
      <span className="step-badge">Step {email.index}</span>

      <div className="email-subject-row">
        <div className="email-subject">{email.subject}</div>
        <button
          className={`copy-btn ${copied === "subject" ? "copy-btn-success" : ""}`}
          onClick={handleCopySubject}
          title="Copy subject line only — paste into HubSpot subject field"
        >
          {copied === "subject" ? "Copied!" : "Copy Subject"}
        </button>
      </div>

      {expanded ? (
        <div
          className="email-body-full"
          dangerouslySetInnerHTML={{ __html: email.bodyHtml }}
        />
      ) : (
        <div className="email-body-preview">
          <div dangerouslySetInnerHTML={{ __html: email.bodyHtml }} />
        </div>
      )}

      <div className="email-actions-row">
        <button className="toggle-btn" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Show less" : "Show full email"}
        </button>
        <button
          className={`copy-btn copy-btn-accent ${copied === "body" ? "copy-btn-success" : ""}`}
          onClick={handleCopyBody}
          title="Copy formatted body only — paste directly into HubSpot template editor"
        >
          {copied === "body" ? "Copied with formatting!" : "Copy Body"}
        </button>
      </div>
    </div>
  );
}

export default function EmailPreview({ emails, sequenceName }: EmailPreviewProps) {
  return (
    <div>
      <div className="sequence-header">
        <h2>{sequenceName}</h2>
        <span className="sequence-info">
          {emails.length} email{emails.length !== 1 ? "s" : ""} in sequence
        </span>
      </div>
      <div className="email-list">
        {emails.map((email, i) => (
          <React.Fragment key={email.index}>
            <EmailCard email={email} />
            {i < emails.length - 1 && <div className="email-connector" />}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
