import React from "react";
import { useNavigate } from "react-router";

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
      <h1 className="text-6xl font-bold text-muted-foreground/30">404</h1>
      <p className="text-xl text-muted-foreground">Page not found</p>
      <button
        className="mt-4 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        onClick={() => navigate("/")}
      >
        Go home
      </button>
    </div>
  );
}
