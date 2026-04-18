#!/usr/bin/env python3
"""
audit.py - Auditoría de coherencia entre secciones y descripciones de TCs
en las matrices canónicas de Stripe.

Salida: imprime tabla markdown en stdout con clasificación por TC.
"""
from __future__ import annotations
import re
import sys
import json
from pathlib import Path
from dataclasses import dataclass, asdict
from typing import Optional

ROOT = Path(__file__).resolve().parents[3]
MATRIZ_1 = ROOT / "docs" / "gateway-pg" / "stripe" / "matriz_cases.md"
MATRIZ_2 = ROOT / "docs" / "gateway-pg" / "stripe" / "matriz_cases2.md"

TC_ID_RE = re.compile(r"\bTS-STRIPE-(?:P2-)?(?:TC)?(?:RV)?\d{3,4}\b|TS-STRIPE-TC-RV\d{3}")
SECTION_RE = re.compile(r"^##\s+(\d+)\.\s+(.*?)\s*$")
SUBSECTION_RE = re.compile(r"^###\s+([\d.]+)\s+(.*?)\s*$")


@dataclass
class TCRow:
    tc_id: str
    section_num: str
    section_title: str
    subsection_title: str
    description: str
    estado: Optional[str]
    source_file: str
    line: int
    classification: str = ""
    proposed_description: str = ""
    reason: str = ""


def parse_matriz(path: Path) -> list[TCRow]:
    rows: list[TCRow] = []
    section_num = ""
    section_title = ""
    subsection_title = ""
    with path.open("r", encoding="utf-8") as f:
        for lineno, raw in enumerate(f, 1):
            line = raw.rstrip("\n")

            m_sec = SECTION_RE.match(line)
            if m_sec:
                section_num = m_sec.group(1)
                section_title = m_sec.group(2).strip()
                subsection_title = ""
                continue

            m_sub = SUBSECTION_RE.match(line)
            if m_sub:
                subsection_title = m_sub.group(2).strip()
                continue

            if not line.strip().startswith("|"):
                continue
            if re.match(r"^\|\s*-+", line):
                continue
            if re.search(r"\|\s*ID\s*\|", line):
                continue

            parts = [p.strip() for p in line.strip().strip("|").split("|")]
            if not parts:
                continue

            id_cell = parts[0]
            id_match = re.search(
                r"TS-STRIPE-(?:P2-)?TC\d{3,4}|TS-STRIPE-TC-RV\d{3}", id_cell
            )
            if not id_match:
                continue

            tc_id = id_match.group(0)

            description = parts[1] if len(parts) >= 2 else ""
            estado = parts[2] if len(parts) >= 3 else None

            rows.append(
                TCRow(
                    tc_id=tc_id,
                    section_num=section_num,
                    section_title=section_title,
                    subsection_title=subsection_title,
                    description=description,
                    estado=estado,
                    source_file=path.name,
                    line=lineno,
                )
            )
    return rows


# ----- Clasificación por sección -----
def _norm(s: str) -> str:
    return s.lower().strip()


