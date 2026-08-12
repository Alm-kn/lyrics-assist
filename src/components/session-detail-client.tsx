"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  getSession,
  submitSoundScoreFeedback,
} from "../client/api/client";
import { userMessageFor } from "../client/api/error";
import { latestRound, updateCandidateInSession } from "../client/session";
import type {
  ApiCandidate,
  SessionApiDto,
  SoundScoreFeedbackValue,
} from "../contracts/api";
import styles from "./session-detail.module.css";

const SOUND_FEEDBACK_OPTIONS: readonly {
  readonly value: SoundScoreFeedbackValue;
  readonly label: string;
}[] = [
  { value: "low", label: "低すぎる" },
  { value: "valid", label: "妥当" },
  { value: "high", label: "高すぎる" },
];

function scorePosition(score: number): number {
  return 50 + (Math.max(0, Math.min(100, score)) / 100) * 400;
}

function ScatterPlot({
  candidates,
  activeId,
  onActivate,
}: {
  readonly candidates: readonly ApiCandidate[];
  readonly activeId: string | null;
  readonly onActivate: (candidateResultId: string) => void;
}) {
  return (
    <section className={styles.plotSection} aria-labelledby="plot-heading">
      <h2 id="plot-heading">Sound と Semantic</h2>
      <div className={styles.plotWrap}>
        <svg
          className={styles.plot}
          viewBox="0 0 500 500"
          role="img"
          aria-label="Soundを横軸、Semanticを縦軸とする候補散布図"
          data-testid="scatter-plot"
        >
          {[50, 250, 450].map((position, index) => (
            <g key={position}>
              <line x1={position} y1="50" x2={position} y2="450" />
              <line x1="50" y1={position} x2="450" y2={position} />
              <text x={position} y="474" textAnchor="middle">{index * 50}</text>
              <text x="32" y={456 - index * 200} textAnchor="middle">{index * 50}</text>
            </g>
          ))}
          <text className={styles.axisLabel} x="250" y="498" textAnchor="middle">Sound</text>
          <text className={styles.axisLabel} x="12" y="250" textAnchor="middle" transform="rotate(-90 12 250)">Semantic</text>
          {candidates.map((candidate) => {
            const active = candidate.candidateResultId === activeId;
            return (
              <g
                key={candidate.candidateResultId}
                role="button"
                tabIndex={0}
                aria-label={`${candidate.surface}: Sound ${candidate.sound.finalScore}, Semantic ${candidate.semantic.score}`}
                aria-pressed={active}
                onMouseEnter={() => onActivate(candidate.candidateResultId)}
                onFocus={() => onActivate(candidate.candidateResultId)}
                onClick={() => onActivate(candidate.candidateResultId)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onActivate(candidate.candidateResultId);
                  }
                }}
              >
                <circle
                  className={active ? styles.activePoint : styles.point}
                  cx={scorePosition(candidate.sound.finalScore)}
                  cy={500 - scorePosition(candidate.semantic.score)}
                  r={active ? 10 : 7}
                  data-testid="scatter-point"
                />
              </g>
            );
          })}
        </svg>
      </div>
      <div className={styles.legend} aria-label="候補を選択">
        {candidates.map((candidate) => (
          <button
            key={candidate.candidateResultId}
            type="button"
            aria-pressed={candidate.candidateResultId === activeId}
            onClick={() => onActivate(candidate.candidateResultId)}
          >
            {candidate.surface}
          </button>
        ))}
      </div>
    </section>
  );
}

