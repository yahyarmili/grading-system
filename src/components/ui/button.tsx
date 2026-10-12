import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

// Adapted from shadcn/ui: variants map onto the .btn classes of globals.css,
// so a <Button> and a plain <button className="btn …"> look the same.
const buttonVariants = cva(
  "btn [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "btn-primary",
        outline: "btn-secondary",
        secondary: "btn-secondary",
        ghost: "btn-ghost",
        destructive: "btn-danger",
        link: "link min-h-0 px-0 font-normal",
      },
      size: {
        default: "",
        xs: "btn-sm",
        sm: "btn-sm",
        lg: "",
        icon: "btn-icon",
        "icon-xs": "btn-sm btn-icon",
        "icon-sm": "btn-sm btn-icon",
        "icon-lg": "btn-icon",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
