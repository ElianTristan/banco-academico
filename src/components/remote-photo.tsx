/* eslint-disable @next/next/no-img-element */

import type { ImgHTMLAttributes } from "react";

type RemotePhotoProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "sizes" | "priority"> & {
  src: string;
  sizes?: string;
  priority?: boolean;
};

export function RemotePhoto({ src, alt, priority, ...props }: RemotePhotoProps) {
  void priority;
  return <img {...props} src={src} alt={alt} loading="lazy" decoding="async" />;
}
