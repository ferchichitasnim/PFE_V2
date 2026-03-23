"use client";

import { useCompletion } from "@ai-sdk/react";

export default function useStoryGeneration(model) {
  const completion = useCompletion({
    api: "/api/chat",
    body: { model },
  });

  return completion;
}
