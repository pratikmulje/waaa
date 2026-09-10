import React, { useState } from "react";
import { Routes, Route } from "react-router-dom";

import { ThemeProvider } from "./context/ThemeContext.jsx";
import { ToastProvider } from "./context/ToastContext.jsx";
import { ConnectionProvider } from "./context/ConnectionContext.jsx";

import Intro from "./pages/Intro.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Chats from "./pages/Chats.jsx";
import FraudCenter from "./pages/FraudCenter.jsx";
import ImportantMessages from "./pages/ImportantMessages.jsx";
import Analytics from "./pages/Analytics.jsx";
import AIAssistant from "./pages/AIAssistant.jsx";
import Settings from "./pages/Settings.jsx";
import ConnectionPage from "./pages/Connection.jsx";

const INTRO_KEY = "waaa:intro-seen";

export default function App() {
  const [showIntro, setShowIntro] = useState(() => !sessionStorage.getItem(INTRO_KEY));

  function dismissIntro() {
    sessionStorage.setItem(INTRO_KEY, "1");
    setShowIntro(false);
  }

  return (
    <ThemeProvider>
      <ToastProvider>
        <ConnectionProvider>
          {showIntro && <Intro onDone={dismissIntro} />}

          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/priority" element={<Chats priorityOnly />} />
            <Route path="/chats" element={<Chats />} />
            <Route path="/important" element={<ImportantMessages />} />
            <Route path="/fraud" element={<FraudCenter />} />
            <Route path="/assistant" element={<AIAssistant />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/connection" element={<ConnectionPage />} />
          </Routes>
        </ConnectionProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
