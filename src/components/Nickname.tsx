'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import { useSupabase } from '@/lib/live-data';

const MIN_LENGTH = 2;
const MAX_LENGTH = 24;

// The rider's nickname, kept in the profiles table. It's what the leaderboard shows other riders.
export function useNickname() {
  const supabase = useSupabase();
  const { userId } = useAuth();
  const [nickname, setNickname] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void supabase
      .from('profiles')
      .select('display_name')
      .maybeSingle()
      .then(({ data, error }) => {
        setFailed(Boolean(error));
        setNickname(data?.display_name ?? null);
        setLoaded(true);
      });
  }, [supabase]);

  // Returns an error message to show, or null once it's saved.
  const save = async (value: string): Promise<string | null> => {
    const name = value.trim();
    if (name.length < MIN_LENGTH) return `Use at least ${MIN_LENGTH} characters.`;
    if (!userId) return 'Sign in again to save your nickname.';
    const { error } = await supabase
      .from('profiles')
      .upsert({ user_id: userId, display_name: name, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) return error.code === '23505' ? 'Someone already has that nickname. Try another.' : 'We couldn’t save your nickname. Try again.';
    setNickname(name);
    return null;
  };

  return { nickname, loaded, failed, save };
}

export function NicknameForm({
  initial,
  submitLabel,
  onSave,
  onCancel,
}: {
  initial: string;
  submitLabel: string;
  onSave: (name: string) => Promise<string | null>;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(await onSave(value));
    setSaving(false);
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-2">
      <label htmlFor="nickname" className="text-sm font-semibold">
        Nickname
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <input
          id="nickname"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
          minLength={MIN_LENGTH}
          maxLength={MAX_LENGTH}
          required
          autoFocus
          placeholder="Lakefront Larry"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'nickname-error' : undefined}
          className={`min-w-0 flex-1 rounded-md border bg-bg px-3 py-2 ${error ? 'border-bad' : 'border-line'}`}
        />
        <button
          type="submit"
          disabled={saving}
          className="cursor-pointer rounded-md bg-bike px-4 py-2 font-semibold text-surface hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
        >
          {saving ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="cursor-pointer text-sm text-muted underline hover:text-ink">
            Cancel
          </button>
        )}
      </div>
      {error && (
        <p id="nickname-error" role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
    </form>
  );
}

// Every signed-in page sits behind this, so a new rider picks a nickname before anything else.
export function NicknameGate({ children }: { children: React.ReactNode }) {
  const { nickname, loaded, failed, save } = useNickname();

  if (!loaded) return <p role="status" className="text-muted">Loading your profile…</p>;
  if (nickname || failed) return <>{children}</>;

  return (
    <section className="grid max-w-xl gap-4 rounded-lg border-2 border-bike bg-surface p-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-bold">Choose your nickname</h1>
        <p className="text-sm text-muted">
          Other riders see it next to your points on the leaderboard. They never see your email, routes or stations. You can
          change it later on your profile.
        </p>
      </div>
      <NicknameForm initial="" submitLabel="Continue" onSave={save} />
    </section>
  );
}
