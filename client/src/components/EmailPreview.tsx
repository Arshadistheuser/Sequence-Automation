import React, { useState } from "react";
import { Email } from "../types";

interface EmailPreviewProps {
  emails: Email[];
  sequenceName: string;
}

/**
 * Prepares the HTML body for clipboard copy so that formatting survives
 * pasting into HubSpot's template editor.
 *
 * HubSpot's editor strips CSS classes and most styles. The most reliable
 * way to preserve paragraph spacing is to insert <br> tags between
 * paragraphs, because HubSpot respects line breaks natively.
 */
function prepareHtmlForClipboard(bodyHtml: string): string {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = bodyHtml;

  // Don't transform <p> tags — HubSpot's editor renders them
  // with its own default paragraph spacing. Just clean up empty ones.
  wrapper.querySelectorAll("p").forEach((p: HTMLElement) => {
    const content = p.innerHTML.trim();
    if (content === "" || content === "<br>") {
      // Empty paragraph in Word = intentional blank line
      p.innerHTML = "<br>";
    }
  });

  // Preserve list formatting with inline styles
  (wrapper.querySelectorAll("ul, ol") as NodeListOf<HTMLElement>).forEach((list) => {
    list.style.marginLeft = "20px";
    list.style.marginBottom = "10px";
    list.style.paddingLeft = "20px";
  });

  wrapper.querySelectorAll("li").forEach((li: HTMLElement) => {
    li.style.marginBottom = "4px";
  });

  return wrapper.innerHTML;
}

/**
 * Copies rich HTML to clipboard so it pastes with full formatting
 * into HubSpot's template editor (bold, links, lists, line breaks, etc.)
 */
async function copyRichHtml(bodyHtml: string, plainText: string): Promise<void> {
  const styledHtml = prepareHtmlForClipboard(bodyHtml);

  try {
    const htmlBlob = new Blob([styledHtml], { type: "text/html" });
    const textBlob = new Blob([plainText], { type: "text/plain" });
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": htmlBlob,
        "text/plain": textBlob,
      }),
    ]);
  } catch {
    // Fallback: use a temporary rich-text editable div to preserve formatting
    const container = document.createElement("div");
    container.innerHTML = styledHtml;
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
