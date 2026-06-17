import { useId } from 'react'
import { cn } from '@/lib/utils'

interface TiGlyphProps {
  size?: number
  running?: boolean
  className?: string
}

// Traccia Intelligence mark — two overlapping rings (vesica), aurora gradient
// violet→indigo→cyan left-to-right. Shimmers while a generation run is active.
export function TiGlyph({ size = 16, running = false, className }: TiGlyphProps) {
  const uid = useId()
  const gradId = `ti${uid.replace(/[^a-zA-Z0-9]/g, '')}`

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={cn(running && 'animate-[ti-aurora_3s_ease-in-out_infinite]', className)}
    >
      <defs>
        <linearGradient id={gradId} x1="0.5" y1="8" x2="15.5" y2="8" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#7c3aed" />
          <stop offset="48%"  stopColor="#6366f1" />
          <stop offset="100%" stopColor="#0891b2" />
        </linearGradient>
      </defs>
      <circle cx="5.75"  cy="8" r="4.5" stroke={`url(#${gradId})`} strokeWidth="1.5" />
      <circle cx="10.25" cy="8" r="4.5" stroke={`url(#${gradId})`} strokeWidth="1.5" />
    </svg>
  )
}