export function SessionDetailClient({ sessionId }: { readonly sessionId: string }) {
  const [session, setSession] = useState<SessionApiDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [feedbackPending, setFeedbackPending] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const loaded = await getSession(sessionId);
      const round = latestRound(loaded);
      setSession(loaded);
      setActiveId(
        round?.candidates.find((candidate) => candidate.selection.rank === 1)
          ?.candidateResultId ??
          round?.candidates[0]?.candidateResultId ??
          null,
      );
    } catch (cause) {
      setLoadError(userMessageFor(cause));
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;
    void getSession(sessionId)
      .then((loaded) => {
        if (cancelled) return;
        const round = latestRound(loaded);
        setSession(loaded);
        setActiveId(
          round?.candidates.find((candidate) => candidate.selection.rank === 1)
            ?.candidateResultId ??
            round?.candidates[0]?.candidateResultId ??
            null,
        );
      })
      .catch((cause: unknown) => {
        if (!cancelled) setLoadError(userMessageFor(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  async function handleSoundFeedback(
    candidate: ApiCandidate,
    value: SoundScoreFeedbackValue,
  ) {
    if (candidate.feedback.soundScore === value || feedbackPending) return;
    setFeedbackPending(true);
    setFeedbackError(null);
    try {
      await submitSoundScoreFeedback(candidate.candidateResultId, value);
      setSession((previous) =>
        previous === null
          ? null
          : updateCandidateInSession(
              previous,
              candidate.candidateResultId,
              (item) => ({
                ...item,
                feedback: { ...item.feedback, soundScore: value },
              }),
            ),
      );
    } catch (cause) {
      setFeedbackError(userMessageFor(cause));
    } finally {
      setFeedbackPending(false);
    }
  }

  if (loading) return <p className={styles.loading}>結果を読み込んでいます…</p>;

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
  const candidates = round?.candidates ?? [];
  const active = candidates.find(
    (candidate) => candidate.candidateResultId === activeId,
  ) ?? null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>キーワード</p>
          <h1>{session.source.surface}</h1>
          <p className={styles.reading}>{session.source.reading}</p>
        </div>
        <Link href={`/sessions/${sessionId}`}>結果へ戻る</Link>
      </header>

      {candidates.length === 0 ? (
        <p className={styles.empty}>今回は表示できる候補がありませんでした。</p>
      ) : (
        <>
          <ScatterPlot
            candidates={candidates}
            activeId={activeId}
            onActivate={setActiveId}
          />
          {active === null ? null : (
            <CandidateDetail
              candidate={active}
              pending={feedbackPending}
              error={feedbackError}
              onFeedback={(value) => void handleSoundFeedback(active, value)}
            />
          )}
        </>
      )}
    </div>
  );
}

function CandidateDetail({
  candidate,
  pending,
  error,
  onFeedback,
}: {
  readonly candidate: ApiCandidate;
  readonly pending: boolean;
  readonly error: string | null;
  readonly onFeedback: (value: SoundScoreFeedbackValue) => void;
}) {
  const breakdown = candidate.sound.breakdown;
  const ending = candidate.sound.endingAdjustment;

  return (
    <article className={styles.detailPanel} aria-live="polite">
      <header>
        <h2>{candidate.surface}</h2>
        <p>{candidate.reading}</p>
      </header>
      <div className={styles.metrics}>
        <section aria-labelledby="sound-heading">
          <h3 id="sound-heading">Sound</h3>
          <dl>
            <div><dt>総合</dt><dd>{candidate.sound.finalScore}</dd></div>
            <div><dt>モーラ長</dt><dd>{breakdown.moraLengthScore}</dd></div>
            <div><dt>位置一致</dt><dd>{breakdown.positionMatchScore}</dd></div>
            <div><dt>系列類似</dt><dd>{breakdown.sequenceSimilarityScore}</dd></div>
            <div><dt>末尾一致数</dt><dd>{ending.commonSuffixLength}</dd></div>
            <div><dt>末尾カバー率</dt><dd>{ending.suffixCoverage}</dd></div>
            <div><dt>末尾ボーナス</dt><dd>{ending.bonus}</dd></div>
          </dl>
        </section>
        <section aria-labelledby="semantic-heading">
          <h3 id="semantic-heading">Semantic</h3>
          <dl>
            <div><dt>スコア</dt><dd>{candidate.semantic.score}</dd></div>
            <div><dt>主関係</dt><dd>{candidate.semantic.primaryRelation}</dd></div>
            <div><dt>副関係</dt><dd>{candidate.semantic.secondaryRelations.join("、") || "—"}</dd></div>
            <div><dt>クラスタ</dt><dd>{candidate.semantic.semanticCluster}</dd></div>
          </dl>
          <p className={styles.reason}><strong>意味:</strong> {candidate.semantic.reason}</p>
        </section>
        <section aria-labelledby="selection-heading">
          <h3 id="selection-heading">Selection</h3>
          <dl>
            <div><dt>カテゴリ</dt><dd>{candidate.selection.category}</dd></div>
            {candidate.selection.fallbackStrategy === undefined ? null : (
              <div><dt>Fallback</dt><dd>{candidate.selection.fallbackStrategy}</dd></div>
            )}
            <div><dt>順位</dt><dd>{candidate.selection.rank}</dd></div>
          </dl>
        </section>
      </div>
      <section className={styles.soundFeedback} aria-labelledby="feedback-heading">
        <h3 id="feedback-heading">語感点は？</h3>
        <div>
          {SOUND_FEEDBACK_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={candidate.feedback.soundScore === option.value}
              disabled={pending}
              onClick={() => onFeedback(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className={styles.feedbackStatus} aria-live="polite">
          {error === null ? null : <p>{error}</p>}
        </div>
      </section>
    </article>
  );
}
