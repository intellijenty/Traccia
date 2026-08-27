import { useState } from "react"
import { motion } from "framer-motion"
import { Home, Settings, Bell, User } from "lucide-react"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"

interface MenuItem {
  icon: React.ReactNode
  label: string
  href: string
  gradient: string
}

const menuItems: MenuItem[] = [
  {
    icon: <Home size={20} strokeWidth={2} />,
    label: "Home",
    href: "#",
    gradient:
      "radial-gradient(circle, rgba(59,130,246,0.15) 0%, rgba(37,99,235,0.06) 50%, rgba(29,78,216,0) 100%)",
  },
  {
    icon: <Bell size={20} strokeWidth={2} />,
    label: "Notifications",
    href: "#",
    gradient:
      "radial-gradient(circle, rgba(249,115,22,0.15) 0%, rgba(234,88,12,0.06) 50%, rgba(194,65,12,0) 100%)",
  },
  {
    icon: <Settings size={20} strokeWidth={2} />,
    label: "Settings",
    href: "#",
    gradient:
      "radial-gradient(circle, rgba(34,197,94,0.15) 0%, rgba(22,163,74,0.06) 50%, rgba(21,128,61,0) 100%)",
  },
  {
    icon: <User size={20} strokeWidth={2} />,
    label: "Profile",
    href: "#",
    gradient:
      "radial-gradient(circle, rgba(239,68,68,0.15) 0%, rgba(220,38,38,0.06) 50%, rgba(185,28,28,0) 100%)",
  },
]

const glowVariants = {
  initial: { opacity: 0, scale: 0.8 },
  hover: {
    opacity: 1,
    scale: 2,
    transition: {
      opacity: { duration: 0.5 },
      scale: { duration: 0.5, type: "spring" as const, stiffness: 300, damping: 25 },
    },
  },
}

const navGlowVariants = {
  initial: { opacity: 0 },
  hover: {
    opacity: 1,
    transition: {
      duration: 0.5,
    },
  },
}

export function MenuBar() {
  const { theme } = useTheme()
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  const isDarkTheme = theme === "dark"

  return (
    <motion.nav
      className="relative overflow-hidden rounded-2xl border border-border/40 bg-gradient-to-b from-background/80 to-background/40 p-2 shadow-lg backdrop-blur-lg"
      initial="initial"
      whileHover="hover"
    >
      <motion.div
        className={`bg-gradient-radial absolute -inset-2 from-transparent ${
          isDarkTheme
            ? "via-blue-400/30 via-purple-400/30 via-red-400/30 via-30% via-60% via-90%"
            : "via-blue-400/20 via-purple-400/20 via-red-400/20 via-30% via-60% via-90%"
        } pointer-events-none z-0 rounded-3xl to-transparent`}
        variants={navGlowVariants}
      />
      <ul className="relative z-10 flex items-center gap-2">
        {menuItems.map((item, index) => {
          const isActive = activeIndex === index

          return (
            <motion.li
              key={item.label}
              className="relative"
              onClick={() =>
                setActiveIndex(activeIndex === index ? null : index)
              }
            >
              <motion.div
                className="pointer-events-none absolute inset-0 z-0 rounded-xl"
                animate={isActive ? "hover" : "initial"}
                initial="initial"
                variants={glowVariants}
                style={{
                  background: item.gradient,
                  opacity: 0,
                }}
              />
              <motion.button
                type="button"
                className="group relative z-10 flex h-10 items-center gap-2 rounded-xl px-4 py-2 focus:outline-none focus-visible:ring-0"
              >
                <motion.div
                  animate={isActive ? { scale: 1.2 } : { scale: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className={cn(
                    "flex-shrink-0 transition-colors duration-300",
                    isActive
                      ? "text-foreground"
                      : "text-muted-foreground group-hover:text-foreground/80"
                  )}
                >
                  {item.icon}
                </motion.div>

                <motion.span
                  initial={false}
                  animate={{
                    opacity: isActive ? 1 : 0,
                    width: isActive ? "auto" : 0,
                  }}
                  transition={{
                    opacity: { duration: 0.3 },
                    width: { type: "spring", stiffness: 200, damping: 28 },
                  }}
                  className={cn(
                    "overflow-hidden text-xs font-medium whitespace-nowrap transition-colors duration-300",
                    isActive ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {item.label}
                </motion.span>
              </motion.button>
            </motion.li>
          )
        })}
      </ul>
    </motion.nav>
  )
}
