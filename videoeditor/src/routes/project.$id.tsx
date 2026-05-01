import { useParams, useNavigate, useLoaderData, type LoaderFunctionArgs } from "react-router";
import React, { useEffect } from "react";
import TimelineEditor from "./home";
import type { TimelineState } from "~/components/timeline/types";
import { IdParamSchema } from "~/schemas";

export async function loader({ params }: LoaderFunctionArgs) {
  // Validate route param
  const id = IdParamSchema.parse(params.id);
  let timeline = undefined;
  try {
     const res = await fetch(`http://localhost:3000/api/projects/${id}`);
     if (res.ok) {
       const project = await res.json();
       timeline = project.timeline_data;
     }
  } catch(e) {
    console.error("Failed to fetch project timeline:", e);
  }
  return { timeline };
}

export default function ProjectEditorRoute() {
  const params = useParams();
  const navigate = useNavigate();
  const id = params.id as string;
  const data = useLoaderData() as { timeline?: TimelineState };

  useEffect(() => {
    // Lightweight guard: verify project ownership before showing editor
    (async () => {
      const res = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
        credentials: "include",
      });
      if (!res.ok) navigate("/projects");
    })();
  }, [id, navigate]);

  // Pass through existing editor; it manages state internally. We injected loader for prefetch.
  return <TimelineEditor />;
}
