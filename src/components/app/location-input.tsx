"use client";

import { History, X } from "lucide-react";
import { useRef, useState, type ComponentProps, type KeyboardEvent, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const OPTION_SELECTOR = "[data-location-option]";

/**
 * A plain text field for a download folder, plus a picker of folders used
 * before on this daemon (see `useLocationHistory`). The field stays free
 * text: the picker only fills it in. Without history it is just the input.
 */
export function LocationInput({
  value,
  onValueChange,
  locations,
  onForget,
  inputRef,
  className,
  inputClassName,
  disabled,
  ...inputProps
}: Omit<ComponentProps<typeof Input>, "value" | "onChange" | "ref" | "className"> & {
  value: string;
  onValueChange: (value: string) => void;
  /** Folders to offer, best first. */
  locations: readonly string[];
  /** Remove one folder from the history. */
  onForget: (path: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  /** Wrapper classes; `inputClassName` styles the field itself. */
  className?: string;
  inputClassName?: string;
}) {
  const ownRef = useRef<HTMLInputElement>(null);
  const fieldRef = inputRef ?? ownRef;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const hasHistory = locations.length > 0 && !disabled;

  function moveFocus(event: KeyboardEvent<HTMLUListElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const options = [...event.currentTarget.querySelectorAll<HTMLElement>(OPTION_SELECTOR)];
    if (!options.length) return;
    event.preventDefault();
    const at = options.findIndex((option) => option === document.activeElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    options[(at + step + options.length) % options.length]?.focus();
  }

  return (
    <div ref={wrapperRef} className={cn("relative min-w-0", className)}>
      <Input
        ref={fieldRef}
        value={value}
        disabled={disabled}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={(event) => {
          if (!hasHistory || open || event.key !== "ArrowDown") return;
          event.preventDefault();
          setOpen(true);
        }}
        className={cn(hasHistory && "pr-8", inputClassName)}
        {...inputProps}
      />
      {hasHistory ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground"
                aria-label="Recent locations"
                title="Recent locations"
              />
            }
          >
            <History />
          </PopoverTrigger>
          <PopoverContent
            anchor={wrapperRef}
            align="start"
            // Back to the field, caret at the end, so a subfolder can be typed after a pick.
            finalFocus={() => {
              const field = fieldRef.current;
              field?.setSelectionRange(field.value.length, field.value.length);
              return field;
            }}
            className="w-(--anchor-width) min-w-56 gap-1 p-1"
          >
            <PopoverTitle className="px-2 pt-1 text-xs font-medium text-muted-foreground">
              Recent locations
            </PopoverTitle>
            <ul className="max-h-64 overflow-y-auto" onKeyDown={moveFocus}>
              {locations.map((path) => (
                <li
                  key={path}
                  className="flex items-center gap-0.5 rounded-md pr-1 focus-within:bg-muted hover:bg-muted"
                >
                  <button
                    type="button"
                    data-location-option=""
                    aria-current={path === value ? "true" : undefined}
                    className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-left font-mono text-xs break-all outline-none aria-[current=true]:font-semibold"
                    onClick={() => {
                      onValueChange(path);
                      setOpen(false);
                    }}
                  >
                    {path}
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="text-muted-foreground"
                    aria-label={`Forget ${path}`}
                    title="Forget this location"
                    onClick={() => {
                      // Forgetting the last one removes the picker; keep focus in the field.
                      if (locations.length === 1) fieldRef.current?.focus();
                      onForget(path);
                    }}
                  >
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}
