export interface BackupRecord {
  id: string;
  clientName: string;      // Client Name
  policyName: string;      // Policy Name
  startTime: string;       // Start Time
  endTime: string;         // End Time
  duration: string;        // Duration
  policyType: string;      // Policy Type
  scheduleType: string;    // Schedule Type
  fileCount: string;       // File Count
  jobSize: string;         // Job Size (MB)
  statusCode: string;      // Status Code (Successfully, Failed, etc.)
  status: "success" | "failure" | "pending"; // Standardized status
  
  receivedAt: string;
  subject: string;
  errorDetails: string | null;
  parsedWithAI: boolean;
  
  // For compatibility
  serverName: string;
  systemType: string;
  size: string | null;
  
  count?: number;
  list?: Array<{ name: string; status: string; size: string | null }>;
  
  // Reference to the uploaded file that generated this backup job
  uploadFileId?: string | null;
}

export interface EmailTemplate {
  id: string;
  title: string;
  subject: string;
  body: string;
}

export interface UploadedFile {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: "pdf" | "eml" | "msg" | "txt";
  uploadedAt: string;
  backupsExtracted: number;
  backupIds: string[];
}

