import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Poppins } from "next/font/google";
import { ThemeCleanup } from "@/components/ThemeCleanup";
import LuminousFluidBackground from "@/components/background/LuminousFluidBackground";
import { ZenModeProvider } from "@/components/zen/ZenModeContext";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ClockWise People",
  description: "ClockWise People",
  icons: {
    icon: [
      { url: "/assets/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/assets/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/assets/favicon.ico" },
    ],
    apple: [{ url: "/assets/apple-touch-icon.png", sizes: "180x180" }],
  },
  manifest: "/assets/site.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const isZenModeInitial = cookieStore.get("clockwise_zen_mode")?.value === "true";
  const initialZenTab =
    (cookieStore.get("clockwise_zen_tab")?.value as "timesheets" | "leave") || "timesheets";
  const initialPaletteIndex = Number(cookieStore.get("clockwise_fluid_palette")?.value || 0);

  return (
    <html
      lang="en"
      className={`${poppins.variable} font-sans h-full antialiased ${isZenModeInitial ? "zen-mode" : ""}`}
      suppressHydrationWarning
    >
      <body className={`min-h-full flex flex-col ${isZenModeInitial ? "zen-mode" : ""}`}>
        <ZenModeProvider
          initialIsZenMode={isZenModeInitial}
          initialZenTab={initialZenTab}
          initialPaletteIndex={initialPaletteIndex}
        >
          <LuminousFluidBackground />
          <ThemeCleanup />
          {children}
        </ZenModeProvider>
      </body>
    </html>
  );
}
