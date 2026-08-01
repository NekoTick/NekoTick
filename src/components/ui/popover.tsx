import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"

import { cn } from "@/lib/utils"

const PopoverOwnerContext = React.createContext<string | null>(null)

function Popover({
  dismissOnWindowPointerDown = true,
  open: controlledOpen,
  defaultOpen,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root> & {
  dismissOnWindowPointerDown?: boolean
}) {
  const ownerId = React.useId()
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen ?? false)
  const open = controlledOpen ?? uncontrolledOpen
  const handleOpenChange = React.useCallback((nextOpen: boolean) => {
    if (controlledOpen === undefined) {
      setUncontrolledOpen(nextOpen)
    }
    onOpenChange?.(nextOpen)
  }, [controlledOpen, onOpenChange])

  React.useEffect(() => {
    if (!open || !dismissOnWindowPointerDown) return

    const handleWindowPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest(`[data-vlaina-popover-owner="${ownerId}"]`)) return
      if (target.closest('[data-slot="popover-content"]')) return
      handleOpenChange(false)
    }

    window.addEventListener('pointerdown', handleWindowPointerDown, true)
    return () => window.removeEventListener('pointerdown', handleWindowPointerDown, true)
  }, [dismissOnWindowPointerDown, handleOpenChange, open, ownerId])

  return (
    <PopoverOwnerContext.Provider value={ownerId}>
      <PopoverPrimitive.Root
        data-slot="popover"
        {...props}
        open={open}
        onOpenChange={handleOpenChange}
      />
    </PopoverOwnerContext.Provider>
  )
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  const ownerId = React.useContext(PopoverOwnerContext)
  return (
    <PopoverPrimitive.Trigger
      data-slot="popover-trigger"
      data-vlaina-popover-owner={ownerId ?? undefined}
      {...props}
    />
  )
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  const ownerId = React.useContext(PopoverOwnerContext)
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        data-vlaina-popover-owner={ownerId ?? undefined}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "bg-[var(--popover)] text-[var(--popover-foreground)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-[var(--vlaina-z-200)] w-72 origin-(--radix-popover-content-transform-origin) rounded-md border border-[var(--border)] p-4 shadow-[var(--vlaina-shadow-md)] outline-hidden duration-[var(--vlaina-duration-75)]",
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  const ownerId = React.useContext(PopoverOwnerContext)
  return (
    <PopoverPrimitive.Anchor
      data-slot="popover-anchor"
      data-vlaina-popover-owner={ownerId ?? undefined}
      {...props}
    />
  )
}

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor }
