"use client"

import * as React from "react"
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import { Icon } from "@/components/ui/icons"

import { cn } from "@/lib/utils"

function useWindowBlurStableOpen({
    defaultOpen,
    onOpenChange,
    open: controlledOpen,
}: Pick<React.ComponentProps<typeof DropdownMenuPrimitive.Root>, 'defaultOpen' | 'onOpenChange' | 'open'>) {
    const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen ?? false)
    const windowBlurRef = React.useRef(false)
    const open = controlledOpen ?? uncontrolledOpen

    React.useEffect(() => {
        const handleWindowBlur = () => {
            windowBlurRef.current = true
            queueMicrotask(() => {
                windowBlurRef.current = false
            })
        }

        window.addEventListener("blur", handleWindowBlur, true)
        return () => window.removeEventListener("blur", handleWindowBlur, true)
    }, [])

    const handleOpenChange = React.useCallback((nextOpen: boolean) => {
        if (!nextOpen && windowBlurRef.current) return
        if (controlledOpen === undefined) setUncontrolledOpen(nextOpen)
        onOpenChange?.(nextOpen)
    }, [controlledOpen, onOpenChange])

    return [open, handleOpenChange] as const
}

const DropdownMenu = ({
    defaultOpen,
    onOpenChange,
    open: controlledOpen,
    ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) => {
    const [open, handleOpenChange] = useWindowBlurStableOpen({
        defaultOpen,
        onOpenChange,
        open: controlledOpen,
    })

    return (
        <DropdownMenuPrimitive.Root
            {...props}
            open={open}
            onOpenChange={handleOpenChange}
        />
    )
}

const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger

const DropdownMenuGroup = DropdownMenuPrimitive.Group

const DropdownMenuPortal = DropdownMenuPrimitive.Portal

const DropdownMenuSub = ({
    defaultOpen,
    onOpenChange,
    open: controlledOpen,
    ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Sub>) => {
    const [open, handleOpenChange] = useWindowBlurStableOpen({
        defaultOpen,
        onOpenChange,
        open: controlledOpen,
    })

    return (
        <DropdownMenuPrimitive.Sub
            {...props}
            open={open}
            onOpenChange={handleOpenChange}
        />
    )
}

const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup

const DropdownMenuSubTrigger = React.forwardRef<
    React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
    React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & {
        inset?: boolean
    }
>(({ className, inset, children, ...props }, ref) => (
    <DropdownMenuPrimitive.SubTrigger
        ref={ref}
        className={cn(
            "flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-[var(--accent)] data-[state=open]:bg-[var(--accent)]",
            inset && "pl-8",
            className
        )}
        {...props}
    >
        {children}
 <Icon size="md" name="nav.chevronRight" className="ml-auto" />
    </DropdownMenuPrimitive.SubTrigger>
))
DropdownMenuSubTrigger.displayName =
    DropdownMenuPrimitive.SubTrigger.displayName

const DropdownMenuSubContent = React.forwardRef<
    React.ElementRef<typeof DropdownMenuPrimitive.SubContent>,
    React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(({ className, ...props }, ref) => (
    <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.SubContent
            ref={ref}
            className={cn(
                "z-[var(--vlaina-z-50)] min-w-[var(--vlaina-size-8rem)] overflow-hidden rounded-md border border-[var(--border)] bg-[var(--popover)] p-1 text-[var(--popover-foreground)] shadow-[var(--vlaina-shadow-lg)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 duration-[var(--vlaina-duration-75)]",
                className
            )}
            {...props}
        />
    </DropdownMenuPrimitive.Portal>
))
DropdownMenuSubContent.displayName =
    DropdownMenuPrimitive.SubContent.displayName

type DropdownMenuContentProps = React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content> & {
    onOpenAutoFocus?: (event: Event) => void
}

const DropdownMenuContent = React.forwardRef<
    React.ElementRef<typeof DropdownMenuPrimitive.Content>,
    DropdownMenuContentProps
>(({ className, onOpenAutoFocus, sideOffset = 4, ...props }, ref) => (
    <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
            ref={ref}
            sideOffset={sideOffset}
            className={cn(
                "z-[var(--vlaina-z-50)] min-w-[var(--vlaina-size-8rem)] overflow-hidden rounded-md border border-[var(--border)] bg-[var(--popover)] p-1 text-[var(--popover-foreground)] shadow-[var(--vlaina-shadow-md)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 duration-[var(--vlaina-duration-75)]",
                className
            )}
            {...(onOpenAutoFocus ? { onOpenAutoFocus } : {})}
            {...props}
        />
    </DropdownMenuPrimitive.Portal>
))
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName

const DropdownMenuItem = React.forwardRef<
    React.ElementRef<typeof DropdownMenuPrimitive.Item>,
    React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
        inset?: boolean
    }
>(({ className, inset, ...props }, ref) => (
    <DropdownMenuPrimitive.Item
        ref={ref}
        className={cn(
            "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-[var(--accent)] focus:text-[var(--accent-foreground)] data-[disabled]:pointer-events-none data-[disabled]:opacity-[var(--vlaina-opacity-50)]",
            inset && "pl-8",
            className
        )}
        {...props}
    />
))
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName

const DropdownMenuCheckboxItem = React.forwardRef<
    React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
    React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
    <DropdownMenuPrimitive.CheckboxItem
        ref={ref}
        className={cn(
            "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-[var(--accent)] focus:text-[var(--accent-foreground)] data-[disabled]:pointer-events-none data-[disabled]:opacity-[var(--vlaina-opacity-50)]",
            className
        )}
        checked={checked}
        {...props}
    >
        <span className="absolute left-2 flex w-[var(--vlaina-size-18px)] h-[var(--vlaina-size-18px)] items-center justify-center">
            <DropdownMenuPrimitive.ItemIndicator>
 <Icon size="md" name="common.check" />
            </DropdownMenuPrimitive.ItemIndicator>
        </span>
        {children}
    </DropdownMenuPrimitive.CheckboxItem>
))
DropdownMenuCheckboxItem.displayName =
    DropdownMenuPrimitive.CheckboxItem.displayName

