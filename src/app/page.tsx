import { GenerationFormClient } from "../components/generation-form-client";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.main}>
      <section className={styles.panel} aria-labelledby="home-heading">
        <h1 id="home-heading">ことばを探す</h1>
        <GenerationFormClient />
      </section>
    </main>
  );
}
