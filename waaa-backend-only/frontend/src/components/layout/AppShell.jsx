import React, { useState, useCallback } from "react";
import Sidebar from "./Sidebar.jsx";
import Topbar from "./Topbar.jsx";

export default function AppShell({ title, children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const close = useCallback(() => setSidebarOpen(false), []);
  const open = useCallback(() => setSidebarOpen(true), []);

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <Sidebar open={sidebarOpen} onClose={close} />

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden animate-fade-in"
          onClick={close}
          aria-hidden="true"
        />
      )}

      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <Topbar onMenuClick={open} title={title} />
        <main className="flex-1 overflow-y-auto px-4 py-5 lg:px-8 lg:py-7">
          {children}
        </main>
      </div>
    </div>
  );
}
