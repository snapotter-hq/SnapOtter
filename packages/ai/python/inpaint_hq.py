"""High-quality object erasing via Stable Diffusion 1.5 inpainting (diffusers).

This is the optional "High Quality" backend for the Object Eraser, gated behind
the `inpaint-hq` feature bundle. The default fast path stays `inpaint.py` (LaMa).

Design: reuse the crop-and-composite geometry from `inpaint.py`
(`inpaint_array` dilates the mask, crops a padded HD window, runs a model on the
crop, and blends only the masked region back into the untouched original). The
only difference here is the model step: a diffusion pipeline replaces the LaMa
ONNX session. Diffusion synthesizes plausible texture over large/structured
regions where a non-diffusion model smears, which is exactly #141's open case.

Heavy imports (torch/diffusers) are lazy so the base AI dispatcher stays lean and
the geometry stays unit-testable with an injected fake pipeline.
"""
import json
import os
import sys

import inpaint  # reuse dilate/crop/composite geometry (inpaint_array)


def emit_progress(percent, stage):
    """Emit structured progress to stderr for bridge.ts to capture."""
    print(json.dumps({"progress": percent, "stage": stage}), file=sys.stderr, flush=True)


# Model directory: the inpaint-hq bundle downloads the SD1.5 inpainting model
# (diffusers layout) here via hf_snapshot. MODELS_PATH is set by the bridge to
# DATA_DIR/ai/models; /opt/models is the baked fallback for other model kinds.
_MODELS_BASE = os.environ.get("MODELS_PATH", "/opt/models")
SD_MODEL_DIR = os.environ.get("SD15_INPAINT_DIR", os.path.join(_MODELS_BASE, "sd15-inpainting"))

# Diffusion runs at SD1.5's native 512. Crops are resized to this and the result
# resized back, so the crop-HD property (small objects keep resolution) still holds.
MODEL_SIZE = 512

# Inference defaults. Overridable by env for tuning without a rebuild. An empty
# prompt with a "keep it background" negative prompt biases toward clean removal
# (continue the surroundings) rather than hallucinating a new object.
STEPS = int(os.environ.get("SD15_INPAINT_STEPS", "28"))
GUIDANCE = float(os.environ.get("SD15_INPAINT_GUIDANCE", "7.0"))
PROMPT = os.environ.get("SD15_INPAINT_PROMPT", "")
NEGATIVE_PROMPT = os.environ.get(
    "SD15_INPAINT_NEGATIVE",
    "object, person, text, watermark, artifact, blurry, distorted, extra limbs",
)
# Fixed seed so a given input erases deterministically (stable, reproducible,
# testable) instead of changing on every run.
SEED = int(os.environ.get("SD15_INPAINT_SEED", "0"))


def make_run_model(pipe, device, steps=STEPS, guidance=GUIDANCE, prompt=PROMPT,
                   negative_prompt=NEGATIVE_PROMPT, seed=SEED, progress=None):
    """Build a run_model(crop_img, crop_mask) backed by a diffusion pipeline.

    Matches inpaint.py's run_model contract: crop in (HxWx3 uint8 RGB), inpainted
    crop out (same HxWx3). Resizes the crop to the model's 512, runs the pipe with
    the (dilated) mask, and resizes the result back to the native crop size.

    `pipe` is any callable with the diffusers inpaint signature; injecting a fake
    keeps this unit-testable without torch/diffusers or a real model.
    """
    import inspect

    import cv2
    import numpy as np
    from PIL import Image

    supports_step_cb = "callback_on_step_end" in inspect.signature(pipe.__call__).parameters

    def _make_generator():
        try:
            import torch

            return torch.Generator(device=device).manual_seed(seed)
        except Exception:
            return None

    def run_model(crop_img, crop_mask):
        h, w = crop_img.shape[:2]
        interp = cv2.INTER_AREA if (w > MODEL_SIZE or h > MODEL_SIZE) else cv2.INTER_LINEAR
        img_resized = cv2.resize(crop_img, (MODEL_SIZE, MODEL_SIZE), interpolation=interp)
        mask_resized = cv2.resize(
            crop_mask, (MODEL_SIZE, MODEL_SIZE), interpolation=cv2.INTER_NEAREST
        )
        pil_img = Image.fromarray(img_resized)
        pil_mask = Image.fromarray((mask_resized > 127).astype(np.uint8) * 255)

        kwargs = dict(
            prompt=prompt,
            negative_prompt=negative_prompt,
            image=pil_img,
            mask_image=pil_mask,
            num_inference_steps=steps,
            guidance_scale=guidance,
            height=MODEL_SIZE,
            width=MODEL_SIZE,
        )
        gen = _make_generator()
        if gen is not None:
            kwargs["generator"] = gen
        if supports_step_cb and progress is not None:
            def _cb(_pipe, step, _timestep, cbk):
                progress(int(45 + 30 * (step + 1) / max(1, steps)), "Erasing objects")
                return cbk

            kwargs["callback_on_step_end"] = _cb

        out = pipe(**kwargs).images[0]
        out_arr = np.array(out.convert("RGB"))
        # Diffusion emits exactly MODEL_SIZE; resize back to the native crop.
        if out_arr.shape[:2] != (h, w):
            out_arr = cv2.resize(out_arr, (w, h), interpolation=cv2.INTER_LANCZOS4)
        return out_arr

    return run_model


