"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  WizardPatentAnalysisResult,
  WizardPatentAnalysisStatus,
  WizardSourceMode,
} from "@/features/requester/wizard-types";

type AnalysisInput = {
  sourceMode: WizardSourceMode;
  patentNumber?: string;
  files: File[];
};

type AnalysisState = {
  status: WizardPatentAnalysisStatus;
  result?: WizardPatentAnalysisResult;
  error?: string;
};

export function usePatentAnalysis(initialResult?: WizardPatentAnalysisResult) {
  const [state, setState] = useState<AnalysisState>({
    status: initialResult ? "complete" : "idle",
    result: initialResult,
  });
  const activeRequest = useRef<{ controller: AbortController; key: string } | undefined>(undefined);
  const completedKey = useRef<string | undefined>(undefined);

  const cancel = useCallback(() => {
    activeRequest.current?.controller.abort();
    activeRequest.current = undefined;
  }, []);

  const reset = useCallback(() => {
    cancel();
    completedKey.current = undefined;
    setState({ status: "idle" });
  }, [cancel]);

  const start = useCallback((input: AnalysisInput) => {
    const key = buildInputKey(input);
    if (activeRequest.current?.key === key || completedKey.current === key) {
      return;
    }

    cancel();
    const formData = buildAnalysisFormData(input);
    if (!formData) {
      setState({
        status: "error",
        error: input.sourceMode === "upload"
          ? "Reattach the uploaded files to run patent analysis."
          : "A patent number is required to run patent analysis.",
      });
      return;
    }

    const controller = new AbortController();
    activeRequest.current = { controller, key };
    setState({ status: "pending" });

    void fetch("/api/patents/analyze", {
      method: "POST",
      body: formData,
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await readAnalysisError(response));
        }
        return response.json() as Promise<WizardPatentAnalysisResult>;
      })
      .then((result) => {
        if (controller.signal.aborted || activeRequest.current?.key !== key) {
          return;
        }
        completedKey.current = key;
        activeRequest.current = undefined;
        setState({ status: "complete", result });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || activeRequest.current?.key !== key) {
          return;
        }
        activeRequest.current = undefined;
        setState({
          status: "error",
          error: error instanceof Error ? error.message : "Patent analysis failed.",
        });
      });
  }, [cancel]);

  useEffect(() => {
    const abortActiveRequest = () => activeRequest.current?.controller.abort();
    window.addEventListener("pagehide", abortActiveRequest);
    return () => {
      window.removeEventListener("pagehide", abortActiveRequest);
      abortActiveRequest();
    };
  }, []);

  return { ...state, start, cancel, reset };
}

function buildAnalysisFormData(input: AnalysisInput) {
  const formData = new FormData();
  if (input.sourceMode === "patent_search") {
    const patentNumber = input.patentNumber?.trim();
    if (!patentNumber) return null;
    formData.set("patent_number", patentNumber);
    return formData;
  }

  if (!input.files.length) return null;
  input.files.forEach((file) => formData.append("files", file));
  return formData;
}

function buildInputKey(input: AnalysisInput) {
  if (input.sourceMode === "patent_search") {
    return `patent:${input.patentNumber?.trim().toUpperCase() ?? ""}`;
  }
  return `upload:${input.files
    .map((file) => `${file.name}:${file.size}:${file.lastModified}`)
    .join("|")}`;
}

async function readAnalysisError(response: Response) {
  const payload = await response.json().catch(() => null) as {
    detail?: unknown;
    error?: { message?: unknown };
  } | null;
  if (typeof payload?.detail === "string") return payload.detail;
  if (typeof payload?.error?.message === "string") return payload.error.message;
  return `Patent analysis failed (${response.status}).`;
}
