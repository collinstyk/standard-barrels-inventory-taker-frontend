import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";

export const Command = CommandPrimitive;
export const CommandList = CommandPrimitive.List;
export const CommandEmpty = CommandPrimitive.Empty;

export const CommandInput = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className = "", ...props }, ref) => (
  <CommandPrimitive.Input
    ref={ref}
    className={`category-command-input ${className}`}
    {...props}
  />
));
CommandInput.displayName = "CommandInput";

export const CommandItem = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className = "", ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={`category-command-item ${className}`}
    {...props}
  />
));
CommandItem.displayName = "CommandItem";
