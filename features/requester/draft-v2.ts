import type {
  WizardDraftPayloadV2,
  WizardPayload,
} from "./wizard-types";

export function buildWizardDraftPayloadV2(
  payload: WizardPayload,
): WizardDraftPayloadV2 {
  return {
    schemaVersion: 2,
    referenceNo: payload.referenceNo,
    sourceMode: payload.sourceMode,
    patentQuery: payload.patentQuery,
    selectedPatentFileIds: payload.selectedPatentFileIds,
    uploadedFiles: payload.uploadedFiles.map((file) => ({
      requestFileId: file.requestFileId,
      name: file.name,
      size: file.size,
      type: file.type,
    })),
    quoteCurrency: payload.quoteCurrency,
    config: payload.config,
    lastStep: payload.lastStep,
  };
}
