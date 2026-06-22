import * as React from "react";
import { CircleX } from "lucide-react";

import { cn } from "@/lib/utils";

const nonClearableInputTypes = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  (
    {
      className,
      defaultValue,
      disabled,
      onChange,
      readOnly,
      type,
      value,
      ...props
    },
    ref,
  ) => {
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const [currentValue, setCurrentValue] = React.useState(
      stringifyValue(value ?? defaultValue),
    );

    React.useEffect(() => {
      if (value !== undefined) {
        setCurrentValue(stringifyValue(value));
      }
    }, [value]);

    function assignRef(node: HTMLInputElement | null) {
      inputRef.current = node;

      if (typeof ref === "function") {
        ref(node);
        return;
      }

      if (ref) {
        ref.current = node;
      }
    }

    function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
      setCurrentValue(event.target.value);
      onChange?.(event);
    }

    function handleClear() {
      const input = inputRef.current;
      if (!input) {
        return;
      }

      const nativeValueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;

      nativeValueSetter?.call(input, "");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.focus();
      setCurrentValue("");
    }

    const normalizedType = type ?? "text";
    const isClearable =
      !disabled &&
      !readOnly &&
      !nonClearableInputTypes.has(normalizedType) &&
      currentValue.length > 0;

    return (
      <div className="relative w-full">
        <input
          type={type}
          className={cn(
            "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
            isClearable ? "pr-9" : null,
            className,
          )}
          ref={assignRef}
          value={value}
          defaultValue={defaultValue}
          disabled={disabled}
          readOnly={readOnly}
          onChange={handleChange}
          {...props}
        />
        {isClearable ? (
          <button
            type="button"
            aria-label="Clear input"
            className="absolute right-2 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={handleClear}
          >
            <CircleX className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    );
  },
);
Input.displayName = "Input";

function stringifyValue(value: React.ComponentProps<"input">["value"]) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value);
}

export { Input };
