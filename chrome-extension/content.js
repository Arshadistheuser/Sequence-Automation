/**
 * Sequence Automation — HubSpot Direct Insert v4
 *
 * Side panel on HubSpot for uploading .docx email sequences.
 * - Body: DIRECTLY inserts into HubSpot's contentEditable editor (no clipboard).
 * - Subject: copies to clipboard for manual Ctrl+V.
 */

// ─── Configuration ──────────────────────────────────────────────
const API_URLS = [
  "https://sequence-automation.onrender.com/api/upload",
  "http://localhost:1234/api/upload",
];

let activeApiUrl = null;

async function getApiUrl() {
  if (activeApiUrl) return activeApiUrl;
  for (const url of API_URLS) {
    try {
      const resp = await fetch(url.replace("/api/upload", ""), {
        method: "HEAD",
        signal: AbortSignal.timeout(3000),
      });
      if (resp.ok) {
        activeApiUrl = url;
        console.log("[SeqAuto] Using API:", url);
        return url;
      }
    } catch {}
  }
  activeApiUrl = API_URLS[1];
  return activeApiUrl;
}

// ─── Editor Interaction ─────────────────────────────────────────

function tick(ms = 15) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Find HubSpot's template body editor (largest contentEditable div).
 */
function findBodyEditor() {
  const editors = document.querySelectorAll('[contenteditable="true"]');
  let best = null;
  let bestArea = 0;
  for (const el of editors) {
    const rect = el.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > bestArea) {
      bestArea = area;
      best = el;
    }
  }
  return best;
}

/**
 * Directly insert body HTML into HubSpot's contentEditable editor.
 * Uses flat HTML with <br><br> for paragraph gaps since HubSpot's
 * editor CSS strips <p> margins. Lists kept as <ul>/<ol>.
 */
async function insertBodyIntoEditor(bodyHtml) {
  const editor = findBodyEditor();
  if (!editor) {
    return { ok: false, error: "Could not find HubSpot body editor. Please open a template first." };
  }

  // Focus the editor
  editor.focus();
  await tick(50);

  // Select all and delete
  document.execCommand("selectAll", false, null);
  await tick(20);
  document.execCommand("delete", false, null);
  await tick(20);

  // Parse body HTML into flat structure with <br><br> between paragraphs
  const tmp = document.createElement("div");
  tmp.innerHTML = bodyHtml;

  const pieces = [];
  for (const child of Array.from(tmp.children)) {
    const tag = child.tagName?.toLowerCase();
    if (tag === "ul" || tag === "ol") {
      pieces.push(child.outerHTML);
    } else if (tag === "p") {
      const inner = child.innerHTML.trim();
      if (!inner || inner === "<br>") {
        // Empty paragraph = extra blank line (already handled by <br><br> join)
        pieces.push("");
      } else {
        pieces.push(inner);
      }
    } else {
      const inner = child.innerHTML?.trim() || child.textContent?.trim();
      if (inner) {
        pieces.push(inner);
      }
    }
  }

  // Filter consecutive empties and join with <br><br> for paragraph spacing
  const filtered = [];
  for (let i = 0; i < pieces.length; i++) {
    if (pieces[i] === "" && (i === 0 || filtered[filtered.length - 1] === "")) continue;
    filtered.push(pieces[i]);
  }

  // Join: lists get their own block, text paragraphs separated by <br><br>
  let finalHtml = "";
  for (let i = 0; i < filtered.length; i++) {
    const piece = filtered[i];
    if (piece === "") {
      // Empty paragraph between content = extra line break
      finalHtml += "<br><br>";
    } else if (piece.startsWith("<ul") || piece.startsWith("<ol")) {
      // List block — add line break before/after if needed
      if (finalHtml && !finalHtml.endsWith("<br>")) finalHtml += "<br>";
      finalHtml += piece;
      if (i < filtered.length - 1) finalHtml += "<br>";
    } else {
      // Regular paragraph
      if (finalHtml && !finalHtml.endsWith("<br>")) finalHtml += "<br><br>";
      finalHtml += piece;
    }
  }

  if (!finalHtml) finalHtml = bodyHtml;

  // Set content directly
  editor.innerHTML = finalHtml;

  // Fire events for React/HubSpot
  editor.dispatchEvent(new Event("input", { bubbles: true }));
  editor.dispatchEvent(new Event("change", { bubbles: true }));
  await tick(100);

  // Place cursor at end
  const sel = window.getSelection();
  sel.removeAllRanges();
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  sel.addRange(range);

  return { ok: true };
}

