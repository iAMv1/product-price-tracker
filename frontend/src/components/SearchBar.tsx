import { useEffect, useRef, useState } from 'react';

/**
 * Product search box. Interaction pattern ported from motionforge's
 * lab-search: `/` focuses from anywhere, Escape clears, result count is
 * announced via aria-live, and the shortcut hint hides while typing.
 */
export function SearchBar({
  onSearch,
  searching,
  resultCount,
  hasQuery,
}: {
  onSearch: (query: string) => void;
  searching: boolean;
  resultCount: number | null;
  hasQuery: boolean;
}) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      ) {
        return;
      }
      event.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="search-row">
      <form
        className="search-box"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          onSearch(value);
        }}
      >
        <svg viewBox="0 0 16 16" aria-hidden className="search-icon" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
          <circle cx="7" cy="7" r="4.25" />
          <path d="m10.25 10.25 3 3" />
        </svg>
        <input
          ref={inputRef}
          type="search"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            if (value) {
              setValue('');
              onSearch('');
            } else {
              event.currentTarget.blur();
            }
          }}
          placeholder="Search the mock store by product name"
          aria-label="Search the mock store by product name"
          aria-keyshortcuts="/"
          spellCheck={false}
          autoComplete="off"
        />
        {!value && (
          <kbd aria-hidden className="search-kbd">
            /
          </kbd>
        )}
        <button type="submit" className="btn btn-primary" disabled={searching || value.trim() === ''}>
          {searching ? 'Searching…' : 'Search'}
        </button>
      </form>
      <p className="muted" aria-live="polite">
        {resultCount === null
          ? 'Partial or full product name — the store has 960 products.'
          : hasQuery
            ? `${resultCount} match${resultCount === 1 ? '' : 'es'}`
            : `${resultCount} tracked target${resultCount === 1 ? '' : 's'} below`}
      </p>
    </div>
  );
}
