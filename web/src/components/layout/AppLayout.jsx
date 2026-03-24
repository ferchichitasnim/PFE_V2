"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import ToastNotifications from "../ToastNotifications";
import GlobalFileBar from "./GlobalFileBar";
import Sidebar, { MobileBottomNav } from "./Sidebar";

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const fn = () => setIsMobile(mq.matches);
    fn();
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, [breakpoint]);
  return isMobile;
}

export default function AppLayout({ children, activeTab, onTabChange }) {
  const [collapsed, setCollapsed] = useState(false);
  const isMobile = useIsMobile();
  const sidebarWidth = isMobile ? 0 : collapsed ? 64 : 240;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--pbi-dark)" }}>
      <GlobalFileBar />

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <ToastNotifications />
        {!isMobile && (
          <Sidebar
            activeTab={activeTab}
            onTabChange={onTabChange}
            collapsed={collapsed}
            onToggleCollapse={() => setCollapsed((v) => !v)}
          />
        )}
        {isMobile && <MobileBottomNav activeTab={activeTab} onTabChange={onTabChange} />}

        <motion.main
          initial={false}
          animate={{ marginLeft: isMobile ? 0 : sidebarWidth }}
          transition={{ duration: 0.18, ease: "easeInOut" }}
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            overflowY: "auto",
            paddingBottom: isMobile ? 88 : 0,
          }}
        >
          {children}
        </motion.main>
      </div>
    </div>
  );
}
