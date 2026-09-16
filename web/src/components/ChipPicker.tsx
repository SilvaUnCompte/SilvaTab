import { autoUpdate, flip, offset, size, useFloating } from "@floating-ui/react-dom";
import { Plus, X } from "lucide-react";
import { useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";

interface ChipPickerProps<T> {
  label: ReactNode;
  placeholder: string;
  /** Items currently picked, rendered as removable chips. */
  selected: T[];
  /** Items that can be picked, filtered by the search text. */
  options: T[];
  getId: (item: T) => string;
  getText: (item: T) => string;
  renderChip: (item: T) => ReactNode;
  renderOption: (item: T) => ReactNode;
  chipStyle?: (item: T) => CSSProperties;
  onAdd: (item: T) => void;
  onRemove: (item: T) => void;
  /** When set, a "Create" entry is offered if no item matches the search text exactly. */
  onCreate?: (text: string) => Promise<void>;
}

const normalize = (text: string) => text.trim().toLowerCase();

const MAX_LIST_HEIGHT = 240;

/**
 * Fixed positioning lets the list overflow the scrolling modal body; it flips above the input
 * when there is not enough room below and matches the input width.
 */
const floatingOptions = {
  strategy: "fixed",
  placement: "bottom-start",
  whileElementsMounted: autoUpdate,
  middleware: [
    offset(4),
    flip({ padding: 8 }),
    size({
      padding: 8,
      apply({ rects, availableHeight, elements }) {
        Object.assign(elements.floating.style, {
          width: `${rects.reference.width}px`,
          maxHeight: `${Math.min(MAX_LIST_HEIGHT, availableHeight)}px`,
        });
      },
    }),
  ],
} satisfies Parameters<typeof useFloating>[0];

/** Search field that picks items from a list and shows them as chips. */
export function ChipPicker<T>(props: ChipPickerProps<T>) {
  const { label, placeholder, selected, options, getId, getText, onAdd, onRemove, onCreate } = props;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const { refs, floatingStyles } = useFloating(floatingOptions);

  const needle = normalize(query);
  const matches = options.filter((item) => normalize(getText(item)).includes(needle));
  const exists = [...selected, ...options].some((item) => normalize(getText(item)) === needle);
  const canCreate = Boolean(onCreate && needle && !exists);

  const pick = (item: T) => {
    onAdd(item);
    setQuery("");
  };

  const create = async () => {
    try {
      await onCreate?.(query.trim());
      setQuery("");
    } catch {
      // The caller displays the error; keep the text so the user can fix it.
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape" && query) {
      event.stopPropagation();
      setQuery("");
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    const exact = matches.find((item) => normalize(getText(item)) === needle);
    if (exact) pick(exact);
    else if (canCreate) void create();
    else if (needle && matches[0]) pick(matches[0]);
  };

  return (
    <div className="field">
      <span className="text-label row gap-4">{label}</span>
      {selected.length > 0 && (
        <div className="row gap-4 wrap">
          {selected.map((item) => (
            <span key={getId(item)} className="chip" style={props.chipStyle?.(item)}>
              {props.renderChip(item)}
              <button type="button" className="icon-btn chip-remove" onClick={() => onRemove(item)} aria-label="Remove">
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div>
        <input
          ref={refs.setReference}
          className="input"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
        {open && (matches.length > 0 || canCreate) && (
          // preventDefault keeps the focus in the input while clicking an option.
          <div ref={refs.setFloating} className="picker" style={floatingStyles} onMouseDown={(e) => e.preventDefault()}>

            {matches.map((item) => (
              <button key={getId(item)} type="button" className="picker-item" onClick={() => pick(item)}>
                {props.renderOption(item)}
              </button>
            ))}
            {canCreate && (
              <button type="button" className="picker-item" onClick={() => void create()}>
                <Plus size={13} /> Create <strong>“{query.trim()}”</strong>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
