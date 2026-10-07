# Smart Receipt & Invoice Snapshot Auditor

An AI-powered expense auditing application built for fast, accurate receipt processing using Gemini Vision API and the MERN stack.

## Key Features
- **Instant AI Extraction:** Automatically extracts vendor name, date, total amount, tax, and line items from uploaded receipt images.
- **Audit Logs:** Saves historical transaction data for review.
- **Interactive UI:** Simple drag-and-drop dashboard to view extracted receipt metadata.

## Tech Stack
- **Frontend:** React, Vite, Axios
- **Backend:** Node.js, Express, Multer
- **AI Engine:** Google Gemini 2.5 Flash Vision API
- **Database:** SQLite3

## Quick Setup

1. **Backend Setup:**
   ```bash
   cd auditor-backend
   npm install
   # Add GEMINI_API_KEY in .env file
   node server.js

2. Frontend Setup:

   Bash
   cd auditor-frontend
   npm install
   npm run dev