#!/usr/bin/env python3
"""
sync-json.py - Actualiza normalized-test-cases.json con los titulos corregidos
derivados de las matrices canonicas.

Alcance acotado (principio CLAUDE.md "cambios acotados al objetivo pedido"):
solo modifica los TCs en la allowlist MISMATCH_FIXES detectados por la auditoria.
No toca TCs deprecated, aliases RV, ni cambios cosmeticos.
"""
from __future__ import annotations
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
JSON_PATH = ROOT / "docs" / "gateway-pg" / "stripe" / "normalized-test-cases.json"
MATRIZ_1 = ROOT / "docs" / "gateway-pg" / "stripe" / "matriz_cases.md"
MATRIZ_2 = ROOT / "docs" / "gateway-pg" / "stripe" / "matriz_cases2.md"

# Allowlist de TCs a sincronizar - SOLO los MISMATCH corregidos.
# RV003/RV004/RV008 son aliases colapsados de TC1011/TC1012/TC1016 y heredan
# el titulo incorrecto; se incluyen para mantener coherencia con el canonico.
MISMATCH_FIXES = {
    "TS-STRIPE-TC1011",
    "TS-STRIPE-TC1012",
    "TS-STRIPE-TC1016",
}
ALIAS_INHERIT = {
    "TS-STRIPE-TC-RV003": "TS-STRIPE-TC1011",
    "TS-STRIPE-TC-RV004": "TS-STRIPE-TC1012",
    "TS-STRIPE-TC-RV008": "TS-STRIPE-TC1016",
}


def extract_title_from_matriz(path: Path, tc_id: str) -> str | None:
    """Busca en la matriz la fila del TC y devuelve la descripcion limpia."""
    tc_re = re.compile(re.escape(tc_id) + r"\b")
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line.startswith("|"):
            continue
        if not tc_re.search(line):
            continue
        parts = [p.strip() for p in line.strip("|").split("|")]
        # Columna 0 es el ID, columna 1 es la descripcion
        if len(parts) < 2:
            continue
        # Verificar que la columna 0 contenga justamente el ID exacto
        if tc_id not in parts[0]:
            continue
        desc = parts[1]
        desc = desc.replace("**", "")
        desc = re.sub(r"\s+", " ", desc).strip()
        return desc
    return None


def main() -> int:
    with JSON_PATH.open("r", encoding="utf-8") as f:
        data = json.load(f)

    changed = 0
    # Primero canonicos (MISMATCH_FIXES)
    canonical_titles: dict[str, str] = {}
    for case in data["cases"]:
        tid = case["test_case_id"]
        if tid in MISMATCH_FIXES:
            new_title: str | None = None
            for matriz in (MATRIZ_1, MATRIZ_2):
                new_title = extract_title_from_matriz(matriz, tid)
                if new_title:
                    break
            if not new_title:
                print(f"  [warning] {tid}: no se encontro en ninguna matriz")
                continue
            canonical_titles[tid] = new_title
            old = case["title"]
            if old.strip() != new_title:
                case["title"] = new_title
                changed += 1
                print(f"  [updated] {tid}")
                print(f"    old: {old[:130]}")
                print(f"    new: {new_title[:130]}")

    # Aliases RV que heredan el titulo del canonico
    for case in data["cases"]:
        tid = case["test_case_id"]
        canonical = ALIAS_INHERIT.get(tid)
        if not canonical:
            continue
        new_title = canonical_titles.get(canonical)
        if not new_title:
            continue
        old = case["title"]
        if old.strip() != new_title:
            case["title"] = new_title
            changed += 1
            print(f"  [updated alias] {tid} (<- {canonical})")
            print(f"    old: {old[:130]}")
            print(f"    new: {new_title[:130]}")

    # Nota de sincronizacion
    notes = data.get("notes", [])
    note_entry = "Sincronizado 2026-04-18: coherencia seccion<->descripcion aplicada (TC1011/TC1012/TC1016 corregidos en Seccion 2)."
    if note_entry not in notes:
        notes.append(note_entry)
    data["notes"] = notes

    # Actualizar fecha sin sobrescribir otras claves
    data["generated_at"] = "2026-04-18T00:00:00.000Z"

    with JSON_PATH.open("w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"\nTCs actualizados: {changed}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
