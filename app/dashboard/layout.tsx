import type { ReactNode } from "react";
import { DashboardNav } from "./navigation";
import styles from "./workspace.module.css";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <div className={styles.shell}>
    <DashboardNav />
    <div className={styles.body}>{children}</div>
  </div>;
}
