import { Button } from "@/components/ui/button"
import { HugeiconsIcon } from "@hugeicons/react"
import { PlayIcon, StopIcon } from "@hugeicons/core-free-icons"

interface PunchButtonsProps {
  isIn: boolean
  onPunchIn: () => void
  onPunchOut: () => void
}

export function PunchButtons({
  isIn,
  onPunchIn,
  onPunchOut,
}: PunchButtonsProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Button
        size="lg"
        className={`h-12 gap-2 text-sm font-semibold ${
          !isIn
            ? "bg-emerald-600 text-white hover:bg-emerald-700"
            : "cursor-not-allowed bg-emerald-600/20 text-emerald-600/50"
        }`}
        disabled={isIn}
        onClick={onPunchIn}
      >
        <HugeiconsIcon icon={PlayIcon} size={16} />
        Punch IN
      </Button>
      <Button
        size="lg"
        className={`h-12 gap-2 text-sm font-semibold ${
          isIn
            ? "bg-red-600 text-white hover:bg-red-700"
            : "cursor-not-allowed bg-red-600/20 text-red-600/50"
        }`}
        disabled={!isIn}
        onClick={onPunchOut}
      >
        <HugeiconsIcon icon={StopIcon} size={16} />
        Punch OUT
      </Button>
    </div>
  )
}
