# Output Contracts

## Required outputs
- `normalized-test-cases.json`
- `critical-flows.json`
- `automation-backlog.md`
- `traceability-map.json`

## Output order
1. Critical flow summary
2. Prioritized automation backlog
3. File tree proposal
4. Draft Playwright specs
5. Risks and gaps

## Minimum traceability per case
- `test_case_id`
- `title`
- `module`
- `portal`
- `environment`
- `priority`
- `critical_flow`
- `source_type`
- `source_file`
- `playwright_assets.spec_file`
- `playwright_assets.page_objects`
- `dependencies`
- `risks_gaps`

## Minimum normalized test case contract
```json
{
  "test_case_id": "TS-AUTH-01",
  "title": "validar login carrier",
  "module": "auth",
  "portal": "carrier",
  "environment": ["TEST", "UAT"],
  "priority": "P1",
  "source_type": "xlsx",
  "source_file": "Auth_Test_Suite.xlsx",
  "preconditions": [],
  "steps": [],
  "expected_results": [],
  "tags": ["@auth", "@smoke"],
  "critical_flow": true,
  "dependencies": [],
  "risks_gaps": [],
  "playwright_assets": {
    "spec_file": "tests/specs/auth/TS-AUTH-01-validar-login-carrier.spec.ts",
    "page_objects": ["LoginPage"],
    "fixtures": [],
    "data_files": []
  }
}
```
