"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { inputClass } from "./form";

export type ComboOption = { value: string; label: string; hint?: string };

const MAX_VISIBLE = 80;

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k",
  л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h",
  ц: "ts", ч: "ch", ш: "sh", щ: "sht", ъ: "a", ь: "y", ю: "yu", я: "ya",
};

function toLatin(text: string) {
  return [...text].map((char) => TRANSLIT[char] ?? char).join("");
}

/** Lower-case Cyrillic + Latin forms, so "sofia" finds "София". */
function searchKey(text: string) {
  const lower = text.toLowerCase();
  return `${lower} ${toLatin(lower)}`;
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder,
  emptyText,
  disabled,
  id,
  ...aria
}: {
  options: ComboOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  emptyText: string;
  disabled?: boolean;
  id?: string;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const selected = options.find((option) => option.value === value) ?? null;

  const indexed = useMemo(
    () => options.map((option) => ({ option, label: searchKey(option.label), full: searchKey(`${option.label} ${option.hint ?? ""}`) })),
    [options]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, MAX_VISIBLE);

    const starts: ComboOption[] = [];
    const contains: ComboOption[] = [];
    for (const item of indexed) {
      const words = item.label.split(/\s+/);
      if (words.some((word) => word.startsWith(q))) starts.push(item.option);
      else if (item.full.includes(q)) contains.push(item.option);
    }
    return [...starts, ...contains].slice(0, MAX_VISIBLE);
  }, [indexed, options, query]);

  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function openList() {
    if (disabled) return;
    setOpen(true);
    setQuery("");
    setActive(0);
  }

  function choose(option: ComboOption) {
    onChange(option.value);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (event.key === "ArrowDown" || event.key === "Enter")) {
      event.preventDefault();
      openList();
      return;
    }
    if (!open) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (filtered[active]) choose(filtered[active]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <input
        id={id}
        {...aria}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={disabled}
        placeholder={open && selected ? selected.label : placeholder}
        value={open ? query : (selected?.label ?? "")}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={openList}
        onClick={() => !open && openList()}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className={`${inputClass} pr-16`}
      />

      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center gap-1 pr-2 text-subtle">
        {selected && !disabled && (
          <button
            type="button"
            tabIndex={-1}
            aria-label="Clear"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onChange(null)}
            className="pointer-events-auto grid size-6 place-items-center rounded hover:bg-overlay hover:text-fg-2"
          >
            <X className="size-3.5" />
          </button>
        )}
        <ChevronsUpDown className="size-4" />
      </div>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-line-strong bg-raised py-1 text-sm shadow-lg"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-muted">{emptyText}</li>
          ) : (
            filtered.map((option, index) => (
              <li
                key={option.value}
                data-index={index}
                role="option"
                aria-selected={option.value === value}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
                onMouseMove={() => setActive(index)}
                className={`flex cursor-pointer items-center gap-2 px-3 py-2 ${
                  index === active ? "bg-accent-soft text-fg" : "text-fg-2"
                }`}
              >
                <span className="flex-1 truncate">{option.label}</span>
                {option.hint && <span className="shrink-0 text-xs text-subtle">{option.hint}</span>}
                {option.value === value && <Check className="size-4 shrink-0 text-accent-fg" />}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
