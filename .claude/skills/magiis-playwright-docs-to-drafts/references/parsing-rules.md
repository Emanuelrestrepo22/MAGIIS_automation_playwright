# Parsing Rules

## Objective
Extract test cases from source documents and convert them into a common, traceable structure.

## Source priority
1. `.xlsx`
2. `.txt`
3. `.docx`
4. `.md`

## Extraction rules
- Preserve the original test case ID whenever it exists.
- Extract title, module, portal, environment, preconditions, steps, and expected results separately.
- If one row contains multiple cases, split them only when traceability remains clear.
- If a field is missing, leave it empty and record the gap instead of inventing data.
- Always preserve `source_type` and `source_file`.

## Normalization rules
- Map column aliases and synonyms into standard keys.
- Normalize priority labels when the source uses inconsistent naming.
- Normalize environments into arrays such as `["TEST"]`, `["UAT"]`, or `["TEST", "UAT"]`.
- Convert steps and expected results into ordered arrays.
- Flag semantic duplicates when two cases share the same business objective and core validations.
