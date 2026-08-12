import { SessionDetailClient } from "../../../../components/session-detail-client";
import styles from "./detail-page.module.css";

export default async function SessionDetailPage({
  params,
}: {
  readonly params: Promise<{ readonly sessionId: string }>;
}) {
  const { sessionId } = await params;

  return (
    <main className={styles.main}>
      <SessionDetailClient sessionId={sessionId} />
    </main>
  );
}
