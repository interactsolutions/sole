#!/usr/bin/env python3
import argparse, json, os, re, datetime as dt
import pandas as pd
import numpy as np

def to_num(x):
    if pd.isna(x): return np.nan
    if isinstance(x,(int,float,np.integer,np.floating)): return float(x)
    s=str(x).strip()
    if s=="" or s.lower()=="nan": return np.nan
    s=s.replace(",","")
    neg=False
    if s.startswith("(") and s.endswith(")"):
        neg=True
        s=s[1:-1]
    s=re.sub(r"[^\d\.\-]", "", s)
    try:
        v=float(s)
        if neg: v=-v
        return v
    except:
        return np.nan

def main():
    ap = argparse.ArgumentParser(description="Convert Accounts flow Excel to JSON for GitHub Pages dashboard.")
    ap.add_argument("--excel", required=True, help="Path to .xlsx file")
    ap.add_argument("--sheet", default="account flow", help="Sheet name")
    ap.add_argument("--out", required=True, help="Output JSON path (fund_flow.json)")
    ap.add_argument("--meta", required=True, help="Output meta JSON path (meta.json)")
    args = ap.parse_args()

    df = pd.read_excel(args.excel, sheet_name=args.sheet)
    df = df.loc[:, [c for c in df.columns if not (isinstance(c,str) and c.startswith("Unnamed:"))]]
    df.columns=[str(c).strip() if c is not None else "" for c in df.columns]

    if "Date" in df.columns:
        df["Date"] = pd.to_datetime(df["Date"], errors="coerce")

    for col in ["Funds Flow","Balance"]:
        if col in df.columns:
            df[col] = df[col].apply(to_num)

    if "Ref" in df.columns and "Funds Flow" in df.columns:
        def signed(row):
            amt=row["Funds Flow"]
            if pd.isna(amt): return np.nan
            ref=row["Ref"]
            if isinstance(ref,str):
                r=ref.strip().lower()
                if r=="dr": return -abs(amt)
                if r=="cr": return abs(amt)
            return amt
        df["amount_signed"] = df.apply(signed, axis=1)
        df["direction"] = df["Ref"].apply(lambda x: ("outflow" if isinstance(x,str) and x.strip().lower()=="dr" else ("inflow" if isinstance(x,str) and x.strip().lower()=="cr" else None)))
    else:
        df["amount_signed"] = df.get("Funds Flow", np.nan)
        df["direction"] = None

    cols_out = [
        "Ref SN","SN","Date","Description","Funds Flow","Balance","Term","Ref","Bank","Purpose",
        "Instructed By","Transferred to","Cat","Remarks","error check","Co","TMA","TMP","Description.1",
        "Projections","Inv Ref","amount_signed","direction"
    ]
    cols_present=[c for c in cols_out if c in df.columns]

    def row_to_dict(row):
        d={}
        for c in cols_present:
            v=row.get(c)
            if pd.isna(v):
                d[c]=None
            elif isinstance(v,(pd.Timestamp,dt.datetime,dt.date)):
                d[c]=pd.to_datetime(v).date().isoformat()
            else:
                if isinstance(v,(np.integer,np.int64)): v=int(v)
                if isinstance(v,(np.floating,np.float64)): v=float(v)
                d[c]=v
        return d

    rows=[row_to_dict(r) for _,r in df.iterrows()]
    meta={
        "generated_at": dt.datetime.utcnow().replace(microsecond=0).isoformat()+"Z",
        "source_excel": os.path.basename(args.excel),
        "sheet": args.sheet,
        "row_count": int(df.shape[0]),
        "date_min": (df["Date"].min().date().isoformat() if "Date" in df.columns and pd.notna(df["Date"].min()) else None),
        "date_max": (df["Date"].max().date().isoformat() if "Date" in df.columns and pd.notna(df["Date"].max()) else None),
        "columns": cols_present,
    }

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump({"meta": meta, "rows": rows}, f, ensure_ascii=False)

    os.makedirs(os.path.dirname(args.meta), exist_ok=True)
    with open(args.meta, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    print(f"Wrote {args.out} ({len(rows)} rows)")
    print(f"Wrote {args.meta}")

if __name__ == "__main__":
    main()