def classify(row: TCRow) -> tuple[str, str, str]:
    """Devuelve (classification, proposed_description, reason)."""
    sec = _norm(row.section_title)
    desc = _norm(row.description)

    # Aliases RV deprecated
    if row.tc_id.startswith("TS-STRIPE-TC-RV"):
        return "DEPRECATED-ALIAS", row.description, "Alias colapsado (RV). Mantener como referencia cruzada."
    if "deprecado" in desc or "deprecated-redundant" in _norm(row.estado or ""):
        return "DEPRECATED-ALIAS", row.description, "Marcado como DEPRECADO en matriz. No requiere cambio."

    # Sección 1 - Configuración pasarela
    if "configuración de pasarela" in sec or "magiis app store" in sec:
        # Descripciones técnicas OK (no hablan de "alta de viaje")
        return "OK", row.description, "Sección de configuración de pasarela, descripción conforme."

    # Sección 2 (matriz_cases.md): "Alta de Viaje desde App Pax – Usuario App Pax (Modo Personal)"
    if "alta de viaje desde app pax" in sec and "modo personal" in sec:
        # Debe decir "Alta de Viaje desde app pax" y contener "modo personal"
        prohibited = []
        mismatch = False
        if "alta carrier" in desc or "desde carrier" in desc:
            prohibited.append("carrier")
            mismatch = True
        if "desde contractor" in desc or "portal contractor" in desc:
            prohibited.append("contractor")
            mismatch = True
        if "modo business" in desc or "colaborador" in desc or "empresa individuo" in desc:
            prohibited.append("otro-rol")
            mismatch = True
        # Positivo: debe incluir "modo personal" y "desde app pax" o "app pax"
        has_personal = "modo personal" in desc
        has_pax_source = "desde app pax" in desc or "app pax" in desc
        if mismatch:
            proposed = reword_to_section(row, "pax", "personal")
            return (
                "MISMATCH",
                proposed,
                f"Sección dice 'desde App Pax / Modo Personal' pero descripción menciona: {', '.join(prohibited)}",
            )
        if not has_personal or not has_pax_source:
            proposed = reword_to_section(row, "pax", "personal")
            return (
                "MISMATCH",
                proposed,
                "Descripción no refleja claramente 'desde app pax' y 'modo personal'.",
            )
        # Sección 2.4 (Wallet) — verificar que hable de wallet / eliminación
        if "wallet" in _norm(row.subsection_title) and "wallet" not in desc and "eliminar" not in desc:
            return "NECESITA-CONTEXTO", row.description, "Sección 2.4 Wallet — descripción no menciona wallet/eliminación."
        return "OK", row.description, "Coherente con sección."

    # Sección 3 (matriz_cases.md): "Alta de Viaje desde App Pax – Usuario App Pax (Modo Business / Colaborador)"
    if "alta de viaje desde app pax" in sec and ("modo business" in sec or "colaborador" in sec):
        prohibited = []
        mismatch = False
        if "modo personal" in desc:
            prohibited.append("modo personal")
            mismatch = True
        if "empresa individuo" in desc:
            prohibited.append("empresa individuo")
            mismatch = True
        if "alta carrier" in desc or "desde carrier" in desc:
            prohibited.append("carrier")
            mismatch = True
        if "desde contractor" in desc or "portal contractor" in desc:
            prohibited.append("contractor")
            mismatch = True
        if "modo business" not in desc and "colaborador" not in desc:
            mismatch = True
            prohibited.append("falta 'modo business'")
        if mismatch:
            proposed = reword_to_section(row, "pax", "business")
            return (
                "MISMATCH",
                proposed,
                f"Sección dice 'desde App Pax / Modo Business'. Conflictos: {', '.join(prohibited)}",
            )
        return "OK", row.description, "Coherente con sección."

    # Sección 4 (matriz_cases.md): "Alta de Viaje desde Carrier – Usuario Colaborador o Asociado de Contractor"
    if "alta de viaje desde carrier" in sec and ("colaborador" in sec or "asociado de contractor" in sec):
        prohibited = []
        mismatch = False
        if "desde app pax" in desc or "alta de viaje desde app pax" in desc:
            prohibited.append("app pax")
            mismatch = True
        if "empresa individuo" in desc:
            prohibited.append("empresa individuo")
            mismatch = True
        if "desde contractor" in desc or "portal contractor" in desc:
            prohibited.append("contractor")
            mismatch = True
        # Debe decir "desde carrier" y mencionar colaborador/asociado
        if "desde carrier" not in desc:
            mismatch = True
            prohibited.append("falta 'desde carrier'")
        if mismatch:
            proposed = reword_to_section(row, "carrier", "colaborador")
            return (
                "MISMATCH",
                proposed,
                f"Sección dice 'desde Carrier / Colaborador'. Conflictos: {', '.join(prohibited)}",
            )
        return "OK", row.description, "Coherente con sección."

    # Sección 5: "Alta de Viaje desde Carrier – Usuario App Pax"
    if "alta de viaje desde carrier" in sec and "usuario app pax" in sec:
        prohibited = []
        mismatch = False
        if "desde app pax" in desc and "desde carrier" not in desc:
            prohibited.append("origen app pax (no carrier)")
            mismatch = True
        if "colaborador" in desc or "empresa individuo" in desc:
            prohibited.append("otro rol")
            mismatch = True
        if mismatch:
            return ("MISMATCH", row.description, f"Conflictos: {', '.join(prohibited)}")
        return "OK", row.description, "Coherente con sección."

    # Sección 6: "Alta de Viaje desde Carrier – Usuario Empresa Individuo"
    if "alta de viaje desde carrier" in sec and "empresa individuo" in sec:
        prohibited = []
        mismatch = False
        if "desde app pax" in desc:
            prohibited.append("app pax")
            mismatch = True
        if "modo personal" in desc or "modo business" in desc or "colaborador" in desc:
            prohibited.append("otro rol")
            mismatch = True
        if "empresa individuo" not in desc:
            prohibited.append("falta 'empresa individuo'")
            mismatch = True
        if "desde carrier" not in desc:
            prohibited.append("falta 'desde carrier'")
            mismatch = True
        if mismatch:
            proposed = reword_to_section(row, "carrier", "empresa")
            return (
                "MISMATCH",
                proposed,
                f"Sección dice 'desde Carrier / Empresa Individuo'. Conflictos: {', '.join(prohibited)}",
            )
        return "OK", row.description, "Coherente con sección."

    # Sección 7: Cargo a Bordo – Usuario App Pax (desde Carrier)
    if "cargo a bordo" in sec and "app pax" in sec:
        prohibited = []
        mismatch = False
        if "hold desde alta de viaje" in desc:
            prohibited.append("hold-desde-alta-de-viaje (no aplica a cargo a bordo)")
            mismatch = True
        if "colaborador" in desc or "empresa individuo" in desc:
            prohibited.append("otro rol")
            mismatch = True
        if "cargo a bordo" not in desc:
            prohibited.append("falta 'cargo a bordo'")
            mismatch = True
        if mismatch:
            return ("MISMATCH", row.description, f"Conflictos: {', '.join(prohibited)}")
        return "OK", row.description, "Coherente con sección."

    # Sección 8: Cargo a Bordo – Colaborador/Asociado de Contractor (desde Carrier)
    if "cargo a bordo" in sec and ("colaborador" in sec or "asociado de contractor" in sec):
        prohibited = []
        mismatch = False
        if "app pax" in desc and "usuario app pax" not in desc:
            # En esta sección el pasajero no es app pax; debe ser colaborador/asociado
            pass
        if "empresa individuo" in desc:
            prohibited.append("empresa individuo")
            mismatch = True
        if "hold desde alta de viaje" in desc:
            prohibited.append("hold-desde-alta-de-viaje (no aplica a cargo a bordo)")
            mismatch = True
        if "cargo a bordo" not in desc:
            prohibited.append("falta 'cargo a bordo'")
            mismatch = True
        if mismatch:
            return ("MISMATCH", row.description, f"Conflictos: {', '.join(prohibited)}")
        return "OK", row.description, "Coherente con sección."

    # Sección 9: Cargo a Bordo – Empresa Individuo (desde Carrier)
    if "cargo a bordo" in sec and "empresa individuo" in sec:
        prohibited = []
        mismatch = False
        if "colaborador" in desc or "app pax" in desc:
            prohibited.append("otro rol")
            mismatch = True
        if "hold desde alta de viaje" in desc:
            prohibited.append("hold-desde-alta-de-viaje (no aplica a cargo a bordo)")
            mismatch = True
        if "cargo a bordo" not in desc:
            prohibited.append("falta 'cargo a bordo'")
            mismatch = True
        if mismatch:
            return ("MISMATCH", row.description, f"Conflictos: {', '.join(prohibited)}")
        return "OK", row.description, "Coherente con sección."

    # matriz_cases2.md - Sección 1: Portal Contractor - Alta de Tarjetas y Vinculación
    if "portal contractor" in sec and "alta de tarjetas" in sec:
        # Descripciones dicen "desde app pax" para colaborador de contractor — esto ES coherente (contractor tiene su app pax)
        # Sin embargo la sección se llama "Portal Contractor" pero los TCs hablan de "desde app pax" — ambigüedad documentada.
        # Si la descripción no menciona "colaborador de contractor" → NECESITA CONTEXTO
        if "colaborador de contractor" not in desc and "contractor" not in desc:
            return (
                "NECESITA-CONTEXTO",
                row.description,
                "Sección 1 matriz2 dice 'Portal Contractor'; revisar si origen es portal contractor o app pax modo business.",
            )
        return "OK", row.description, "Coherente con sección (contractor + app pax business)."

    # matriz_cases2.md - Sección 2: Flujo Quote
    if sec.startswith("flujo quote"):
        if "desde quote" not in desc:
            return "MISMATCH", row.description, "Falta 'desde Quote' en descripción."
        return "OK", row.description, "Coherente."

    # matriz_cases2.md - Secciones 3-6: Viajes Recurrentes
    if "viajes recurrentes" in sec:
        if "recurrente" not in desc:
            return "MISMATCH", row.description, "Falta 'Recurrente' en descripción."
        # Validar portal
        if "portal contractor" in sec and "portal contractor" not in desc and "desde portal contractor" not in desc:
            return "MISMATCH", row.description, "Sección dice 'Portal Contractor' pero descripción no lo refleja."
        if "portal carrier" in sec and "desde carrier" not in desc:
            return "MISMATCH", row.description, "Sección dice 'Portal Carrier' pero descripción no lo refleja."
        # Validar rol
        if "usuario colaboradores" in sec or "colaboradores" in sec or "colaborador)" in sec:
            if "colaborador" not in desc:
                return "MISMATCH", row.description, "Sección dice 'Colaboradores' pero descripción no lo refleja."
        if "usuario app pax" in sec and "app pax" not in desc:
            return "MISMATCH", row.description, "Sección dice 'Usuario App Pax' pero descripción no lo refleja."
        if "empresa individuo" in sec and "empresa individuo" not in desc:
            return "MISMATCH", row.description, "Sección dice 'Empresa Individuo' pero descripción no lo refleja."
        return "OK", row.description, "Coherente."

    # matriz_cases2.md - Sección 7: Reactivación
    if "reactivación" in sec:
        if "reactivación" not in desc and "reactivar" not in desc:
            return "MISMATCH", row.description, "Falta 'Reactivación' en descripción."
        return "OK", row.description, "Coherente."

    # matriz_cases2.md - Sección 8,9: Clonación
    if "clonación" in sec:
        if "clonación" not in desc and "clonar" not in desc:
            return "MISMATCH", row.description, "Falta 'Clonación' en descripción."
        return "OK", row.description, "Coherente."

    # matriz_cases2.md - Sección 10,11: Edición
    if "edición" in sec and "conflicto" not in sec:
        if "edición" not in desc:
            # TC082/083/088/089 ya documentados como flag fuera-de-sección
            return (
                "NECESITA-CONTEXTO",
                row.description,
                "Sección 'Edición' con descripción 'Clonación' — flag fuera-de-sección ya documentado.",
            )
        return "OK", row.description, "Coherente."
    if "edición en conflicto" in sec:
        if "edición en conflicto" not in desc and "conflicto" not in desc:
            # TC088/089 quedan flaggeados
            if "clonación" in desc:
                return (
                    "NECESITA-CONTEXTO",
                    row.description,
                    "Sección 'Edición en conflicto' con descripción 'Clonación' — flag fuera-de-sección ya documentado.",
                )
            return "MISMATCH", row.description, "Falta 'edición en conflicto' en descripción."
        return "OK", row.description, "Coherente."

    return "NECESITA-CONTEXTO", row.description, f"Sección no mapeada: '{row.section_title}'."


