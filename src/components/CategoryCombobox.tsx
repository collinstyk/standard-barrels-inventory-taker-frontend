import { useId, useState } from "react";
import { Check, ChevronsUpDown, Plus, Search } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

type Category = { id: string | number; name: string };

export function CategoryCombobox({
  categories,
  categoryId,
  newCategoryName,
  onExisting,
  onNew,
  disabled,
}: {
  categories: Category[];
  categoryId: string;
  newCategoryName: string;
  onExisting: (id: string) => void;
  onNew: (name: string) => void;
  disabled?: boolean;
}) {
  const labelId = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const name = search.trim();
  const matching = categories.filter((category) =>
    category.name.toLocaleLowerCase().includes(name.toLocaleLowerCase()),
  );
  const exactMatch = categories.some(
    (category) => category.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase(),
  );
  const canCreate = name.length >= 2 && name.length <= 120 && !exactMatch;
  const selected = categories.find((category) => String(category.id) === categoryId);

  return (
    <div className="category-field">
      <span className="category-field-label" id={labelId}>Category</span>
      <Popover open={open} onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="category-combobox-trigger"
            role="combobox"
            aria-expanded={open}
            aria-labelledby={labelId}
            aria-required="true"
            disabled={disabled}
          >
            <span className={!selected && !newCategoryName ? "category-placeholder" : ""}>
              {selected?.name || (newCategoryName ? `New category: ${newCategoryName}` : "Search or create category")}
            </span>
            <ChevronsUpDown size={16} aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="category-combobox-content" onOpenAutoFocus={(event) => event.preventDefault()}>
          <Command shouldFilter={false}>
            <div className="category-command-search">
              <Search size={16} aria-hidden="true" />
              <CommandInput
                autoFocus
                placeholder="Type a category name…"
                value={search}
                onValueChange={setSearch}
                aria-label="Search categories or type a new one"
              />
            </div>
            <CommandList>
              {matching.map((category) => (
                <CommandItem
                  key={category.id}
                  value={`category:${category.id}`}
                  onSelect={() => {
                    onExisting(String(category.id));
                    setOpen(false);
                  }}
                >
                  <Check size={15} className={String(category.id) === categoryId ? "category-check-visible" : "category-check-hidden"} aria-hidden="true" />
                  {category.name}
                </CommandItem>
              ))}
              {canCreate && (
                <CommandItem
                  value={`new:${name}`}
                  onSelect={() => {
                    onNew(name);
                    setOpen(false);
                  }}
                >
                  <Plus size={15} aria-hidden="true" />
                  Create “{name}” with product
                </CommandItem>
              )}
              {!matching.length && !canCreate && (
                <CommandEmpty>
                  {name.length > 120 ? "Category names must be 120 characters or fewer." : "Type at least 2 characters to create a category."}
                </CommandEmpty>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <button type="button" className="category-create-link" disabled={disabled} onClick={() => { setSearch(""); setOpen(true); }}>
        <Plus size={14} aria-hidden="true" /> Add a new category
      </button>
      {newCategoryName && <small>“{newCategoryName}” will be saved together with this product.</small>}
    </div>
  );
}
