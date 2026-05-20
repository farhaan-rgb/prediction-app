import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { UserProvider } from "@/context/UserContext";
import Navbar from "@/components/Navbar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PredictIt — Sports Prediction Game",
  description: "Predict IPL and NBA outcomes. Climb the leaderboard. Free to play.",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full`}>
      <body className="min-h-dvh flex flex-col">
        <UserProvider>
          <Navbar />
          {/* pb-20 reserves space for bottom tab bar on mobile */}
          <div className="flex-1 pb-20">{children}</div>
        </UserProvider>
      </body>
    </html>
  );
}
