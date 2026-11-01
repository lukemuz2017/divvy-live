'use client';

import { useState } from 'react';
import type { Route } from '@/lib/live-data';

type FieldName = 'name' | 'start' | 'end';

const FIELDS: { id: FieldName; label: string; placeholder: string }[] = [
  { id: 'name', label: 'Route name', placeholder: 'To work' },
  { id: 'start', label: 'Start address', placeholder: '1060 W Addison St' },
  { id: 'end', label: 'End address', placeholder: '233 S Wacker Dr' },
];

export function RouteForm({
  isFirst,
  onSaved,
  onCancel,
}: {
  isFirst: boolean;
  onSaved: (route: Route) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Record<FieldName, string>>({ name: '', start: '', end: '' });
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const body = await response.json();
      if (!response.ok) {
        setError({ message: body.error, field: body.field });
        return;
      }
      onSaved(body.route);
    } catch {
      setError({ message: 'We couldn’t reach the server. Check your connection and try again.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4 rounded-lg border border-line bg-surface p-5">
      <div className="grid gap-1">
        <h2 className="text-xl font-bold">{isFirst ? 'Add your first route' : 'Add a route'}</h2>
        <p className="text-sm text-muted">
          We only use your addresses to find nearby stations. We save a location rounded to about a block, not the
          address.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {FIELDS.map((field) => (
          <div key={field.id} className="grid content-start gap-1">
            <label htmlFor={field.id} className="text-sm font-semibold">
              {field.label}
            </label>
            <input
              id={field.id}
              value={values[field.id]}
              onChange={(event) => setValues({ ...values, [field.id]: event.target.value })}
              placeholder={field.placeholder}
              maxLength={field.id === 'name' ? 40 : 200}
              required
              aria-invalid={error?.field === field.id}
              aria-describedby={error?.field === field.id ? 'route-form-error' : undefined}
              className={`rounded-md border bg-bg px-3 py-2 ${error?.field === field.id ? 'border-bad' : 'border-line'}`}
            />
          </div>
        ))}
      </div>
      {error && (
        <p id="route-form-error" role="alert" className="text-sm text-bad">
          {error.message}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={saving}
          className="cursor-pointer rounded-md bg-bike px-4 py-2 font-semibold text-surface hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
        >
          {saving ? 'Finding stations…' : 'Save route'}
        </button>
        {!isFirst && (
          <button type="button" onClick={onCancel} className="cursor-pointer rounded-md px-4 py-2 font-semibold text-muted hover:text-ink">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
