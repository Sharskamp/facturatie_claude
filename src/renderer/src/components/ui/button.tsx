"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm",
        destructive: "bg-red-600 text-white hover:bg-red-700 shadow-sm",
        outline: "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 shadow-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700",
        secondary: "bg-gray-100 text-gray-900 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600",
        ghost: "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700",
        link: "text-indigo-600 underline-offset-4 hover:underline",
        success: "bg-green-600 text-white hover:bg-green-700 shadow-sm",
        warning: "bg-amber-500 text-white hover:bg-amber-600 shadow-sm",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-8",
        xl: "h-12 px-10 text-base",
        icon: "h-9 w-9",
        "icon-sm": "h-8 w-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, children, disabled, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled ?? loading}
        {...props}
      >
        {loading && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        )}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
