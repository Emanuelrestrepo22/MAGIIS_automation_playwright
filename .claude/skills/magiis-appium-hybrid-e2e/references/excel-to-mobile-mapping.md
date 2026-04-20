# Excel To Mobile Mapping

## Goal
Map Excel test cases into the mobile phases of a hybrid E2E journey.

## What to extract
- `test_case_id`
- business flow name
- actor that performs each step
- step owner: web or mobile
- gateway involved
- trip lifecycle point where mobile starts
- payment validation dependencies

## Mapping heuristics
- steps that create, edit, or submit trips from portals belong to Playwright
- steps that accept, navigate, start, route, or complete trips in Android belong to Appium
- wallet or card actions in passenger app belong to Appium passenger coverage
- payment finalization triggered by trip completion in driver app belongs to Appium driver coverage

## Mobile actor detection
- if the Excel mentions driver acceptance, route simulation, arrival, start trip, or end trip -> `driver`
- if the Excel mentions wallet, add card, select card, passenger confirmation, or passenger app -> `passenger`
- if both appear, split the journey into multiple mobile phases

## Required handoff from Playwright
- `journeyId`
- `testCaseId`
- `gateway`
- `tripId`
- `driverId` when available
- `riderId` when available
- `paymentReference` when available
- current status before Appium starts

## Output recommendation
Represent each normalized case with:
- source TC ID
- web phases
- mobile phases
- actor
- handoff data
- validation requirements
