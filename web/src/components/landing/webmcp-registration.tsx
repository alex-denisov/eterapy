"use client";

import { useEffect } from "react";

type WebMcpTool = {
  name: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, never> };
  execute: () => Promise<{ content: Array<{ type: "text"; text: string }> }>;
};

declare global {
  interface Navigator {
    modelContext?: {
      registerTool?: (tool: WebMcpTool) => void;
      provideContext?: (context: { tools: WebMcpTool[] }) => void;
    };
  }

  interface Window {
    __eterapyWebMcpRegistered?: boolean;
  }
}

const publicOverviewTool: WebMcpTool = {
  name: "get_eterapy_public_overview",
  description: "Return a short public description of ETerapy and its safety boundary. This tool cannot access accounts, personal questions, payments or health information.",
  inputSchema: { type: "object", properties: {} },
  execute: async () => ({
    content: [{
      type: "text",
      text: "ETerapy is a dialogue platform for structuring a life question and choosing a next step. It is not medical treatment, diagnosis, emergency support or a replacement for a qualified professional. Canonical guide: https://eterapy.com/how-it-works",
    }],
  }),
};

export function WebMcpRegistration() {
  useEffect(() => {
    if (window.__eterapyWebMcpRegistered || !navigator.modelContext) return;

    if (navigator.modelContext.registerTool) {
      navigator.modelContext.registerTool(publicOverviewTool);
    } else if (navigator.modelContext.provideContext) {
      navigator.modelContext.provideContext({ tools: [publicOverviewTool] });
    } else {
      return;
    }

    window.__eterapyWebMcpRegistered = true;
  }, []);

  return null;
}
