import React from "react";
import { Routes, Route, Navigate } from "react-router";
import { ThemeProvider } from "~/components/ui/ThemeProvider";
import { Toaster } from "~/components/ui/sonner";
import Projects from "~/routes/projects";
import ProjectEditorRoute from "~/routes/project";
import MediaBin from "~/components/timeline/MediaBin";
import TextEditor from "~/components/media/TextEditor";
import Transitions from "~/components/media/Transitions";
import SubtitleBin from "~/components/timeline/SubtitleBin";
import NotFound from "~/NotFound";

export default function App() {
  return (
    <ThemeProvider>
      <main className="min-h-screen w-full overflow-x-hidden">
        <Routes>
          <Route path="/" element={<Projects />} />

          {/* Project editor with nested panel routes rendered via <Outlet> in LeftPanel */}
          <Route path="/project/:id" element={<ProjectEditorRoute />}>
            {/* Default: redirect to media-bin */}
            <Route index element={<Navigate to="media-bin" replace />} />
            <Route path="media-bin" element={<MediaBin />} />
            <Route path="text-editor" element={<TextEditor />} />
            <Route path="transitions" element={<Transitions />} />
            <Route path="subtitles-bin" element={<SubtitleBin />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Toaster position="top-right" expand={false} richColors closeButton />
    </ThemeProvider>
  );
}
