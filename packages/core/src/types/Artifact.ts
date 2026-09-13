/** A build output DevDeploy has taken custody of and can validate/deploy. */
export interface Artifact {
  id: string;
  jobId: string;
  fileName: string;
  filePath: string;
  sizeBytes: number;
  sha256: string;
  kind: "ipa" | "apk" | "aab" | "app" | "zip" | "other";
  signed: boolean;
  createdAt: string;
}
