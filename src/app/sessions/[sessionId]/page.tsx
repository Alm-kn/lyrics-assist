import { SessionResultClient } from "../../../components/session-result-client";
import styles from "./session-page.module.css";

export default async function SessionPage({
  params,
}: {
  readonly params: Promise<{ readonly sessionId: string }>;
}) {
  const { sessionId } = await params;

  return (
    <main className={styles.main}>
      <SessionResultClient sessionId={sessionId} />
    </main>
  );
}
