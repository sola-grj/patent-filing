"use client";

import { useRef } from "react";

type ClickableDateInputProps = {
  name: string;
  defaultValue?: string;
  min?: string;
  className?: string;
};

type DateInputElement = HTMLInputElement & {
  showPicker?: () => void;
};

export function ClickableDateInput({
  name,
  defaultValue,
  min,
  className,
}: ClickableDateInputProps) {
  const inputRef = useRef<DateInputElement | null>(null);

  const openPicker = () => {
    const input = inputRef.current;
    if (!input) {
      return;
    }

    input.focus();
    input.showPicker?.();
  };

  return (
    <div className="w-full" onClick={openPicker}>
      <input
        ref={inputRef}
        name={name}
        type="date"
        defaultValue={defaultValue}
        min={min}
        className={className}
      />
    </div>
  );
}
