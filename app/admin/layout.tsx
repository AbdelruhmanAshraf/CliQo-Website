import {getCopy} from "@/i18n/server";
import type { Metadata } from "next";
import "./admin.css";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await getCopy();
  return {title: tr("لوحة إدارة المشروع | CliQo"), robots: {index: false, follow: false}};
}

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
