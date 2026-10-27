import Image from "next/image";

export function CliqoLogo({ width = 146, priority = false }: { width?: number; priority?: boolean }) {
  return <Image
    src="/brand/cliqo-wordmark.png"
    alt="CliQo | كليكو"
    width={width}
    height={Math.round(width / 3)}
    priority={priority}
    sizes={`${width}px`}
  />;
}
