'use client'

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer'
import { useIsMobile } from '@/lib/hooks'
import { cn } from '@/lib/utils'

export function ResponsiveDrawer({ open, onOpenChange, title, description, children, footer, wide = false }) {
  const isMobile = useIsMobile()
  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[94vh] flex flex-col">
          <DrawerHeader className="text-left pb-2">
            <DrawerTitle className="text-base">{title}</DrawerTitle>
            {description ? <DrawerDescription className="text-xs">{description}</DrawerDescription> : <DrawerDescription className="sr-only">detail</DrawerDescription>}
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-4 flex-1 min-h-0">{children}</div>
          {footer && <div className="border-t p-3 bg-background sticky bottom-0">{footer}</div>}
        </DrawerContent>
      </Drawer>
    )
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={cn('w-full p-0 flex flex-col gap-0', wide ? 'sm:max-w-2xl' : 'sm:max-w-xl')}>
        <SheetHeader className="px-6 py-4 border-b text-left space-y-0.5">
          <SheetTitle className="text-base">{title}</SheetTitle>
          {description ? <SheetDescription className="text-xs">{description}</SheetDescription> : <SheetDescription className="sr-only">detail</SheetDescription>}
        </SheetHeader>
        <div className="overflow-y-auto px-6 py-4 flex-1 min-h-0">{children}</div>
        {footer && <div className="border-t px-6 py-3 bg-background">{footer}</div>}
      </SheetContent>
    </Sheet>
  )
}

export default ResponsiveDrawer
