"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  getSession,
  reroll,
  submitCandidateFeedback,
} from "../client/api/client";
import { userMessageFor } from "../client/api/error";
import {
  appendGeneratedRound,
  latestRound,
  updateCandidateInSession,
} from "../client/session";
import type {
  CandidateFeedbackValue,
  SessionApiDto,
} from "../contracts/api";
import styles from "./session-result.module.css";

export function SessionResultClient({ sessionId }: { readonly sessionId: string }) {
  const [session, setSession] = useState<SessionApiDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rerollPending, setRerollPending] = useState(false);
  const [rerollError, setRerollError] = useState<string | null>(null);
  const [feedbackPending, setFeedbackPending] = useState<Set<string>>(new Set());
  const [feedbackErrors, setFeedbackErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setSession(await getSession(sessionId));
    } catch (cause) {
      setLoadError(userMessageFor(cause));
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleFeedback(
    candidateResultId: string,
    current: CandidateFeedbackValue | null,
    value: CandidateFeedbackValue,
  ) {
    if (current === value || feedbackPending.has(candidateResultId)) return;

    setFeedbackPending((previous) => new Set(previous).add(candidateResultId));
    setFeedbackErrors((previous) => {
      const next = { ...previous };
      delete next[candidateResultId];
      return next;
    });
    try {
      await submitCandidateFeedback(candidateResultId, value);
      setSession((previous) =>
        previous === null
          ? null
          : updateCandidateInSession(previous, candidateResultId, (candidate) => ({
              ...candidate,
              feedback: { ...candidate.feedback, candidate: value },
            })),
      );
    } catch (cause) {
      setFeedbackErrors((previous) => ({
        ...previous,
        [candidateResultId]: userMessageFor(cause),
      }));
    } finally {
      setFeedbackPending((previous) => {
        const next = new Set(previous);
        next.delete(candidateResultId);
        return next;
      });
    }
  }

  async function handleReroll() {
    if (rerollPending || session === null) return;
    setRerollPending(true);
    setRerollError(null);
    try {
      const generated = await reroll(sessionId);
      setSession((previous) =>
        previous === null ? previous : appendGeneratedRound(previous, generated),
      );
    } catch (cause) {
      setRerollError(userMessageFor(cause));
    } finally {
      setRerollPending(false);
    }
  }

  if (loading) {
    return <p className={styles.loading}>結果を読み込んでいます…</p>;
  }

  if (session === null) {
    return (
      <section className={styles.loadError} aria-live="polite">
        <p>{loadError ?? "処理中に問題が発生しました。"}</p>
        <div className={styles.errorActions}>
          <button type="button" onClick={() => void load()}>再読み込み</button>
          <Link href="/">ホームへ戻る</Link>
        </div>
      </section>
    );
  }

  const round = latestRound(session);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>キーワード</p>
          <h1>{session.source.surface}</h1>
          <p className={styles.reading}>{session.source.reading}</p>
        </div>
        <nav className={styles.actions} aria-label="結果の操作">
          <button
            type="button"
            onClick={() => void handleReroll()}
            disabled={rerollPending}
          >
            {rerollPending ? "探しています…" : "もう一度探す"}
          </button>
          <Link className={styles.detailLink} href={`/sessions/${sessionId}/detail`}>
            詳細を見る
          </Link>
        </nav>
        <div className={styles.rerollStatus} aria-live="polite">
          {rerollError === null ? null : <p>{rerollError}</p>}
        </div>
      </header>

      {round === null || round.candidates.length === 0 ? (
        <p className={styles.empty}>今回は表示できる候補がありませんでした。</p>
      ) : (
        <section className={styles.grid} aria-label="候補一覧">
          {round.candidates.map((candidate) => {
            const pending = feedbackPending.has(candidate.candidateResultId);
            return (
              <article className={styles.card} key={candidate.candidateResultId}>
                <div className={styles.word}>
                  <h2>{candidate.surface}</h2>
                  <p>{candidate.reading}</p>
                </div>
                <div className={styles.feedback} aria-label={`${candidate.surface}の評価`}>
                  <button
                    type="button"
                    aria-pressed={candidate.feedback.candidate === "like"}
                    disabled={pending}
                    onClick={() =>
                      void handleFeedback(
                        candidate.candidateResultId,
                        candidate.feedback.candidate,
                        "like",
                      )
                    }
                  >
                    Like
                  </button>
                  <button
                    type="button"
                    aria-pressed={candidate.feedback.candidate === "dislike"}
                    disabled={pending}
                    onClick={() =>
                      void handleFeedback(
                        candidate.candidateResultId,
                        candidate.feedback.candidate,
                        "dislike",
                      )
                    }
                  >
                    Dislike
                  </button>
                </div>
                <div className={styles.feedbackStatus} aria-live="polite">
                  {feedbackErrors[candidate.candidateResultId] === undefined ? null : (
                    <p>{feedbackErrors[candidate.candidateResultId]}</p>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
