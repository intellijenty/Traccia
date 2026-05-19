import { createContext, useContext, useState } from 'react'
import { Sun, Moon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

const EOD_THEME_KEY = 'traccia:eod-theme'

type EodTheme = 'light' | 'dark'

interface EodThemeCtx {
  theme: EodTheme
  toggle: () => void
}

const EodThemeContext = createContext<EodThemeCtx | null>(null)

function useEodTheme() {
  const ctx = useContext(EodThemeContext)
  if (!ctx) throw new Error('useEodTheme must be inside EodThemeProvider')
  return ctx
}

export function EodThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<EodTheme>(() => {
    const saved = localStorage.getItem(EOD_THEME_KEY) as EodTheme | null
    if (saved === 'light' || saved === 'dark') return saved
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  })

  function toggle() {
    const next: EodTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem(EOD_THEME_KEY, next)
  }

  return (
    <EodThemeContext.Provider value={{ theme, toggle }}>
      <div
        className={cn(theme === 'dark' && 'dark')}
        data-eod-theme={theme}
        style={{ display: 'contents' }}
      >
        {children}
      </div>
    </EodThemeContext.Provider>
  )
}

export function EodThemeToggleButton() {
  const { theme, toggle } = useEodTheme()
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={toggle}
          aria-label={theme === 'dark' ? 'Switch EOD to light' : 'Switch EOD to dark'}
          className='text-foreground'
        >
          {theme === 'dark'
            ? <Sun className="size-3.5" aria-hidden="true" />
            : <Moon className="size-3.5" aria-hidden="true" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</TooltipContent>
    </Tooltip>
  )
}
