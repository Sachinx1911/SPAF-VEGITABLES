import { useState } from 'react';
import { cn } from '../../lib/cn';

/** Drop the photo at public/images/vegetables.png and it appears everywhere this is used. */
const SRC = `${import.meta.env.BASE_URL}images/vegetables.png`;

/**
 * The produce photo, with the emoji cluster as a stand-in until the file exists —
 * so the portal never shows a broken image.
 *
 * `mix-blend-multiply` drops the white studio background on our tinted panels, so
 * the shot works whether or not it was exported with transparency.
 */
export function ProduceArt({ className, fallback = '🥬🍅🥕', fallbackClass }: {
  className?: string;
  fallback?: string;
  fallbackClass?: string;
}) {
  const [broken, setBroken] = useState(false);

  if (broken) return <p className={cn('text-center leading-tight', fallbackClass)}>{fallback}</p>;

  return (
    <img
      src={SRC}
      alt=""
      aria-hidden
      onError={() => setBroken(true)}
      className={cn('object-contain mix-blend-multiply select-none', className)}
    />
  );
}