def reword_to_section(row: TCRow, origen: str, rol: str) -> str:
    """Propone una descripción reescrita según origen y rol."""
    d = row.description

    # Normalizar conectores
    if origen == "pax" and rol == "personal":
        # Patrón: "Validar Alta carrier de Viaje..." → "Validar Alta de Viaje desde app pax..."
        d = re.sub(
            r"Validar\s+Alta\s+carrier\s+de\s+Viaje",
            "Validar Alta de Viaje desde app pax",
            d,
            flags=re.IGNORECASE,
        )
        d = re.sub(
            r"Validar\s+Alta\s+de\s+Viaje\s+desde\s+carrier",
            "Validar Alta de Viaje desde app pax",
            d,
            flags=re.IGNORECASE,
        )
        # Forzar "modo personal"
        if "modo personal" not in d.lower():
            d = re.sub(
                r"(usuario\s+app\s+pax)(\s+modo\s+\w+)?",
                r"\1 modo personal",
                d,
                flags=re.IGNORECASE,
                count=1,
            )
        # Si tiene "Validar Alta de Viaje para usuario" sin origen, insertar "desde app pax"
        d = re.sub(
            r"Validar\s+Alta\s+de\s+Viaje\s+para\s+usuario\s+app\s+pax\s+modo\s+personal\b(?!\s+desde)",
            "Validar Alta de Viaje desde app pax para usuario app pax modo personal",
            d,
            flags=re.IGNORECASE,
        )
        # Remover "desde carrier" residual
        d = re.sub(r"\s+desde\s+carrier\b", "", d, flags=re.IGNORECASE)
    elif origen == "pax" and rol == "business":
        d = re.sub(
            r"Validar\s+Alta\s+carrier\s+de\s+Viaje",
            "Validar Alta de Viaje desde app pax",
            d,
            flags=re.IGNORECASE,
        )
        d = re.sub(
            r"Validar\s+Alta\s+de\s+Viaje\s+desde\s+carrier",
            "Validar Alta de Viaje desde app pax",
            d,
            flags=re.IGNORECASE,
        )
    elif origen == "carrier" and rol == "colaborador":
        d = re.sub(
            r"Validar\s+Alta\s+de\s+Viaje\s+desde\s+app\s+pax",
            "Validar Alta de Viaje desde carrier",
            d,
            flags=re.IGNORECASE,
        )
    elif origen == "carrier" and rol == "empresa":
        d = re.sub(
            r"Validar\s+Alta\s+de\s+Viaje\s+desde\s+app\s+pax",
            "Validar Alta de Viaje desde carrier",
            d,
            flags=re.IGNORECASE,
        )
    return d.strip()


