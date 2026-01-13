# Fund Flow Dashboard (GitHub Pages)

This repository publishes a static reporting dashboard (summary + password-gated details) to GitHub Pages.

## Key point: Excel → JSON (required for GitHub Pages)
GitHub Pages cannot read a server-side Excel file at runtime. Instead:
- You commit the Excel file to the repo at: `data/Accounts flow.xlsx`
- A script converts it into JSON inside `docs/data/`
- The static site reads JSON at runtime

When you update and commit the Excel file, the workflow regenerates JSON and the site updates.

## Quick start (local preview)
1. Run data build:
```bash
python3 tools/excel_to_json.py --excel "data/Accounts flow.xlsx" --out "docs/data/fund_flow.json" --meta "docs/data/meta.json"
```

2. Preview:
```bash
cd docs
python3 -m http.server 8000
```
Open `http://localhost:8000/`

## Enable GitHub Pages
Settings → Pages → Build and deployment:
- Source: Deploy from a branch
- Branch: `main`
- Folder: `/docs`

## Auto-regenerate JSON on push (recommended)
A GitHub Action is included at `.github/workflows/update-data.yml`.
It re-runs the converter whenever you push changes, commits updated JSON back to `main`.

## Password gate (details page)
The details page uses a client-side hash check (`docs/js/auth.js`). This is only a **UI gate**.

If your repo/pages is public, the JSON at `docs/data/fund_flow.json` is public.

To set/change the password:
1. Generate SHA-256:
```bash
python3 tools/hash_password.py "YourStrongPassword"
```
2. Replace `DETAILS_PASSWORD_SHA256` in `docs/js/auth.js` with the printed hash.

For real access control, use a server (not GitHub Pages) and require authentication before serving data.

## Data mapping
The converter preserves these key columns:
- SN, Date, Description, Funds Flow, Balance, Ref (Dr/Cr), Bank, Purpose, Instructed By, Transferred to, Cat, Remarks, Term, etc.
It also adds:
- `amount_signed` (negative for Dr/outflow, positive for Cr/inflow)
- `direction` (inflow/outflow)
