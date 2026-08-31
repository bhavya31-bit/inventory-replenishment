# Operations Exception Workbench

A compact assessment-ready P2P goods-receipt discrepancy workflow.

## Features
- Dashboard KPIs: total POs, matched, exceptions, blocked value, exception rate
- Exception queue with search, status filter and priority filter
- PO/GR detail view
- Quantity variance and tolerance validation
- Grounded decision support using transaction evidence
- Optional OpenAI grounded summary/recommendation when `OPENAI_API_KEY` is configured
- Send for Review workflow
- Release for Invoice workflow with control: over-tolerance records must be reviewed first
- Persistent action state in `server/data/store.json`
- Refresh from the backend
- Production build served by the same Express process

## Run
```bash
npm install
npm run dev
```

Open http://localhost:5173

## Production
```bash
npm run build
npm start
```

The Express server serves the generated `dist` folder.

## Optional AI
Copy `.env.example` to `.env` and provide an OpenAI API key only when an external LLM is permitted.
Without a key, the evidence-grounded decision engine remains fully functional and deterministic.
