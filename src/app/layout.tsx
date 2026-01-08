import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MTG Price Checker - Compare Magic Card Prices",
  description: "Compare Magic: The Gathering card prices across Poromagia, Basaari, and Cardmarket. Find the best deals on MTG singles.",
  keywords: ["Magic: The Gathering", "MTG", "card prices", "Poromagia", "Basaari", "Cardmarket", "price comparison"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
