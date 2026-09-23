#!/usr/bin/env python3
from __future__ import annotations
import json, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "tools" / "verification_registry.json"

REQUIRED = [
    "AGENTS.md", "README.md", "research/AGENTS.md", "research/CLAIM_LEDGER.md",
    "docs/AGENTS.md", "docs/TEAM_BOARD.md", "docs/ORCHESTRATOR_COMMUNICATION.md",
    "data/AGENTS.md", "src/AGENTS.md", "tools/AGENTS.md"
]

def contract() -> int:
    missing=[p for p in REQUIRED if not (ROOT/p).exists()]
    if missing:
        print("missing required repository contract files:", ", ".join(missing))
        return 1
    print(f"repository contract: {len(REQUIRED)} required files present")
    return 0

def json_check() -> int:
    files=list((ROOT/"data").rglob("*.json"))+[REGISTRY]
    errors=[]
    for path in files:
        try: json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc: errors.append(f"{path.relative_to(ROOT)}: {exc}")
    if errors:
        print("\n".join(errors)); return 1
    print(f"structured data: parsed {len(files)} JSON files")
    return 0

def provenance() -> int:
    bad=[]
    for path in (ROOT/"data"/"presets").glob("*.json") if (ROOT/"data"/"presets").exists() else []:
        obj=json.loads(path.read_text(encoding="utf-8"))
        if not obj.get("warning"): bad.append(f"{path.name}: missing warning")
        citations=obj.get("citations",{})
        if not isinstance(citations,dict) or not citations: bad.append(f"{path.name}: missing citation map")
    if bad:
        print("\n".join(bad)); return 1
    print("provenance basics: preset warning/citation maps present")
    return 0

def orchestrate(mode: str, list_only: bool=False) -> int:
    reg=json.loads(REGISTRY.read_text(encoding="utf-8"))
    selected=[c for c in reg["checks"] if mode in c["modes"]]
    if list_only:
        for c in selected: print(c["id"])
        return 0
    result=0
    for c in selected:
        proc=subprocess.run(c["command"],cwd=ROOT,text=True,capture_output=True)
        state="PASS" if proc.returncode==0 else "FAIL"
        print(f"[{state}] {c['id']}")
        out=(proc.stdout+proc.stderr).strip()
        if out: print(out)
        result=max(result,proc.returncode)
    return result

def main() -> int:
    args=sys.argv[1:]
    if args==["_contract"]: return contract()
    if args==["_json"]: return json_check()
    if args==["_provenance"]: return provenance()
    list_only=False
    if args and args[0]=="--list":
        list_only=True; args=args[1:]
    mode=args[0] if args else "quick"
    if mode not in {"quick","premerge"}:
        print("usage: python tools/verify.py [--list] {quick|premerge}",file=sys.stderr); return 2
    return orchestrate(mode,list_only)

if __name__=="__main__":
    raise SystemExit(main())
