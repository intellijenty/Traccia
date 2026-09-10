import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import type { Page } from "@/lib/navigation"
import { HugeiconsIcon } from "@hugeicons/react"
import { Edit01Icon, Home01Icon } from "@hugeicons/core-free-icons"

const LABEL_WIDTH = 80
const LABEL_WIDTH_COMPACT = 60

const navItems: {
  id: Page
  label: string
  icon: Parameters<typeof HugeiconsIcon>[0]["icon"]
}[] = [
  { id: "home", label: "Home", icon: Home01Icon },
  { id: "eod", label: "EOD Draft", icon: Edit01Icon },
]

type NavBarProps = {
  className?: string
  activePage?: string
  onPageChange: (pageId: Page) => void
  stickyBottom?: boolean
  compact?: boolean
}

export function NavBar({
  className,
  activePage = "home",
  onPageChange,
  stickyBottom = false,
  compact = false,
}: NavBarProps) {
  const labelWidth = compact ? LABEL_WIDTH_COMPACT : LABEL_WIDTH

  return (
    <motion.nav
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
      role="navigation"
      aria-label="Bottom Navigation"
      className={cn(
        "flex items-center space-x-1 rounded-full border border-border bg-card dark:border-sidebar-border dark:bg-card",
        compact
          ? "h-9 max-w-[95vw] min-w-0 p-1 shadow-sm"
          : "h-13 max-w-[95vw] min-w-[320px] p-2 shadow-xl",
        stickyBottom && "fixed inset-x-0 bottom-4 z-20 mx-auto w-fit",
        className
      )}
    >
      {navItems.map((item) => {
        const isActive = activePage === item.id

        return (
          <motion.button
            key={item.label}
            whileTap={{ scale: 0.97 }}
            className={cn(
              "relative flex items-center justify-center rounded-full transition-colors duration-200",
              compact
                ? "h-7 min-h-7 min-w-9 px-2.5"
                : "h-10 max-h-11 min-h-10 min-w-11 px-3 py-2",
              isActive
                ? "gap-2 bg-primary dark:bg-primary"
                : "gap-0 text-muted-foreground hover:bg-muted dark:text-muted-foreground dark:hover:bg-muted",
              "focus:outline-none focus-visible:ring-0"
            )}
            onClick={() => onPageChange(item.id)}
            aria-label={item.label}
            type="button"
          >
            <HugeiconsIcon
              icon={item.icon}
              size={compact ? 16 : 22}
              strokeWidth={2}
              aria-hidden
              className="shrink-0 transition-colors duration-200"
            />
            <motion.div
              initial={false}
              animate={{
                width: isActive ? `${labelWidth}px` : "0px",
                opacity: isActive ? 1 : 0,
              }}
              transition={{
                width: { type: "spring", stiffness: 350, damping: 32 },
                opacity: { duration: 0.19 },
              }}
              className="flex items-center overflow-hidden"
              style={{ maxWidth: `${labelWidth}px` }}
            >
              <span
                className={cn(
                  "overflow-hidden font-medium text-ellipsis whitespace-nowrap transition-opacity duration-200 select-none",
                  compact
                    ? "text-xs leading-4"
                    : "text-xs text-[clamp(0.625rem,0.5263rem+0.5263vw,1rem)] leading-[1.9]",
                  isActive ? "" : "opacity-0"
                )}
                title={item.label}
              >
                {item.label}
              </span>
            </motion.div>
          </motion.button>
        )
      })}
    </motion.nav>
  )
}

export default NavBar
