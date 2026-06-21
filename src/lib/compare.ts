import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

export interface CompareResult {
  diffPixels: number;
  diffPercentage: number;
  totalPixels: number;
  sizeMismatch: boolean;
  width: number;
  height: number;
  diffImageBuffer: Buffer;
}

export function compareImages(
  baselineBuffer: Buffer,
  currentBuffer: Buffer,
  pixelThreshold = 0.1
): CompareResult {
  const baseline = PNG.sync.read(baselineBuffer);
  const current = PNG.sync.read(currentBuffer);

  const width = Math.max(baseline.width, current.width);
  const height = Math.max(baseline.height, current.height);
  const sizeMismatch =
    baseline.width !== current.width || baseline.height !== current.height;

  const paddedBaseline = padImage(baseline, width, height);
  const paddedCurrent = padImage(current, width, height);
  const diff = new PNG({ width, height });

  const diffPixels = pixelmatch(
    paddedBaseline.data,
    paddedCurrent.data,
    diff.data,
    width,
    height,
    {
      threshold: pixelThreshold,
      includeAA: false,
      alpha: 0.1,
      diffColor: [255, 0, 0],
    }
  );

  const totalPixels = width * height;

  return {
    diffPixels,
    diffPercentage: (diffPixels / totalPixels) * 100,
    totalPixels,
    sizeMismatch,
    width,
    height,
    diffImageBuffer: PNG.sync.write(diff),
  };
}

function padImage(img: PNG, targetWidth: number, targetHeight: number): PNG {
  if (img.width === targetWidth && img.height === targetHeight) return img;

  const padded = new PNG({ width: targetWidth, height: targetHeight });
  for (let i = 0; i < padded.data.length; i += 4) {
    padded.data[i] = 255;
    padded.data[i + 1] = 255;
    padded.data[i + 2] = 255;
    padded.data[i + 3] = 255;
  }
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const src = (y * img.width + x) * 4;
      const dst = (y * targetWidth + x) * 4;
      padded.data[dst] = img.data[src];
      padded.data[dst + 1] = img.data[src + 1];
      padded.data[dst + 2] = img.data[src + 2];
      padded.data[dst + 3] = img.data[src + 3];
    }
  }
  return padded;
}
