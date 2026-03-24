"use client";

import { useState } from "react";
import { PBIXProvider } from "./context/PBIXContext";
import AppLayout from "./components/layout/AppLayout";
import StorytellingPage from "./components/StorytellingPage";
import DAXGeneratorPage from "./components/dax/DAXGeneratorPage";

export default function App() {
  const [activeTab, setActiveTab] = useState("storytelling");

  return (
    <PBIXProvider>
      <AppLayout activeTab={activeTab} onTabChange={setActiveTab}>
        {activeTab === "storytelling" && <StorytellingPage />}
        {activeTab === "dax" && <DAXGeneratorPage />}
      </AppLayout>
    </PBIXProvider>
  );
}