/**
 * Copy subject text to clipboard.
 */
async function copySubject(subject) {
  try {
    await navigator.clipboard.writeText(subject);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = subject;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    return true;
  }
}

// ─── Panel UI ───────────────────────────────────────────────────

let panelState = {
  open: false,
  loading: false,
  error: "",
  sequenceName: "",
  emails: [],
};

function createPanel() {
  document.getElementById("seqauto-trigger")?.remove();
  document.getElementById("seqauto-panel")?.remove();

  const trigger = document.createElement("button");
  trigger.id = "seqauto-trigger";
  trigger.textContent = "Sequence Auto";
  trigger.addEventListener("click", () => togglePanel());
  document.body.appendChild(trigger);

  const panel = document.createElement("div");
  panel.id = "seqauto-panel";
  panel.innerHTML = `
    <div class="seqauto-header">
      <h2>Sequence Automation</h2>
      <button class="seqauto-close">&times;</button>
    </div>
    <div class="seqauto-body"></div>
  `;
  document.body.appendChild(panel);

  panel.querySelector(".seqauto-close").addEventListener("click", () => togglePanel(false));
  renderPanelBody();
}

function togglePanel(forceState) {
  panelState.open = forceState !== undefined ? forceState : !panelState.open;
  const panel = document.getElementById("seqauto-panel");
  const trigger = document.getElementById("seqauto-trigger");
  if (panel) panel.classList.toggle("open", panelState.open);
  if (trigger) trigger.style.display = panelState.open ? "none" : "";
}

