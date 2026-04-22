"use client";

import { useState } from "react";
import { PBIXProvider } from "./context/PBIXContext";
import AppLayout from "./components/layout/AppLayout";
import HomePage from "./components/HomePage";
import StorytellingPage from "./components/StorytellingPage";
import DAXGeneratorPage from "./components/dax/DAXGeneratorPage";
import DocumentationPage from "./components/DocumentationPage";

export default function App() {
  const [activeTab, setActiveTab] = useState("home");

  return (
    <PBIXProvider>
      <AppLayout activeTab={activeTab} onTabChange={setActiveTab}>
        {activeTab === "home" && <HomePage onNavigate={setActiveTab} />}
        {activeTab === "storytelling" && <StorytellingPage />}
        {activeTab === "dax" && <DAXGeneratorPage />}
        {activeTab === "documentation" && <DocumentationPage />}
      </AppLayout>
    </PBIXProvider>
  );
}
