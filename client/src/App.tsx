import React, { useState } from "react";
import FileUpload from "./components/FileUpload";
import EmailPreview from "./components/EmailPreview";
import { uploadDocument } from "./api/client";
import { Email } from "./types";

type AppState = "upload" | "loading" | "preview";

const HUBSPOT_SEQUENCES_URL = "https://app.hubspot.com/sequences/7991245";

export default function App() {
  const [state, setState] = useState<AppState>("upload");
  const [sequenceName, setSequenceName] = useState("");
  const [emails, setEmails] = useState<Email[]>([]);
  const [error, setError] = useState("");

  const handleFileSelected = async (file: File) => {
    setState("loading");
    setError("");
    try {
      const parsed = await uploadDocument(file);
      setSequenceName(parsed.sequenceName);
      setEmails(parsed.emails);
      setState("preview");
    } catch (e: any) {
      setError(e.message);
      setState("upload");
    }
  };

  const handleReset = () => {
    setState("upload");
    setSequenceName("");
    setEmails([]);
    setError("");
  };

  return (
    <div className="app">
      <h1>Sequence Automation</h1>
      <p className="subtitle">
        Upload a Word document with email sequences — copy with formatting and paste directly into HubSpot
      </p>

      {error && <div className="error-banner">{error}</div>}

      {state === "upload" && (
        <FileUpload onFileSelected={handleFileSelected} />
      )}

      {state === "loading" && (
        <div className="loading">
          <div className="spinner" />
          Parsing document...
        </div>
      )}

      {state === "preview" && (
        <>
          <EmailPreview emails={emails} sequenceName={sequenceName} />

          <div className="hubspot-note">
            <strong>Workflow:</strong> For each step — click <em>Copy Subject</em>, paste into the subject field,
            then click <em>Copy Body</em> and paste into the template editor. Formatting is preserved automatically.
          </div>

          <div className="actions">
            <a
              className="btn btn-primary"
              href={HUBSPOT_SEQUENCES_URL}
              target="_blank"
              rel="noreferrer"
            >
              Open HubSpot Sequences
            </a>
            <button className="btn btn-secondary" onClick={handleReset}>
              Upload different file
            </button>
          </div>
        </>
      )}
    </div>
  );
}
