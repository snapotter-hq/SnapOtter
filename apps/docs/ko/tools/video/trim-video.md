---
description: "시작 및 종료 시간을 지정하여 비디오에서 클립을 잘라냅니다."
i18n_source_hash: 0385b4e963d0
i18n_provenance: machine
i18n_output_hash: a5231bf41a76
i18n_hash_version: 2
---

# Trim Video {#trim-video}

비디오에서 클립을 잘라냅니다. 시작 시간과 종료 시간 사이의 부분을 남기거나, 처음과 끝에서 일정한 길이를 잘라낼 수 있습니다. 프레임 단위로 정확하게 자르는 옵션도 있습니다.

앱에서 시간 필드는 일반 초 단위(`90`), `MM:SS`(`1:30`) 또는 `HH:MM:SS`(`1:02:03.5`)를 받습니다. API는 초 단위를 받습니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/trim-video`

비디오 파일과 JSON `settings` 필드가 담긴 multipart form data를 받습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `range` | `range`는 `startS`부터 `endS`까지를 남깁니다. `ends`는 처음에서 `cutStartS`, 끝에서 `cutEndS`를 제거합니다 |
| startS | number | No | `0` | Range mode: 시작 시간(초, 0 이상이어야 함) |
| endS | number | Range mode | - | Range mode: 종료 시간(초, startS 이후여야 함) |
| cutStartS | number | No | `0` | Ends mode: 처음에서 제거할 초 |
| cutEndS | number | No | `0` | Ends mode: 끝에서 제거할 초 |
| precise | boolean | No | `false` | 다음 키프레임부터 복사하는 대신 전체 구간을 재인코딩하여 시작 프레임과 끝 프레임을 정확하게 맞춥니다 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"startS": 5, "endS": 30, "precise": true}'
```

비디오 길이와 관계없이 처음 5초와 마지막 10초를 잘라냅니다.

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "ends", "cutStartS": 5, "cutEndS": 10}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- `precise`이(가) `false`(기본값)이면 클립은 요청한 프레임에서 정확히 시작합니다. 그 시작점부터 다음 키프레임까지의 프레임만 재인코딩하고 나머지는 복사하므로 빠르게 유지됩니다. 복사된 스트림은 앞선 프레임이 참조하는 프레임을 그대로 유지하기 때문에 끝부분은 한 프레임 정도 길어질 수 있습니다. 안전하게 이어 붙일 수 없는 소스(10비트 또는 인터레이스 H.264, 재인코딩된 시작이 필요한 다른 코덱, AVI, FLV, MPEG, TS 파일)는 대신 전체를 재인코딩합니다.
- `precise`을(를) `true`로 설정하면 항상 전체 구간을 재인코딩하므로 양쪽 끝이 정확하지만 시간이 더 오래 걸립니다.
- Range mode에서는 `endS`이(가) `startS`보다 커야 합니다. `endS`이(가) 비디오 끝을 넘으면 클립은 끝까지 이어집니다.
- Ends mode에서는 `cutStartS`와 `cutEndS` 중 적어도 하나는 0보다 커야 하며, 둘을 합쳐도 비디오가 일부 남아야 합니다. 자르는 길이는 각 파일의 자체 길이를 기준으로 계산되므로, 길이가 다른 비디오 배치에서도 하나의 설정으로 동작합니다.
