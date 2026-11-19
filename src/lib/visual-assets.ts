import type { ImageLoaderProps } from "next/image";

/** Unsplash's CDN returns responsive, cropped, compressed formats directly to Next Image. */
export function unsplashLoader({ src, width, quality }: ImageLoaderProps) {
  const separator = src.includes("?") ? "&" : "?";
  return `${src}${separator}auto=format&fit=crop&w=${width}&q=${quality ?? 75}`;
}

export const visualAssets = {
  classroom: "https://images.unsplash.com/photo-1758270704080-e3556e6794a7?crop=faces",
  collaboration: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?crop=faces",
  library: "https://images.unsplash.com/photo-1498243691581-b145c3f54a5a",
} as const;
