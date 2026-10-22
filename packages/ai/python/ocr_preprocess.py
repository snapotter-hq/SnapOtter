"""Image preprocessing pipeline for OCR accuracy improvement.

Uses OpenCV for deskew, adaptive binarization, CLAHE contrast enhancement,
and denoising. All operations work on the image file in-place (overwrite).
"""
import cv2
import numpy as np
import sys
import json


def emit_progress(percent, stage):
    print(json.dumps({"progress": percent, "stage": stage}), file=sys.stderr, flush=True)


def deskew(image):
    """Detect and correct rotation/skew using Hough line transform."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
    edges = cv2.Canny(gray, 50, 150, apertureSize=3)
    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=100, minLineLength=100, maxLineGap=10)

    if lines is None:
        return image

    angles = []
    for line in lines:
        x1, y1, x2, y2 = line[0]
        angle = np.degrees(np.arctan2(y2 - y1, x2 - x1))
        if abs(angle) < 45:
            angles.append(angle)

    if not angles:
        return image

    median_angle = np.median(angles)
    if abs(median_angle) < 0.5 or abs(median_angle) > 15:
        return image

    h, w = image.shape[:2]
    center = (w // 2, h // 2)
    matrix = cv2.getRotationMatrix2D(center, median_angle, 1.0)
    rotated = cv2.warpAffine(image, matrix, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    return rotated


def binarize(image):
    """Adaptive thresholding for high-contrast black/white."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
    binary = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
    )
    return cv2.cvtColor(binary, cv2.COLOR_GRAY2BGR)


def enhance_contrast(image):
    """CLAHE contrast enhancement for uneven lighting."""
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l = clahe.apply(l)
    enhanced = cv2.merge([l, a, b])
    return cv2.cvtColor(enhanced, cv2.COLOR_LAB2BGR)


def denoise(image):
    """Bilateral filter to remove noise while preserving text edges."""
    return cv2.bilateralFilter(image, 9, 75, 75)


def preprocess(input_path, output_path):
    """Run the full preprocessing pipeline and save result.

    Steps: deskew -> enhance contrast -> denoise -> binarize
    Order matters: binarize last because it strips color info needed by CLAHE.
    """
    image = cv2.imread(input_path)
    if image is None:
        raise ValueError(f"Cannot read image: {input_path}")

    image = deskew(image)
    image = enhance_contrast(image)
    image = denoise(image)
    image = binarize(image)

    if not cv2.imwrite(output_path, image):
        raise RuntimeError(f"Failed to write output image: {output_path}")
    return output_path


def main():
    try:
        input_path = sys.argv[1]
        output_path = sys.argv[2]
        preprocess(input_path, output_path)
        print(json.dumps({"success": True, "output_path": output_path}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e).strip() or type(e).__name__}))
        sys.exit(1)


if __name__ == "__main__":
    main()
