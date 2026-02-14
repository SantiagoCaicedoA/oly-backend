/**
 * Document service: load and chunk the reference document (e.g. 50-page PDF)
 * so it can be used as context for the Training Logic AI without exceeding token limits.
 */

const fs = require('fs');
const path = require('path');

// Chunk size in characters (~500 chars ≈ 125 tokens; 4000 chars ≈ 1000 tokens)
const CHUNK_SIZE = 4000;
const CHUNK_OVERLAP = 200;
const MAX_CHUNKS_FOR_CONTEXT = 15; // ~15k chars total to stay under context limits

let cachedChunks = null;
let cachedDocPath = null;

/**
 * Extract text from a PDF file (requires pdf-parse). Falls back to empty if not installed.
 * @param {string} pdfPath - Absolute path to PDF
 * @returns {Promise<string>}
 */
async function extractTextFromPdf(pdfPath) {
  try {
    const pdfParse = require('pdf-parse');
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdfParse(dataBuffer);
    return data.text || '';
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      console.warn('documentService: pdf-parse not installed. Run: npm install pdf-parse');
      return '';
    }
    throw err;
  }
}

/**
 * Load document text from file. Supports:
 * - .pdf (uses pdf-parse)
 * - .txt
 * @param {string} docPath - Path to document (relative to project root or absolute)
 * @returns {Promise<string>}
 */
async function loadDocumentText(docPath) {
  const resolved = path.isAbsolute(docPath) ? docPath : path.join(process.cwd(), docPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Document not found: ${resolved}`);
  }
  const ext = path.extname(resolved).toLowerCase();
  if (ext === '.pdf') {
    return extractTextFromPdf(resolved);
  }
  if (ext === '.txt') {
    return fs.promises.readFile(resolved, 'utf-8');
  }
  throw new Error(`Unsupported document type: ${ext}. Use .pdf or .txt`);
}

/**
 * Split text into overlapping chunks for context window.
 * @param {string} text
 * @returns {string[]}
 */
function chunkText(text) {
  if (!text || !text.trim()) return [];
  const normalized = text.replace(/\r\n/g, '\n').trim();
  const chunks = [];
  let start = 0;
  while (start < normalized.length) {
    let end = start + CHUNK_SIZE;
    if (end < normalized.length) {
      const lastSpace = normalized.lastIndexOf(' ', end);
      if (lastSpace > start) end = lastSpace + 1;
    }
    chunks.push(normalized.slice(start, end).trim());
    start = end - CHUNK_OVERLAP;
    if (start >= normalized.length) break;
  }
  return chunks.filter(Boolean);
}

/**
 * Get document chunks for context. Caches after first load.
 * Set DOCUMENT_PATH in .env (e.g. data/reference.pdf or docs/guide.txt).
 * @returns {Promise<string[]>}
 */
async function getDocumentChunks() {
  const docPath = process.env.DOCUMENT_PATH || 'data/reference.pdf';
  if (cachedChunks && cachedDocPath === docPath) return cachedChunks;
  const text = await loadDocumentText(docPath);
  cachedChunks = chunkText(text);
  cachedDocPath = docPath;
  return cachedChunks;
}

/**
 * Get relevant context for a user message: returns up to MAX_CHUNKS_FOR_CONTEXT chunks.
 * Simple strategy: first chunks + any chunk containing query words (for 50 pages, you can
 * later add embedding-based search for better relevance).
 * @param {string} userMessage - Current user message (optional, for keyword matching)
 * @returns {Promise<string>} - Combined context string to inject into system prompt
 */
async function getContextForPrompt(userMessage = '') {
  const chunks = await getDocumentChunks();
  if (chunks.length === 0) return '';

  const queryWords = userMessage
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  let selected = [];
  if (queryWords.length > 0) {
    const scored = chunks.map((chunk, i) => {
      const lower = chunk.toLowerCase();
      const score = queryWords.filter((w) => lower.includes(w)).length;
      return { i, score, chunk };
    });
    scored.sort((a, b) => b.score - a.score);
    const byIndex = new Set(scored.slice(0, MAX_CHUNKS_FOR_CONTEXT).map((s) => s.i));
    selected = chunks
      .map((c, i) => (byIndex.has(i) ? c : null))
      .filter(Boolean);
  }
  if (selected.length < 3) {
    selected = chunks.slice(0, MAX_CHUNKS_FOR_CONTEXT);
  }
  return selected.join('\n\n---\n\n');
}

module.exports = {
  loadDocumentText,
  chunkText,
  getDocumentChunks,
  getContextForPrompt,
};
