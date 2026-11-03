'use client';

import { useEffect, useId, useRef, useState } from 'react';

// Photon is a free address search built on OpenStreetMap data, with no key. Its public server is for light use,
// so requests wait for a pause in typing. Suggestions only fill in the box: saving still geocodes and rounds the
// address on our server, and the address itself is never stored.
const PHOTON_URL = 'https://photon.komoot.io/api/';
const CHICAGO_AREA_BBOX = '-88.0,41.6,-87.5,42.1';
const MIN_CHARS = 3;
const DEBOUNCE_MS = 300;
const MAX_SUGGESTIONS = 3;

type Suggestion = { id: string; main: string; detail: string; value: string };

type PhotonFeature = {
  properties: {
    osm_id?: number;
    osm_type?: string;
    name?: string;
    housenumber?: string;
    street?: string;
    city?: string;
    state?: string;
    postcode?: string;
  };
};

function toSuggestion(feature: PhotonFeature): Suggestion | null {
  const p = feature.properties;
  const streetLine = p.housenumber && p.street ? `${p.housenumber} ${p.street}` : p.name ?? p.street;
  // Routes are for Chicago only, so suburbs inside the search box are left out.
  if (!streetLine || p.city !== 'Chicago') return null;
  const detail = [p.city, p.state, p.postcode].filter(Boolean).join(', ');
  return {
    id: `${p.osm_type ?? ''}${p.osm_id ?? streetLine}`,
    main: streetLine,
    detail,
    // What goes in the box: specific enough for the Census lookup when the route is saved.
    value: [streetLine, p.city, p.state === 'Illinois' ? 'IL' : p.state].filter(Boolean).join(', '),
  };
}

export function AddressInput({
  id,
  value,
  onChange,
  placeholder,
  invalid,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  invalid: boolean;
  describedBy?: string;
}) {
  const listId = useId();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  // Picking a suggestion changes the text, which shouldn't trigger a new search.
  const skipNextSearch = useRef(false);

  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    const query = value.trim();
    if (query.length < MIN_CHARS) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: query, limit: String(MAX_SUGGESTIONS + 3), lang: 'en', lat: '41.88', lon: '-87.63', bbox: CHICAGO_AREA_BBOX });
        const response = await fetch(`${PHOTON_URL}?${params}`, { signal: controller.signal });
        if (!response.ok) return;
        const body = (await response.json()) as { features?: PhotonFeature[] };
        const unique = new Map<string, Suggestion>();
        for (const feature of body.features ?? []) {
          const suggestion = toSuggestion(feature);
          if (suggestion && !unique.has(suggestion.value)) unique.set(suggestion.value, suggestion);
        }
        const list = [...unique.values()].slice(0, MAX_SUGGESTIONS);
        setSuggestions(list);
        setHighlighted(-1);
        setOpen(list.length > 0);
      } catch {
        // Suggestions are optional, so a failed lookup just shows none.
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  const pick = (suggestion: Suggestion) => {
    skipNextSearch.current = true;
    onChange(suggestion.value);
    setOpen(false);
    setSuggestions([]);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted((index) => (index + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (event.key === 'Enter' && highlighted >= 0) {
      event.preventDefault();
      pick(suggestions[highlighted]);
    } else if (event.key === 'Escape') {
      // Close just the list, not the whole add-route pop-up.
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
        onFocus={() => setOpen(suggestions.length > 0)}
        placeholder={placeholder}
        maxLength={200}
        required
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && highlighted >= 0 ? `${listId}-${highlighted}` : undefined}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={`w-full rounded-md border bg-bg px-3 py-2 ${invalid ? 'border-bad' : 'border-line'}`}
      />
      {open && (
        // Sits in the page flow rather than floating, so the add-route pop-up's scrolling can't cut it off.
        <div className="mt-1 overflow-hidden rounded-md border border-line bg-surface shadow-lg">
          <ul id={listId} role="listbox" aria-label="Address suggestions">
            {suggestions.map((suggestion, index) => (
              <li
                key={suggestion.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === highlighted}
                // Mouse down instead of click, so the input's blur doesn't close the list first.
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(suggestion);
                }}
                onMouseEnter={() => setHighlighted(index)}
                className={`cursor-pointer border-l-2 px-3 py-2 ${index === highlighted ? 'border-bike bg-bike-soft' : 'border-transparent'}`}
              >
                <span className="block text-sm font-semibold">{suggestion.main}</span>
                {suggestion.detail && <span className="block text-xs text-muted">{suggestion.detail}</span>}
              </li>
            ))}
          </ul>
          <p className="border-t border-line px-3 py-1.5 text-[11px] text-muted">
            Suggestions from Photon, using © OpenStreetMap data
          </p>
        </div>
      )}
    </div>
  );
}
