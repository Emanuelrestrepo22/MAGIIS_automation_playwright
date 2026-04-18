#!/usr/bin/env python3
"""
sync-storage.py - Sincroniza storage/normalized-test-cases.json y
storage/traceability-map.json con la correccion de coherencia seccion-
descripcion aplicada en el xlsx y las matrices md.

Alcance estricto:
- Solo los TCs del allowlist (TC1011, TC1012, TC1016) y el alias RV004.
- Usa regex puntual "E2E Alta carrier de Viaje" -> "E2E Alta de Viaje desde app pax"
  preservando el prefijo "E2E " y el formato corto "Hold y Cobro" que vive
  en estos archivos (derivados del xlsx, no del md).
- Resto de los archivos intactos.
"""
from __future__ import annotations
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
STORAGE_NORMALIZED = ROOT / "storage" / "normalized-test-cases.json"
STORAGE_TRACE = ROOT / "storage" / "traceability-map.json"

TARGET_IDS = {"TS-STRIPE-TC1011", "TS-STRIPE-TC1012", "TS-STRIPE-TC1016", "TS-STRIPE-TC-RV004"}
PATTERN = re.compile(r"Alta\s+carrier\s+de\s+Viaje", re.IGNORECASE)
REPLACEMENT = "Alta de Viaje desde app pax"


def sync_list(items: list) -> int:
    """Actualiza titulos en una lista de TC-like objects. Devuelve cant modificada."""
    changed = 0
    for obj in items:
        if not isinstance(obj, dict):
            continue
        tid = obj.get("test_case_id") or obj.get("id")
        if tid not in TARGET_IDS:
            continue
        title = obj.get("title")
        if not isinstance(title, str):
            continue
        new = PATTERN.sub(REPLACEMENT, title)
        if new != title:
            obj["title"] = new
            changed += 1
            print(f"  [updated] {tid}")
            print(f"    old: {title[:140]}")
            print(f"    new: {new[:140]}")
    return changed


def sync_dict_tree(obj, path=""):
    """Recorre un JSON arbitrario y actualiza campos 'title' dentro de objetos con un TC ID target."""
    changed = 0
    if isinstance(obj, dict):
        tid = obj.get("test_case_id") or obj.get("id")
        title = obj.get("title")
        if tid in TARGET_IDS and isinstance(title, str):
            new = PATTERN.sub(REPLACEMENT, title)
            if new != title:
                obj["title"] = new
                changed += 1
                print(f"  [updated @ {path}] {tid}")
                print(f"    old: {title[:140]}")
                print(f"    new: {new[:140]}")
        for k, v in obj.items():
            changed += sync_dict_tree(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            changed += sync_dict_tree(v, f"{path}[{i}]")
    return changed


def process_file(path: Path) -> int:
    if not path.exists():
        print(f"  [skip] {path} no existe")
        return 0
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    total = 0
    # sync_dict_tree recursea en listas y dicts; cubre ambas formas (lista plana
    # de TCs o estructura anidada modules -> test_cases).
    total = sync_dict_tree(data)
    if total:
        with path.open("w", encoding="utf-8", newline="\n") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")
    return total


def main() -> int:
    grand_total = 0
    print(f"-> {STORAGE_NORMALIZED.name}")
    grand_total += process_file(STORAGE_NORMALIZED)
    print(f"-> {STORAGE_TRACE.name}")
    grand_total += process_file(STORAGE_TRACE)
    print(f"\nTotal titulos actualizados: {grand_total}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
