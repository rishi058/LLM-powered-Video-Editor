import { useParams, useNavigate } from "react-router";
import React, { useEffect } from "react";
import TimelineEditor from "~/routes/home";

/**
 * Replaced the Remix SSR loader pattern with a simple client-side auth guard.
 * The project is validated on mount via the API (which also loads the timeline).
 */
export default function ProjectEditorRoute() {
  const params = useParams();
  const navigate = useNavigate();
  const id = params.id as string;

  useEffect(() => {
    if (!id) {
      navigate("/");
      return;
    }
    // Lightweight ownership check — TimelineEditor does the full data load
    fetch(`/api/projects/${encodeURIComponent(id)}`).then((res) => {
      if (!res.ok) navigate("/");
    });
  }, [id, navigate]);

  return <TimelineEditor />;
}
