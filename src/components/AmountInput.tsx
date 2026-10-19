import { useLayoutEffect, useRef, type InputHTMLAttributes } from "react";
import { formatAmountInput } from "./amount-format";

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "inputMode"
> & {
  value: string;
  onValueChange: (value: string) => void;
};

export function AmountInput({ value, onValueChange, ...props }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const formatted = formatAmountInput(value);

  useLayoutEffect(() => {
    if (pendingCaret.current === null || !input.current) return;
    let position = 0;
    let rawCharacters = 0;
    while (
      position < formatted.length &&
      rawCharacters < pendingCaret.current
    ) {
      if (formatted[position] !== ",") rawCharacters++;
      position++;
    }
    input.current.setSelectionRange(position, position);
    pendingCaret.current = null;
  }, [formatted]);

  return (
    <input
      {...props}
      ref={input}
      type="text"
      inputMode="decimal"
      value={formatted}
      onChange={(event) => {
        pendingCaret.current = event.currentTarget.value
          .slice(0, event.currentTarget.selectionStart ?? undefined)
          .replaceAll(",", "").length;
        onValueChange(event.currentTarget.value.replaceAll(",", ""));
      }}
    />
  );
}
