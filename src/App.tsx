import { Routes, Route, Navigate } from "react-router-dom";
import { Shell } from "@/components/shell";
import { Toaster } from "@/lib/toast";
import LibraryPage from "@/pages/Library";
import ProjectPage from "@/pages/Project";
import FocusPage from "@/pages/Focus";
import InboxPage from "@/pages/Inbox";
import ChatPage from "@/pages/Chat";

export function App() {
  return (
    <>
      <Shell>
        <Routes>
          <Route path="/" element={<LibraryPage />} />
          <Route path="/projects/:id" element={<ProjectPage />} />
          <Route path="/focus" element={<FocusPage />} />
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
      <Toaster />
    </>
  );
}