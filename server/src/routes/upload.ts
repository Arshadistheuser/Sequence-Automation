import { Router, Request, Response } from "express";
import multer from "multer";
import mammoth from "mammoth";
import { parseDocx } from "../services/docxParser";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.originalname.endsWith(".docx")
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only .docx files are allowed"));
    }
  },
});

const router = Router();

router.post("/", upload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const result = await parseDocx(req.file.buffer, req.file.originalname);
    res.json(result);
  } catch (error: any) {
    console.error("Upload error:", error);
    res.status(500).json({ error: error.message || "Failed to parse document" });
  }
});

// Debug endpoint: returns the raw HTML from mammoth so we can see the structure
router.post("/debug", upload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const result = await mammoth.convertToHtml({ buffer: req.file.buffer });
    res.json({ rawHtml: result.value, messages: result.messages });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
