#!/usr/bin/env python3
"""
sync-rename-personal.py - Aplica al JSON el rename semantico "Usuario App Pax"
(Eje 2 - tipo usuario) -> "Usuario Personal" y los fixes TC082/083/088/089
(Clonacion -> Edicion). PRESERVA "desde App Pax" (Eje 1 - portal).

Scope: docs/gateway-pg/stripe/normalized-test-cases.json
Alcance estricto: solo title + section + subsection. No toca steps,
preconditions, expected_results, tags, priorities.
"""
from __future__ import annotations
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
JSON_PATH = ROOT / "docs" / "gateway-pg" / "stripe" / "normalized-test-cases.json"


def rename_user_type(text: str) -> str:
    """Aplica renames Eje 2 preservando Eje 1 (portal)."""
    if not text:
        return text
    out = text
    # Orden importa: "usuario app pax modo personal" antes que "usuario app pax"
    replacements = [
        ("Usuario App Pax (Modo Personal)", "Usuario Personal"),
        ("Usuario App Pax (Modo Business / Colaborador)", "Usuario Business / Colaborador"),
        ("Usuario App Pax", "Usuario Personal"),
        ("usuario app pax modo personal", "usuario personal"),
        ("usuario app pax modo business", "usuario business"),
        ("usuario app pax existente", "usuario personal existente"),
        ("para usuario app pax con", "para usuario personal con"),
        ("para usuario app pax ", "para usuario personal "),
        ("para usuario app pax,", "para usuario personal,"),
        ("para usuario app pax.", "para usuario personal."),
        ("— usuario app pax", "— usuario personal"),
        (" usuario app pax ", " usuario personal "),
        # "App Pax" como subsección (Eje 2) en Flujo Quote
        ("App Pax – sin 3DS", "Personal – sin 3DS"),
        ("App Pax – con 3DS", "Personal – con 3DS"),
    ]
    for old, new in replacements:
        out = out.replace(old, new)
    return out


# Fixes TC082/083/088/089 (Clonación -> Edición según sección)
FIXES = {
    "TS-STRIPE-P2-TC082": (
        "Validar Clonación de viaje finalizado desde carrier",
        "Validar Edición de viaje programado desde carrier",
    ),
    "TS-STRIPE-P2-TC083": (
        "Validar Clonación de viaje finalizado para usuario",
        "Validar Edición de viaje programado para usuario",
    ),
    "TS-STRIPE-P2-TC088": (
        "Validar Clonación de viaje finalizado desde carrier",
        "Validar Edición en conflicto desde carrier",
    ),
    "TS-STRIPE-P2-TC089": (
        "Validar Clonación de viaje finalizado para usuario",
        "Validar Edición en conflicto para usuario",
    ),
}


def main() -> int:
    with JSON_PATH.open("r", encoding="utf-8") as f:
        data = json.load(f)

    changed_titles = 0
    changed_sections = 0
    changed_subsections = 0
    fixed_tcs = 0

    for case in data["cases"]:
        tid = case.get("test_case_id", "")

        # Fix Clonación -> Edición primero (antes del rename global)
        if tid in FIXES:
            old_prefix, new_prefix = FIXES[tid]
            if case.get("title", "").startswith(old_prefix):
                case["title"] = case["title"].replace(old_prefix, new_prefix, 1)
                fixed_tcs += 1

        # Rename Eje 2 en title
        old_title = case.get("title", "")
        new_title = rename_user_type(old_title)
        if new_title != old_title:
            case["title"] = new_title
            changed_titles += 1

        # Rename Eje 2 en section
        old_section = case.get("section", "")
        new_section = rename_user_type(old_section)
        if new_section != old_section:
            case["section"] = new_section
            changed_sections += 1

        # Rename Eje 2 en subsection
        old_subsection = case.get("subsection", "")
        new_subsection = rename_user_type(old_subsection)
        if new_subsection != old_subsection:
            case["subsection"] = new_subsection
            changed_subsections += 1

    # Actualizar notes
    notes = data.get("notes", [])
    new_note = (
        "Sincronizado 2026-04-19 (feature/ai-matriz-sources-rename): "
        "rename Eje 2 'Usuario App Pax' -> 'Usuario Personal' "
        "(preservado 'desde App Pax' como portal Eje 1). "
        "Fix TC082/083 Clonación -> Edición de viaje programado. "
        "Fix TC088/089 Clonación -> Edición en conflicto."
    )
    if new_note not in notes:
        notes.append(new_note)
    data["notes"] = notes

    data["generated_at"] = "2026-04-19T00:00:00.000Z"

    with JSON_PATH.open("w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"Titles renombrados (Eje 2):    {changed_titles}")
    print(f"Sections renombrados (Eje 2):  {changed_sections}")
    print(f"Subsections renombrados:        {changed_subsections}")
    print(f"TCs Clonación -> Edición:       {fixed_tcs}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
