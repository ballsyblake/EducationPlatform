import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Coach Education | Football Queensland",
    template: "%s · Coach Education",
  },
  description: "Courses, assessments and feedback for Football Queensland coaches.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