def main() -> int:
    rows1 = parse_matriz(MATRIZ_1)
    rows2 = parse_matriz(MATRIZ_2)
    all_rows = rows1 + rows2

    buckets = {"OK": 0, "MISMATCH": 0, "AMBIGUO": 0, "DEPRECATED-ALIAS": 0, "NECESITA-CONTEXTO": 0}
    for r in all_rows:
        c, proposed, reason = classify(r)
        r.classification = c
        r.proposed_description = proposed
        r.reason = reason
        buckets[c] = buckets.get(c, 0) + 1

    # Tabla por archivo
    def emit_table(rows: list[TCRow], title: str) -> str:
        out = [f"### {title}", "", "| TC ID | Sección | Subsección | Clasificación | Razón | Descripción propuesta |", "|---|---|---|---|---|---|"]
        for r in rows:
            sec = f"{r.section_num}. {r.section_title}" if r.section_num else r.section_title
            sub = r.subsection_title or "—"
            prop = r.proposed_description if r.classification in ("MISMATCH", "AMBIGUO") else "—"
            out.append(f"| `{r.tc_id}` | {sec} | {sub} | {r.classification} | {r.reason} | {prop} |")
        return "\n".join(out)

    header = [
        "# Auditoría de Coherencia · Matrices Stripe",
        "",
        f"**Fecha:** 2026-04-18  ",
        f"**Rama:** `feature/ai-matriz-coherencia`  ",
        f"**Fuentes auditadas:**",
        f"- `docs/gateway-pg/stripe/matriz_cases.md` ({len(rows1)} TCs)",
        f"- `docs/gateway-pg/stripe/matriz_cases2.md` ({len(rows2)} TCs)",
        f"- Total: **{len(all_rows)} TCs**",
        "",
        "## Resumen por clasificación",
        "",
        "| Clasificación | Conteo |",
        "|---|---|",
    ]
    for k in ("OK", "MISMATCH", "AMBIGUO", "DEPRECATED-ALIAS", "NECESITA-CONTEXTO"):
        header.append(f"| {k} | {buckets.get(k, 0)} |")
    header.append("")
    header.append("**Leyenda:**")
    header.append("")
    header.append("- **OK** — descripción coherente con título de sección.")
    header.append("- **MISMATCH** — descripción contradice sección (ej: sección dice 'desde App Pax' y descripción dice 'desde carrier').")
    header.append("- **AMBIGUO** — ambigüedad sobre card-flow (vincular tarjeta nueva vs usar existente). Ya diferenciada en Fase 2 con sufijos CARD-NEW / CARD-EXISTING.")
    header.append("- **DEPRECATED-ALIAS** — alias RV o TC marcado como `deprecated-redundant`. No se modifica (mantiene trazabilidad).")
    header.append("- **NECESITA-CONTEXTO** — requiere decisión humana (ej: TCs flag fuera-de-sección en Edición/Conflicto).")
    header.append("")
    header.append("---")
    header.append("")

    body = [
        emit_table(rows1, "matriz_cases.md"),
        "",
        "---",
        "",
        emit_table(rows2, "matriz_cases2.md"),
        "",
    ]

    report = "\n".join(header + body)
    out_path = ROOT / "docs" / "gateway-pg" / "stripe" / "AUDIT-REPORT.md"
    out_path.write_text(report, encoding="utf-8")
    print(f"AUDIT-REPORT.md escrito en: {out_path}")
    print("Conteos:")
    for k, v in buckets.items():
        print(f"  {k}: {v}")

    # También emitir JSON para correcciones automatizadas
    json_out = ROOT / "scripts" / "ai" / "matriz-coherencia" / "audit-data.json"
    json_out.parent.mkdir(parents=True, exist_ok=True)
    with json_out.open("w", encoding="utf-8") as f:
        json.dump(
            {
                "generated_at": "2026-04-18",
                "total": len(all_rows),
                "buckets": buckets,
                "rows": [asdict(r) for r in all_rows],
            },
            f,
            ensure_ascii=False,
            indent=2,
        )
    print(f"Datos de auditoría (JSON): {json_out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
