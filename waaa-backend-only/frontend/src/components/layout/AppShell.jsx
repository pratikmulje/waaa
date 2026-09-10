import React, { useState } from "react";
import Sidebar from "./Sidebar.jsx";
import Topbar from "./Topbar.jsx";

export default function AppShell({ title, children }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex min-h-screen flex-1 flex-col lg:pl-0">
        <Topbar onMenuClick={() => setMobileOpen(true)} title={title} />
        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