const DropdownMenuRadioItem = React.forwardRef<
    React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
    React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
    <DropdownMenuPrimitive.RadioItem
        ref={ref}
        className={cn(
            "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-[var(--accent)] focus:text-[var(--accent-foreground)] data-[disabled]:pointer-events-none data-[disabled]:opacity-[var(--vlaina-opacity-50)]",
            className
        )}
        {...props}
    >
        <span className="absolute left-2 flex w-[var(--vlaina-size-18px)] h-[var(--vlaina-size-18px)] items-center justify-center">
            <DropdownMenuPrimitive.ItemIndicator>
                <Icon name="common.radio" className="h-2 w-2 fill-current" />
            </DropdownMenuPrimitive.ItemIndicator>
        </span>
        {children}
    </DropdownMenuPrimitive.RadioItem>
))
DropdownMenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName

const DropdownMenuLabel = React.forwardRef<
    React.ElementRef<typeof DropdownMenuPrimitive.Label>,
    React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & {
        inset?: boolean
    }
>(({ className, inset, ...props }, ref) => (
    <DropdownMenuPrimitive.Label
        ref={ref}
        className={cn(
            "px-2 py-1.5 text-sm font-semibold",
            inset && "pl-8",
            className
        )}
        {...props}
    />
))
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName

const DropdownMenuSeparator = React.forwardRef<
    React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
    React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
    <DropdownMenuPrimitive.Separator
        ref={ref}
        className={cn("-mx-1 my-1 h-px bg-[var(--muted)]", className)}
        {...props}
    />
))
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName

const DropdownMenuShortcut = ({
    className,
    ...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
    return (
        <span
            className={cn("ml-auto text-xs tracking-widest opacity-[var(--vlaina-opacity-60)]", className)}
            {...props}
        />
    )
}
DropdownMenuShortcut.displayName = "DropdownMenuShortcut"

export {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuCheckboxItem,
    DropdownMenuRadioItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuShortcut,
    DropdownMenuGroup,
    DropdownMenuPortal,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuRadioGroup,
}
