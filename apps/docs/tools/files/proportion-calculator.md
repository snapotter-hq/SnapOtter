---
description: Solve the rule of three, find X from three known values.
---

# Proportion Calculator {#proportion-calculator}

Solve the rule of three (cross-multiplication). Type three values, pick direct or inverse, and get the fourth. The values stay in the form after each answer, so you can change one number and press Enter to try the next.

This is the math proportion solver, not the rule-of-thirds photo composition grid.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/proportion-calculator`

Accepts a JSON body, not multipart form data, and answers with a number instead of a file to download.

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `a` | number | (required) | First known value. |
| `b` | number | (required) | The value that goes with `a`. |
| `c` | number | (required) | Third known value. X is the value that goes with it. |
| `mode` | string | `direct` | `direct` or `inverse`. |

| Mode | Reads as | Formula | Example |
|------|----------|---------|---------|
| `direct` | A is to B as C is to X | X = B × C ÷ A | 3 apples cost 6, so 10 apples cost 20 |
| `inverse` | A × B = C × X | X = A × B ÷ C | 4 workers take 6 days, so 8 workers take 3 days |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/proportion-calculator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"a": 3, "b": 6, "c": 10, "mode": "direct"}'
```

## Example Response {#example-response}

```json
{
  "mode": "direct",
  "x": 20
}
```

## Notes {#notes}

- The answer is rounded to 15 significant digits, so `0.1 × 3 ÷ 3` comes back as `0.1` rather than `0.10000000000000002`.
- `a` can't be `0` in a direct proportion and `c` can't be `0` in an inverse one, because each is the divisor. Either returns a 400.
- An answer outside the range a double can hold (above about `1.8e308`, or too close to zero to keep its precision) returns a 400.
- In the web app you can type `1,5` or `1.5`, and Arabic-Indic or Devanagari digits work too. Thousands separators aren't accepted.