def _resolve_device():
    """cuda when torch can actually use it, else cpu (mirrors the other torch tools)."""
    try:
        from gpu import torch_gpu_available

        return "cuda" if torch_gpu_available() else "cpu"
    except Exception:
        return "cpu"


def _load_pipeline(model_dir, device):
    """Load the SD1.5 inpainting pipeline from the local bundle dir (never downloads)."""
    # Check the model exists before importing the heavy stack, so a missing
    # bundle fails fast with an actionable message instead of an ImportError.
    if not os.path.isdir(model_dir):
        raise FileNotFoundError(
            f"High-quality inpainting model not found at {model_dir}. "
            "Install the 'High-Quality Inpainting' feature bundle first."
        )

    import torch
    from diffusers import StableDiffusionInpaintPipeline

    dtype = torch.float16 if device == "cuda" else torch.float32
    # Prefer the fp16 weight variant when the bundle ships it: it halves the
    # download and loads on GPU (fp16) or CPU (cast up to fp32) alike. Fall back
    # to non-variant (fp32) weights when only those are present.
    fp16_unet = os.path.join(model_dir, "unet", "diffusion_pytorch_model.fp16.safetensors")
    variant = "fp16" if os.path.exists(fp16_unet) else None
    pipe = StableDiffusionInpaintPipeline.from_pretrained(
        model_dir,
        torch_dtype=dtype,
        variant=variant,
        safety_checker=None,
        requires_safety_checker=False,
        local_files_only=True,
    )
    pipe = pipe.to(device)
    pipe.set_progress_bar_config(disable=True)
    # Keep peak memory modest so mid-range GPUs and CPU hosts do not OOM at 512.
    try:
        pipe.enable_attention_slicing()
    except Exception:
        pass
    return pipe


def main():
    input_path = sys.argv[1]
    mask_path = sys.argv[2]
    output_path = sys.argv[3]

    try:
        emit_progress(5, "Preparing")
        from PIL import Image
        import numpy as np

        try:
            import cv2  # noqa: F401
            import torch  # noqa: F401
            import diffusers  # noqa: F401
        except ImportError as e:
            print(json.dumps({
                "success": False,
                "error": (
                    f"Missing dependency: {e}. The High-Quality Inpainting bundle "
                    "provides diffusers/torch; install it and retry."
                ),
            }))
            sys.exit(1)

        emit_progress(15, "Loading model")
        device = _resolve_device()
        pipe = _load_pipeline(SD_MODEL_DIR, device)

        emit_progress(35, "Loading images")
        img = Image.open(input_path).convert("RGB")
        mask = Image.open(mask_path).convert("L")
        img_array = np.array(img)
        mask_array = np.array(mask)

        if mask_array.shape[:2] != img_array.shape[:2]:
            import cv2

            mask_array = cv2.resize(
                mask_array,
                (img_array.shape[1], img_array.shape[0]),
                interpolation=cv2.INTER_NEAREST,
            )

        run_model = make_run_model(pipe, device, progress=emit_progress)
        result = inpaint.inpaint_array(
            img_array, mask_array, run_model, progress=emit_progress
        )

        emit_progress(90, "Saving")
        Image.fromarray(result).save(output_path)

        print(json.dumps({"success": True, "method": "sd15-inpainting"}))

    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
