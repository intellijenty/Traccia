import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group"
import { cn } from "@/lib/utils"

const ToggleGroup = ToggleGroupPrimitive.Root

function ToggleGroupItem({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      className={cn(
        "inline-flex items-center justify-center rounded-md text-sm font-medium whitespace-nowrap transition-colors",
        "border border-transparent bg-transparent px-3 py-1.5",
        "text-muted-foreground hover:bg-muted hover:text-foreground",
        "data-[state=on]:border-border/60 data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  )
}

export { ToggleGroup, ToggleGroupItem }
