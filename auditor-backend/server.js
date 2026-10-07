import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
});
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Primary model first, then fallbacks tried in order if it is overloaded or missing.
// Override with GEMINI_MODELS in .env, e.g. GEMINI_MODELS=gemini-3.5-flash,gemini-3.1-flash-lite
const MODELS = (process.env.GEMINI_MODELS ||
  'gemini-3.5-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

const RETRIES_PER_MODEL = 3; // attempts per model on temporary errors
const BASE_DELAY_MS = 1000;  // 1s, 2s, 4s... (plus jitter)

app.use(cors());
app.use(express.json());

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const getStatus = (err) => err?.status ?? err?.error?.code ?? err?.code;

// Temporary errors worth retrying: overloaded, rate limited, server hiccups
const isRetryable = (err) => [429, 500, 502, 503, 504].includes(getStatus(err));

// Model gone / not supported: skip straight to the next model
const isModelMissing = (err) => getStatus(err) === 404;

async function generateWithFallback(request) {
  let lastErr;

  for (const model of MODELS) {
    for (let attempt = 1; attempt <= RETRIES_PER_MODEL; attempt++) {
      try {
        const response = await ai.models.generateContent({ ...request, model });
        console.log(`Success with ${model} (attempt ${attempt})`);
        return response;
      } catch (err) {
        lastErr = err;
        console.warn(
          `${model} attempt ${attempt}/${RETRIES_PER_MODEL} failed:`,
          getStatus(err),
          err.message?.slice(0, 120)
        );

        if (isModelMissing(err)) break;       // try next model
        if (!isRetryable(err)) throw err;     // bad request, auth, etc. -> give up
        if (attempt < RETRIES_PER_MODEL) {
          const delay = BASE_DELAY_MS * 2 ** (attempt - 1) + Math.random() * 300;
          await sleep(delay);
        }
      }
    }
  }
  throw lastErr;
}

app.post('/api/audit', upload.single('receipt'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Receipt image missing' });
    }

    const imagePart = {
      inlineData: {
        data: req.file.buffer.toString('base64'),
        mimeType: req.file.mimetype,
      },
    };

    const prompt =
      'Analyze this receipt image and extract the required vendor, date, total, tax, and item details.';

    const response = await generateWithFallback({
      contents: [prompt, imagePart],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            vendor: { type: Type.STRING },
            date: { type: Type.STRING },
            totalAmount: { type: Type.NUMBER },
            tax: { type: Type.NUMBER },
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  price: { type: Type.NUMBER },
                },
                required: ['name', 'price'],
              },
            },
          },
          required: ['vendor', 'date', 'totalAmount', 'tax', 'items'],
        },
      },
    });

    const data = JSON.parse(response.text);
    res.json({ success: true, data });
  } catch (err) {
    console.error('Audit Error:', err);
    const status = isRetryable(err) ? 503 : 500;
    res.status(status).json({
      error: isRetryable(err)
        ? 'The AI service is busy right now. Please try again in a moment.'
        : err.message,
    });
  }
});

app.listen(5000, () => console.log('Backend running on http://localhost:5000'));