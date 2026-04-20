# Output Contracts

## Required outputs
- `appium-mobile-backlog.md`
- `appium-handoff-map.json`
- `mobile-phase-coverage.json`
- `appium draft specs or execution plans`
- `mobile risks and blockers`

## appium-mobile-backlog.md
Each item should include:
- `test_case_id`
- `gateway`
- `actor`
- `mobile_phase`
- `priority`
- `target_file`
- `dependencies`
- `blockers`

## appium-handoff-map.json
Each entry should include:
- `test_case_id`
- `journey_id_strategy`
- `playwright_outputs_required`
- `appium_start_phase`
- `actor`
- `data_required`

## mobile-phase-coverage.json
Each entry should include:
- `test_case_id`
- `driver_phases`
- `passenger_phases`
- `payment_validation_sources`
- `coverage_status`

## Draft artifacts
Prefer one of:
- Appium screen proposal
- Appium execution plan
- Appium draft spec
- journey update helper
