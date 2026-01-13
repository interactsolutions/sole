# Fund Flow Dashboard (Live Excel)

This project ships as a **Bootstrap + JavaScript** dashboard with a small **Node/Express** server that **parses your Excel file at runtime**.

That means: when you **replace/update** the Excel file on the server, the **next page refresh** will reflect the new numbers automatically.

## What’s included

- `data/Accounts flow.xlsx` — your current Excel file (you can replace this later)
- `server/server.js` — Express server + Excel parsing + APIs
- `public/` — the website UI (Summary + Details)

## Run locally

1. Install Node.js (LTS recommended).
2. Open a terminal:

```bash
cd server
npm install
# Set a password for detail view (IMPORTANT)
export REPORT_PASSWORD='YourStrongPasswordHere'
# Start server
npm start
```

3. Open the dashboard:

- Summary: http://localhost:5177/
- Details: http://localhost:5177/details.html

## Updating Excel (the “live link”)

Replace the Excel file:

- `data/Accounts flow.xlsx`

Then refresh the browser. The server checks Excel file modified time and re-parses automatically.

### For a different Excel file path

Set:

```bash
export EXCEL_PATH="/absolute/path/to/your.xlsx"
```

## APIs (for future extensions)

- `GET /api/meta`
- `GET /api/dimensions`
- `GET /api/aggregate?from=YYYY-MM-DD&to=YYYY-MM-DD&purpose=...&bank=...&ref=Dr|Cr&search=...`
- `GET /api/transactions` (requires password)
  - Provide password via:
    - Header: `x-report-password: ...`
    - Or query: `?pw=...`

## Security note

The summary endpoint is intentionally “safe” and aggregated. Row-level data is only returned from `/api/transactions` after password validation on the server.
