import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowDown01Icon } from "@hugeicons/core-free-icons"

interface HrmsLoginFormProps {
  onLogin: (
    email: string,
    password: string,
    baseUrl?: string
  ) => Promise<{ success: boolean; message?: string }>
  onSuccess?: () => void
  defaultBaseUrl?: string
}

export function HrmsLoginForm({
  onLogin,
  onSuccess,
  defaultBaseUrl = "https://roimaint.in:7000/api",
}: HrmsLoginFormProps) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [baseUrl, setBaseUrl] = useState(defaultBaseUrl)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleLogin() {
    setError(null)
    setSubmitting(true)
    try {
      const result = await onLogin(
        email,
        password,
        showAdvanced ? baseUrl : undefined
      )
      if (result.success) {
        setEmail("")
        setPassword("")
        onSuccess?.()
      } else {
        setError(result.message || "Login failed")
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}
      <div className="flex flex-col space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Email
        </label>
        <Input
          type="email"
          placeholder="john.wick@roimaint.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-9 text-sm"
        />
      </div>
      <div className="flex flex-col space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Password
        </label>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-9 text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && email && password) handleLogin()
          }}
        />
      </div>
      <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
        <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            size={12}
            className={`transition-transform ${showAdvanced ? "rotate-180" : ""}`}
          />
          Advanced
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Base URL
            </label>
            <Input
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
      <Button
        className="w-full"
        onClick={handleLogin}
        disabled={submitting || !email || !password}
      >
        {submitting ? "Connecting..." : "Connect"}
      </Button>
    </div>
  )
}
