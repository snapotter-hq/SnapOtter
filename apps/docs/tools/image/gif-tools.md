---
description: Resize, optimize, speed-change, reverse, rotate, and extract frames from animated GIFs in a single tool.
---

# GIF Tools {#gif-tools}

Resize, optimize, change speed, reverse, extract frames, and rotate animated GIFs. Provides multiple operation modes in a single tool.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/gif-tools`

## Parameters {#parameters}

### Common Parameters {#common-parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"resize"` | Operation mode: `resize`, `optimize`, `speed`, `reverse`, `extract`, `rotate` |
| loop | number | No | 0 | Loop count for output GIF (0 = infinite, 1-100 = finite loops) |

### Resize Mode Parameters {#resize-mode-parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | - | Target width in pixels (1 to 16384) |
| height | integer | No | - | Target height in pixels (1 to 16384) |
| percentage | number | No | - | Scale by percentage (1 to 500). Overrides width/height if set. |

### Optimize Mode Parameters {#optimize-mode-parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| colors | number | No | 256 | Maximum number of colors in palette (2 to 256) |
| dither | number | No | 1.0 | Dithering strength (0 to 1, where 0 disables dithering) |
| effort | number | No | 7 | Optimization effort level (1 to 10, higher = slower but smaller) |

### Speed Mode Parameters {#speed-mode-parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| speedFactor | number | No | 1.0 | Speed multiplier (0.1 to 10). Values > 1 speed up, < 1 slow down. |

### Extract Mode Parameters {#extract-mode-parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| extractMode | string | No | `"single"` | Extraction mode: `single`, `range`, `all` |
| frameNumber | number | No | 0 | Frame index to extract in `single` mode (0-based) |
| frameStart | number | No | 0 | Start frame index for `range` mode (0-based) |
| frameEnd | number | No | - | End frame index for `range` mode (0-based, inclusive) |
| extractFormat | string | No | `"png"` | Format for extracted frames: `png`, `webp` |

### Rotate Mode Parameters {#rotate-mode-parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| angle | number | No | - | Rotation angle: `90`, `180`, or `270` degrees |
| flipH | boolean | No | `false` | Flip horizontally |
| flipV | boolean | No | `false` | Flip vertically |

## Example Requests {#example-requests}

### Resize {#resize}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"resize","percentage":50}'
```

### Optimize {#optimize}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@large.gif" \
  -F 'settings={"mode":"optimize","colors":128,"effort":9}'
```

### Speed Up {#speed-up}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"speed","speedFactor":2.0}'
```

### Extract Single Frame {#extract-single-frame}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"extract","extractMode":"single","frameNumber":5,"extractFormat":"png"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.gif",
  "originalSize": 2345678,
  "processedSize": 1234567
}
```

## Info Sub-Route {#info-sub-route}

`POST /api/v1/tools/image/gif-tools/info`

Returns metadata about an animated GIF without processing it.

### Info Request {#info-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools/info \
  -F "file=@animation.gif"
```

### Info Response {#info-response}

```json
{
  "width": 480,
  "height": 320,
  "pages": 24,
  "delay": [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
  "loop": 0,
  "fileSize": 2345678,
  "duration": 2400
}
```

## Notes {#notes}

- Uses the standard `createToolRoute` factory for the main processing endpoint.
- The info endpoint only requires a file upload (no settings needed).
- In `resize` mode, if `percentage` is provided it takes priority over `width`/`height`. The resize uses `fit: inside` to maintain aspect ratio.
- In `speed` mode, frame delays are divided by the speed factor. Minimum delay per frame is 20ms (GIF spec limitation).
- In `reverse` mode, the `speedFactor` parameter is also available to simultaneously adjust speed while reversing.
- In `extract` mode with `range` or `all`, the output is a ZIP file containing individual frames.
- In `rotate` mode, each frame is processed individually and reassembled into an animation.
- The `loop` parameter controls how many times the output GIF loops. Use 0 for infinite looping.
- The `duration` field in the info response is the total animation duration in milliseconds.
