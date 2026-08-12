"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { generate } from "../client/api/client";
import { userMessageFor } from "../client/api/error";
import styles from "./generation-form.module.css";

export function GenerationFormClient() {
  const router = useRouter();
  const [sourceSurface, setSourceSurface] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || sourceSurface.trim().length === 0) return;

    setPending(true);
    setError(null);
    try {
      const result = await generate(sourceSurface);
      router.push(`/sessions/${result.sessionId}`);
    } catch (cause) {
      setError(userMessageFor(cause));
      setPending(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.field}>
        <label htmlFor="source-surface">キーワード</label>
        <input
          id="source-surface"
          name="sourceSurface"
          value={sourceSurface}
          onChange={(event) => setSourceSurface(event.target.value)}
          placeholder="例：夜"
          disabled={pending}
          required
          autoComplete="off"
        />
      </div>
      <button
        className={styles.submit}
        type="submit"
        disabled={pending || sourceSurface.trim().length === 0}
      >
        {pending ? "探しています…" : "探す"}
      </button>
      <div className={styles.status} aria-live="polite">
        {error === null ? null : <p className={styles.error}>{error}</p>}
      </div>
    </form>
  );
}
