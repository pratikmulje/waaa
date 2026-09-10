import React from "react";
import QRCodeSVG from "react-qr-code";

// Thin wrapper so the rest of the app doesn't care which QR library
// is used. Renders the REAL QR string handed to it by the backend
// (Baileys connection.update -> /api/connection) — never generates
// a placeholder value.
export default function QRCode({ value, size = 200 }) {
  if (!value) return null;
  return <QRCodeSVG value={value} size={size} bgColor="#ffffff" fgColor="#0B0F12" />;
}
