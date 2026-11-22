import Image from "next/image";

export function CliqoLogo({
  width = 146,
  preload = false,
  variant = "default",
  className,
}: {
  width?: number;
  preload?: boolean;
  variant?: "default" | "light";
  className?: string;
}) {
  const isLight = variant === "light";
  const src = isLight
    ? "/brand/2026-11-identity/wordmark-white.png"
    : "/brand/2026-11-identity/wordmark-black.png";

  return (
    <Image
      src={src}
      alt="CliQo | كليكو"
      width={width}
      height={Math.round(width * 750 / 1920)}
      preload={preload}
      loading={preload ? undefined : "eager"}
      sizes={`${width}px`}
      className={className}
    />
  );
}

export function CliqoSymbol({
  size = 36,
  variant = "default",
  className,
  decorative = false,
}: {
  size?: number;
  variant?: "default" | "light";
  className?: string;
  decorative?: boolean;
}) {
  return (
    <Image
      src={variant === "light" ? "/brand/2026-11-identity/icon-orange.png" : "/brand/2026-11-identity/icon-black.png"}
      alt={decorative ? "" : "CliQo"}
      width={size}
      height={size}
      sizes={`${size}px`}
      className={className}
    />
  );
}
