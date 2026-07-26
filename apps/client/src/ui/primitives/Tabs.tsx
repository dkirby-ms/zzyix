import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import './Tabs.css'

const cx = (...classNames: Array<string | undefined>): string => classNames.filter(Boolean).join(' ')

const Tabs = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Root ref={ref} className={cx('ui-tabs-root', className)} {...props} />
))
Tabs.displayName = 'Tabs'

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List ref={ref} className={cx('ui-tabs-list', className)} {...props} />
))
TabsList.displayName = 'TabsList'

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger ref={ref} className={cx('ui-tabs-trigger', className)} {...props} />
))
TabsTrigger.displayName = 'TabsTrigger'

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cx('ui-tabs-content', className)} {...props} />
))
TabsContent.displayName = 'TabsContent'

export { Tabs, TabsList, TabsTrigger, TabsContent }