function renderPanelBody() {
  const body = document.querySelector("#seqauto-panel .seqauto-body");
  if (!body) return;

  if (panelState.loading) {
    body.innerHTML = `
      <div class="seqauto-loading">
        <div class="seqauto-spinner"></div>
        Parsing document...
      </div>
    `;
    return;
  }

  if (panelState.emails.length === 0) {
    body.innerHTML = `
      ${panelState.error ? `<div class="seqauto-error">${panelState.error}</div>` : ""}
      <div class="seqauto-upload" id="seqauto-upload-area">
        <div class="seqauto-upload-icon">📄</div>
        <div class="seqauto-upload-label">Upload .docx file</div>
        <div class="seqauto-upload-hint">Drag & drop or click to browse</div>
      </div>
      <input type="file" id="seqauto-file-input" accept=".docx" style="display:none">
    `;

    const uploadArea = body.querySelector("#seqauto-upload-area");
    const fileInput = body.querySelector("#seqauto-file-input");

    uploadArea.addEventListener("click", () => fileInput.click());
    uploadArea.addEventListener("dragover", (e) => {
      e.preventDefault();
      uploadArea.style.borderColor = "#4a6cf7";
      uploadArea.style.background = "#f0f4ff";
    });
    uploadArea.addEventListener("dragleave", () => {
      uploadArea.style.borderColor = "";
      uploadArea.style.background = "";
    });
    uploadArea.addEventListener("drop", (e) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFileUpload(file);
    });
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) handleFileUpload(file);
    });

    return;
  }

  // Email list
  let html = `
    <div class="seqauto-sequence-name">${panelState.sequenceName}</div>
    <div class="seqauto-email-count">${panelState.emails.length} email${panelState.emails.length !== 1 ? "s" : ""} in sequence</div>
  `;

  panelState.emails.forEach((email, idx) => {
    const plainPreview = email.bodyText?.substring(0, 100) || "";
    html += `
      <div class="seqauto-email-card" data-email-idx="${idx}">
        <div class="seqauto-step-badge">Step ${email.index}</div>
        <div class="seqauto-subject">${email.subject}</div>
        <div class="seqauto-body-preview">${plainPreview}...</div>
        <div class="seqauto-actions">
          <button class="seqauto-btn" data-action="subject" data-idx="${idx}">Copy Subject</button>
          <button class="seqauto-btn seqauto-btn-primary" data-action="body" data-idx="${idx}">Insert Body</button>
        </div>
      </div>
    `;
  });

  html += `
    <div class="seqauto-reset">
      <button>Upload different file</button>
    </div>
  `;

  body.innerHTML = html;

  // Action handlers
  body.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const action = btn.dataset.action;
      const idx = parseInt(btn.dataset.idx);
      const email = panelState.emails[idx];
      const origText = btn.textContent;

      if (action === "subject") {
        await copySubject(email.subject);
        btn.classList.add("seqauto-btn-success");
        btn.textContent = "Copied! Ctrl+V to paste";
        setTimeout(() => {
          btn.classList.remove("seqauto-btn-success");
          btn.textContent = origText;
        }, 3000);
      }

      if (action === "body") {
        btn.textContent = "Inserting...";
        btn.disabled = true;
        const result = await insertBodyIntoEditor(email.bodyHtml);
        if (result.ok) {
          btn.classList.add("seqauto-btn-success");
          btn.textContent = "Inserted!";
          setTimeout(() => {
            btn.classList.remove("seqauto-btn-success");
            btn.textContent = origText;
            btn.disabled = false;
          }, 2000);
        } else {
          btn.classList.add("seqauto-btn-error");
          btn.textContent = result.error || "Failed";
          setTimeout(() => {
            btn.classList.remove("seqauto-btn-error");
            btn.textContent = origText;
            btn.disabled = false;
          }, 3000);
        }
      }
    });
  });

  body.querySelector(".seqauto-reset button")?.addEventListener("click", () => {
    panelState.emails = [];
    panelState.sequenceName = "";
    panelState.error = "";
    renderPanelBody();
  });
}

async function handleFileUpload(file) {
  if (!file.name.endsWith(".docx")) {
    panelState.error = "Only .docx files are supported";
    renderPanelBody();
    return;
  }

  panelState.loading = true;
  panelState.error = "";
  renderPanelBody();

  try {
    const apiUrl = await getApiUrl();
    const formData = new FormData();
    formData.append("file", file);

    const resp = await fetch(apiUrl, { method: "POST", body: formData });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || `Server error: ${resp.status}`);
    }

    const data = await resp.json();
    panelState.sequenceName = data.sequenceName;
    panelState.emails = data.emails;
    console.log("[SeqAuto] Parsed emails:", JSON.stringify(data.emails.map(e => ({ idx: e.index, subject: e.subject, bodyLen: e.bodyHtml?.length })), null, 2));
  } catch (e) {
    panelState.error = e.message || "Failed to parse document";
  }

  panelState.loading = false;
  renderPanelBody();
}

// ─── Initialize ─────────────────────────────────────────────────

function init() {
  if (
    location.href.includes("/sequences/") ||
    location.href.includes("/templates/")
  ) {
    if (!document.getElementById("seqauto-trigger")) {
      createPanel();
      console.log("[SeqAuto] Panel initialized");
    }
  }
}

init();

// Watch for SPA navigation
let lastUrl = location.href;
const observer = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    init();
  }
});
observer.observe(document.body, { childList: true, subtree: true });

console.log("[SeqAuto] Extension v4 loaded — Direct Insert");
