import { useId, useRef, useState, type ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

export type SelectOption = {
  value: string;
  label: ReactNode;
  disabled?: boolean;
};
type Props = {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  name?: string;
  id?: string;
  "aria-label"?: string;
};

// Radix reserves the empty string for placeholders; keep optional empty choices selectable.
const EMPTY_CHOICE = "__standard_barrels_empty_choice__";

export function AppSelect({
  value,
  onValueChange,
  options,
  placeholder = "Choose an option",
  required,
  disabled,
  name,
  id,
  "aria-label": ariaLabel,
}: Props) {
  const generatedId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [invalid, setInvalid] = useState(false);
  const hasEmptyChoice = options.some((option) => option.value === "");
  const controlValue = value === "" && hasEmptyChoice ? EMPTY_CHOICE : value;
  return (
    <span
      className="app-select"
      onInvalidCapture={(event) => {
        event.preventDefault();
        setInvalid(true);
        trigger.current?.focus();
      }}
    >
      <Select
        value={controlValue}
        onValueChange={(next) => {
          setInvalid(false);
          onValueChange(next === EMPTY_CHOICE ? "" : next);
        }}
        required={required}
        disabled={disabled}
        name={name}
      >
        <SelectTrigger
          ref={trigger}
          id={id || generatedId}
          aria-label={ariaLabel}
          aria-required={required}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${generatedId}-error` : undefined}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value === "" ? EMPTY_CHOICE : option.value}
              disabled={option.disabled}
            >
              {option.label}
            </SelectItem>
          ))}
          {options.length === 0 && (
            <div className="select-empty">No options available</div>
          )}
        </SelectContent>
      </Select>
      {invalid && (
        <span id={`${generatedId}-error`} className="select-error" role="alert">
          Please choose an option.
        </span>
      )}
    </span>
  );
}
