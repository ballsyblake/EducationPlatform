import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Coach LMS",
    template: "%s · Coach LMS",
  },
  description: "Assignments, quizzes, and film study for football coaching staffs.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
