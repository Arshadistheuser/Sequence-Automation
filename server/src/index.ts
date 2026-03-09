import express from "express";
import cors from "cors";
import path from "path";
import uploadRouter from "./routes/upload";

const app = express();
const PORT = 1234;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// API routes
app.use("/api/upload", uploadRouter);

// Serve the built client files
const clientDist = path.resolve(__dirname, "../../client/dist");
app.use(express.static(clientDist));

// SPA fallback - serve index.html for all non-API routes
app.get("*", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Sequence Automation running at http://localhost:${PORT}`);
});
