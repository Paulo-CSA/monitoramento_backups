import express from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import * as MsgReaderImport from "msgreader";
// Robustly unwrap any nested default exports for MsgReader
const getMsgReaderConstructor = () => {
  let target = MsgReaderImport as any;
  while (target && typeof target !== "function" && target.default) {
    target = target.default;
  }
  return target;
};
const MsgReader = getMsgReaderConstructor();
import * as pdfImport from "pdf-parse";
const pdf = (pdfImport as any).default || pdfImport;


dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Seed data
const defaultBackups = [
  {
    id: "1",
    serverName: "Banco de Dados Produção (PostgreSQL)",
    status: "success",
    size: "45.2 GB",
    duration: "42m 15s",
    systemType: "pg_dump & AWS S3",
    receivedAt: "2026-07-08T06:00:00.000Z",
    subject: "BACKUP SUCCESS: DB-PROD-REPLICA-01",
    errorDetails: null,
    parsedWithAI: true
  },
  {
    id: "2",
    serverName: "Servidor de Arquivos Clientes (Samba NAS)",
    status: "failure",
    size: "1.2 TB",
    duration: "12m 04s",
    systemType: "rsync / NAS",
    receivedAt: "2026-07-08T05:30:00.000Z",
    subject: "CRITICAL: Backup rsync failed on filesystem-nas-02",
    errorDetails: "No space left on target backup volume /mnt/backup_nas_02 (Error code 28: ENOSPC)",
    parsedWithAI: true
  },
  {
    id: "3",
    serverName: "Uploads S3 Assets (Media)",
    status: "success",
    size: "184.7 GB",
    duration: "2h 15m",
    systemType: "AWS Backup",
    receivedAt: "2026-07-08T04:00:00.000Z",
    subject: "AWS Backup Completed - S3-Media-Production",
    errorDetails: null,
    parsedWithAI: true
  },
  {
    id: "4",
    serverName: "ERP & CRM System (Veeam VM)",
    status: "pending",
    size: "420 GB",
    duration: null,
    systemType: "Veeam Backup & Replication",
    receivedAt: "2026-07-08T07:05:00.000Z",
    subject: "Veeam job 'VM-ERP-DAILY-REPLICATION' is currently running - 65% completed",
    errorDetails: "Job is currently in progress. Initiated by System Scheduler. Estimated time remaining: 1h 10m.",
    parsedWithAI: true
  },
  {
    id: "5",
    serverName: "API Gateway Logs & Analytics",
    status: "success",
    size: "12.8 GB",
    duration: "18m 30s",
    systemType: "Elasticsearch Snapshot",
    receivedAt: "2026-07-07T23:45:00.000Z",
    subject: "Success - Elasticsearch Snapshot Logs-2026-07-07",
    errorDetails: null,
    parsedWithAI: true
  }
];

const BACKUPS_FILE_PATH = path.join(process.cwd(), "backups.json");
const UPLOADS_FILE_PATH = path.join(process.cwd(), "uploads.json");
const UPLOADS_DIR_PATH = path.join(process.cwd(), "uploads");

// Ensure uploads folder exists
if (!fs.existsSync(UPLOADS_DIR_PATH)) {
  try {
    fs.mkdirSync(UPLOADS_DIR_PATH, { recursive: true });
    console.log("[Storage] Diretório 'uploads' criado com sucesso.");
  } catch (err) {
    console.error("[Storage] Erro ao criar diretório uploads:", err);
  }
}

// Helper to load uploads metadata
function loadUploads() {
  try {
    if (fs.existsSync(UPLOADS_FILE_PATH)) {
      const data = fs.readFileSync(UPLOADS_FILE_PATH, "utf-8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("Error loading uploads list:", err);
  }
  return [];
}

// Helper to save uploads metadata
function saveUploads(data: any) {
  try {
    fs.writeFileSync(UPLOADS_FILE_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving uploads list:", err);
  }
}


// Helper to load backups
function loadBackups() {
  try {
    if (fs.existsSync(BACKUPS_FILE_PATH)) {
      const data = fs.readFileSync(BACKUPS_FILE_PATH, "utf-8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("Error loading backups, using defaults:", err);
  }
  // Initialize file with defaults if not exists
  saveBackups(defaultBackups);
  return defaultBackups;
}

// Helper to save backups
function saveBackups(data: any) {
  try {
    fs.writeFileSync(BACKUPS_FILE_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving backups:", err);
  }
}

// Helper function to decode Quoted-Printable encoding including UTF-8 characters
function decodeQuotedPrintable(str: string): string {
  // Remove soft line breaks: "=" followed by CRLF or LF
  const cleanStr = str.replace(/=\r?\n/g, "").replace(/=\n/g, "");
  
  // To handle UTF-8 sequences correctly, convert to hex bytes first, then decode using Buffer
  const bytes: number[] = [];
  for (let i = 0; i < cleanStr.length; i++) {
    if (cleanStr[i] === '=' && i + 2 < cleanStr.length) {
      const hex = cleanStr.substring(i + 1, i + 3);
      if (/^[0-9A-F]{2}$/i.test(hex)) {
        bytes.push(parseInt(hex, 16));
        i += 2;
        continue;
      }
    }
    // Convert character to UTF-8 bytes
    const charCode = cleanStr.charCodeAt(i);
    if (charCode < 128) {
      bytes.push(charCode);
    } else {
      // Encode as UTF-8 bytes
      const utf8Bytes = Buffer.from(cleanStr[i], 'utf-8');
      for (let j = 0; j < utf8Bytes.length; j++) {
        bytes.push(utf8Bytes[j]);
      }
    }
  }
  return Buffer.from(bytes).toString('utf-8');
}

// Helper function to strip HTML tags and decode HTML entities safely
function cleanHtmlText(html: string): string {
  if (!html) return "";
  
  // Strip HTML tags
  let txt = html.replace(/<[^>]*>/g, " ");
  
  // Unescape common HTML entities
  txt = txt
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#193;/g, "Á")
    .replace(/&#205;/g, "Í")
    .replace(/&#211;/g, "Ó")
    .replace(/&#218;/g, "Ú")
    .replace(/&#194;/g, "Â")
    .replace(/&#202;/g, "Ê")
    .replace(/&#212;/g, "Ô")
    .replace(/&#195;/g, "Ã")
    .replace(/&#213;/g, "Õ")
    .replace(/&#199;/g, "Ç")
    .replace(/&#225;/g, "á")
    .replace(/&#237;/g, "í")
    .replace(/&#243;/g, "ó")
    .replace(/&#250;/g, "ú")
    .replace(/&#226;/g, "â")
    .replace(/&#234;/g, "ê")
    .replace(/&#244;/g, "ô")
    .replace(/&#227;/g, "ã")
    .replace(/&#245;/g, "õ")
    .replace(/&#231;/g, "ç");
  
  return txt.replace(/\s+/g, " ").trim();
}

// Helper to parse date strings from backup reports into standard ISO strings
function parseDateStringToIso(str: string | null | undefined): string | null {
  if (!str || str === "Não detalhado" || str === "-") {
    return null;
  }
  
  const cleanStr = str.replace(/[•\t\r\n]/g, " ").trim();

  // Try native Date.parse FIRST if it doesn't look like DD/MM/YYYY (which native parses as MM/DD/YYYY)
  const isDDMMYYYY = /\d{2}\/\d{2}\/\d{4}/.test(cleanStr);
  if (!isDDMMYYYY) {
    try {
      const timestamp = Date.parse(cleanStr);
      if (!isNaN(timestamp)) {
        return new Date(timestamp).toISOString();
      }
    } catch (e) {}
  }

  // Match NetBackup format: "Jul 6, 2026 7:15:35 PM" or "Jul 06, 2026 19:15:35" or "06/07/2026 19:15:35"
  const months: { [key: string]: number } = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    dist: 11, de: 11, "de jul. de": 6, "de julho de": 6, "julho": 6, "jul.": 6
  };

  // Match standard English/email date format: "Fri, 17 Jul 2026 15:08:33 +0000" or "17 Jul 2026 15:08:33"
  const matchEmailDate = cleanStr.match(/(?:\w{3},\s+)?(\d{1,2})\s+([a-zA-Z]{3,10})\s+(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (matchEmailDate) {
    const day = parseInt(matchEmailDate[1], 10);
    const monthStr = matchEmailDate[2].toLowerCase().substring(0, 3);
    const year = parseInt(matchEmailDate[3], 10);
    const hours = parseInt(matchEmailDate[4], 10);
    const minutes = parseInt(matchEmailDate[5], 10);
    const seconds = parseInt(matchEmailDate[6], 10);
    
    if (months[monthStr] !== undefined) {
      try {
        const d = new Date(Date.UTC(year, months[monthStr], day, hours, minutes, seconds));
        return d.toISOString();
      } catch (e) {}
    }
  }

  const matchPt = cleanStr.match(/(\d{1,2})\s+de\s+([a-zA-Zç\.]+)\s+de\s+(\d{4})\s*([0-9:]+)?/i);
  if (matchPt) {
    const day = parseInt(matchPt[1], 10);
    const monthName = matchPt[2].toLowerCase().substring(0, 3);
    const year = parseInt(matchPt[3], 10);
    const timeStr = matchPt[4] || "00:00:00";
    
    const ptMonths: { [key: string]: number } = {
      jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5, jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11
    };
    
    const month = ptMonths[monthName] !== undefined ? ptMonths[monthName] : 6; // default to july if fallback
    
    const timeParts = timeStr.split(":");
    const hours = parseInt(timeParts[0] || "0", 10);
    const minutes = parseInt(timeParts[1] || "0", 10);
    const seconds = parseInt(timeParts[2] || "0", 10);
    
    try {
      const d = new Date(year, month, day, hours, minutes, seconds);
      return d.toISOString();
    } catch (e) {}
  }

  const matchNetBackup = cleanStr.match(/([a-zA-Z]{3})\s+(\d+),\s+(\d{4})\s+(\d+):(\d+):(\d+)\s*(AM|PM)?/i);
  if (matchNetBackup) {
    const monthStr = matchNetBackup[1].toLowerCase().substring(0, 3);
    const day = parseInt(matchNetBackup[2], 10);
    const year = parseInt(matchNetBackup[3], 10);
    let hours = parseInt(matchNetBackup[4], 10);
    const minutes = parseInt(matchNetBackup[5], 10);
    const seconds = parseInt(matchNetBackup[6], 10);
    const ampm = matchNetBackup[7];

    if (months[monthStr] !== undefined) {
      if (ampm) {
        if (ampm.toUpperCase() === "PM" && hours < 12) hours += 12;
        if (ampm.toUpperCase() === "AM" && hours === 12) hours = 0;
      }
      try {
        const d = new Date(year, months[monthStr], day, hours, minutes, seconds);
        return d.toISOString();
      } catch (e) {}
    }
  }

  const matchBR = cleanStr.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (matchBR) {
    const day = parseInt(matchBR[1], 10);
    const month = parseInt(matchBR[2], 10) - 1;
    const year = parseInt(matchBR[3], 10);
    const hours = parseInt(matchBR[4], 10);
    const minutes = parseInt(matchBR[5], 10);
    const seconds = parseInt(matchBR[6], 10);
    try {
      const d = new Date(year, month, day, hours, minutes, seconds);
      return d.toISOString();
    } catch (e) {}
  }

  const matchISO = cleanStr.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (matchISO) {
    const year = parseInt(matchISO[1], 10);
    const month = parseInt(matchISO[2], 10) - 1;
    const day = parseInt(matchISO[3], 10);
    const hours = parseInt(matchISO[4], 10);
    const minutes = parseInt(matchISO[5], 10);
    const seconds = parseInt(matchISO[6], 10);
    try {
      const d = new Date(year, month, day, hours, minutes, seconds);
      return d.toISOString();
    } catch (e) {}
  }

  // Fallback try native parse as last resort
  try {
    const timestamp = Date.parse(cleanStr);
    if (!isNaN(timestamp)) {
      return new Date(timestamp).toISOString();
    }
  } catch (e) {}

  return null;
}

// Extracts forwarded email date/time from the email body if present
function extractForwardedDate(body: string): string | null {
  if (!body) return null;
  const lines = body.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/(?:Date|Data|Sent|Enviado|Enviado em|Enviada em):\s*([^<\r\n]+)/i);
    if (match && match[1]) {
      const candidate = match[1].replace(/<[^>]*>/g, "").trim();
      const parsed = parseDateStringToIso(candidate);
      if (parsed) {
        return parsed;
      }
    }
  }
  return null;
}

// Local regex backup parsing fallback (highly advanced & safe)
function parseEmailLocally(subject: string, body: string): any {
  // Decode subject if QP-encoded
  let decodedSubject = subject;
  if (subject.includes("=?") || subject.includes("=3D")) {
    if (subject.includes("?Q?") || subject.includes("?q?")) {
      const match = subject.match(/=\?[^?]+\?[Qq]\?([\s\S]*?)\?=/);
      if (match) {
        decodedSubject = decodeQuotedPrintable(match[1].replace(/_/g, " "));
      }
    } else {
      decodedSubject = decodeQuotedPrintable(subject);
    }
  }

  let decodedBody = body;
  if (body.includes("=3D") || body.includes("=\r\n") || body.includes("=\n")) {
    decodedBody = decodeQuotedPrintable(body);
  }

  const textToAnalyze = (decodedSubject + " " + decodedBody).toLowerCase();
  
  // 1. Try HTML Table parsing if HTML elements are present
  if (decodedBody.toLowerCase().includes("<table") || decodedBody.toLowerCase().includes("<tr")) {
    const detectedBackups: any[] = [];
    
    // Find all table rows
    const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch;
    
    while ((trMatch = trRegex.exec(decodedBody)) !== null) {
      const rowContent = trMatch[1];
      
      // Skip if this row is part of table headers
      const lowerRow = rowContent.toLowerCase();
      if (lowerRow.includes("client name") || lowerRow.includes("policy name") || lowerRow.includes("start time")) {
        continue;
      }
      
      // Find all cells (td or th) in this row
      const tdRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      let tdMatch;
      const cells: string[] = [];
      
      while ((tdMatch = tdRegex.exec(rowContent)) !== null) {
        cells.push(cleanHtmlText(tdMatch[1]));
      }
      
      // If we found a row with cells, let's check if it matches a NetBackup report format (typically 10 columns)
      if (cells.length >= 8) {
        while (cells.length < 10) {
          cells.push("-");
        }
        
        const clientName = cells[0] || "-";
        const policyName = cells[1] || "-";
        const startTime = cells[2] || "-";
        const endTime = cells[3] || "-";
        const duration = cells[4] || "-";
        const policyType = cells[5] || "-";
        const scheduleType = cells[6] || "-";
        const fileCount = cells[7] || "-";
        const jobSizeRaw = cells[8] || "-";
        const statusCode = cells[9] || "-";
        
        // Skip header row if cells still contain "client name"
        if (clientName.toLowerCase().includes("client name") || policyName.toLowerCase().includes("policy name")) {
          continue;
        }
        
        const sc = statusCode.toLowerCase();
        const isSuccess = sc.includes("successfully") || sc.includes("success") || sc.includes("sucesso");
        const isPending = sc.includes("pending") || sc.includes("running") || sc.includes("andamento");
        const status = isSuccess ? "success" : (isPending ? "pending" : "failure");
        
        let jobSize = jobSizeRaw;
        if (jobSizeRaw && !isNaN(parseFloat(jobSizeRaw)) && !jobSizeRaw.toLowerCase().includes("mb") && !jobSizeRaw.toLowerCase().includes("gb")) {
          const sizeMB = parseFloat(jobSizeRaw);
          if (sizeMB > 1024) {
            jobSize = `${(sizeMB / 1024).toFixed(2)} GB`;
          } else {
            jobSize = `${sizeMB.toFixed(2)} MB`;
          }
        }
        
        detectedBackups.push({
          clientName,
          policyName,
          startTime,
          endTime,
          duration,
          policyType,
          scheduleType,
          fileCount,
          jobSize,
          statusCode,
          status,
          
          // Compatibility fields
          serverName: clientName,
          systemType: "Veritas NetBackup",
          size: jobSize,
          errorDetails: status === "failure" ? `Falha na política: ${policyName}` : null
        });
      }
    }
    
    if (detectedBackups.length > 0) {
      return { backups: detectedBackups };
    }
  }

  // 2. Standard Plain-Text / Regex Line Parsing fallback
  const lines = decodedBody.split(/\r?\n/);
  const detectedBackups: any[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // Skip headers
    if (trimmed.toLowerCase().includes("client name") || trimmed.toLowerCase().includes("policy name") || trimmed.toLowerCase().includes("start time")) {
      continue;
    }
    
    let parts: string[] = [];
    if (trimmed.includes("|")) {
      parts = trimmed.split("|").map(p => p.trim());
    } else if (trimmed.includes("\t")) {
      parts = trimmed.split("\t").map(p => p.trim());
    } else {
      // Split by at least 2 consecutive spaces
      const spaceParts = trimmed.split(/\s{2,}/).map(p => p.trim());
      if (spaceParts.length >= 8) {
        parts = spaceParts;
      }
    }
    
    // A NetBackup row typically has 10 columns
    if (parts.length >= 8) {
      // Pad to 10 if there are fewer columns due to missing trailing/empty fields
      while (parts.length < 10) {
        parts.push("-");
      }
      
      const clientName = parts[0] || "-";
      const policyName = parts[1] || "-";
      const startTime = parts[2] || "-";
      const endTime = parts[3] || "-";
      const duration = parts[4] || "-";
      const policyType = parts[5] || "-";
      const scheduleType = parts[6] || "-";
      const fileCount = parts[7] || "-";
      const jobSizeRaw = parts[8] || "-";
      const statusCode = parts[9] || "-";
      
      const sc = statusCode.toLowerCase();
      const isSuccess = sc.includes("successfully") || sc.includes("success") || sc.includes("sucesso");
      const isPending = sc.includes("pending") || sc.includes("running") || sc.includes("andamento");
      const status = isSuccess ? "success" : (isPending ? "pending" : "failure");
      
      let jobSize = jobSizeRaw;
      if (jobSizeRaw && !isNaN(parseFloat(jobSizeRaw)) && !jobSizeRaw.toLowerCase().includes("mb") && !jobSizeRaw.toLowerCase().includes("gb")) {
        const sizeMB = parseFloat(jobSizeRaw);
        if (sizeMB > 1024) {
          jobSize = `${(sizeMB / 1024).toFixed(2)} GB`;
        } else {
          jobSize = `${sizeMB.toFixed(2)} MB`;
        }
      }
      
      detectedBackups.push({
        clientName,
        policyName,
        startTime,
        endTime,
        duration,
        policyType,
        scheduleType,
        fileCount,
        jobSize,
        statusCode,
        status,
        
        // Compatibility fields
        serverName: clientName,
        systemType: "Veritas NetBackup",
        size: jobSize,
        errorDetails: status === "failure" ? `Falha na política: ${policyName}` : null
      });
    }
  }
  
  if (detectedBackups.length > 0) {
    return { backups: detectedBackups };
  }
  
  // Single backup extraction fallback
  let status: "success" | "failure" | "pending" = "success";
  if (
    textToAnalyze.includes("fail") || 
    textToAnalyze.includes("error") || 
    textToAnalyze.includes("critical") || 
    textToAnalyze.includes("falha") || 
    textToAnalyze.includes("erro") ||
    textToAnalyze.includes("failed") ||
    textToAnalyze.includes("incorrect")
  ) {
    status = "failure";
  } else if (
    textToAnalyze.includes("progress") || 
    textToAnalyze.includes("running") || 
    textToAnalyze.includes("pending") || 
    textToAnalyze.includes("pendente") || 
    textToAnalyze.includes("andamento") ||
    textToAnalyze.includes("executando")
  ) {
    status = "pending";
  }
  
  // Extract server name
  let serverName = "";
  const serverRegexes = [
    /server:\s*([a-zA-Z0-9.\-_]+)/i,
    /host:\s*([a-zA-Z0-9.\-_]+)/i,
    /job:\s*['"]?([a-zA-Z0-9.\-_]+)['"]?/i,
    /system:\s*([a-zA-Z0-9.\-_]+)/i,
    /for\s+([a-zA-Z0-9.\-_]+)/i,
    /backup\s+of\s+([a-zA-Z0-9.\-_]+)/i
  ];
  for (const regex of serverRegexes) {
    const match = textToAnalyze.match(regex);
    if (match && match[1]) {
      serverName = match[1].trim();
      break;
    }
  }

  if (!serverName) {
    // Try to extract from subject
    const cleanSub = decodedSubject
      .replace(/\[.*?\]/g, "")
      .replace(/(success|failed|failure|warning|alert|critical|backup|job)/ig, "")
      .trim();
    if (cleanSub.length > 3) {
      serverName = cleanSub;
    } else {
      serverName = "Servidor Desconhecido";
    }
  }

  // Extract size
  let size = null;
  const sizeMatch = textToAnalyze.match(/(\d+(?:\.\d+)?\s*(?:gb|mb|tb|kb|g|m|t))/i);
  if (sizeMatch) {
    size = sizeMatch[1].toUpperCase();
  }

  // Extract duration
  let duration = null;
  const durationMatch = textToAnalyze.match(/duration:\s*([0-9a-z\s:\-_]+)/i) || 
                       textToAnalyze.match(/time:\s*([0-9a-z\s:\-_]+)/i) ||
                       textToAnalyze.match(/(\d+\s*h\s*\d+\s*m|\d+\s*m\s*\d+\s*s|\d+\s*(?:minutes|mins|seconds|secs|h|m|s))/i);
  if (durationMatch) {
    duration = (durationMatch[1] || durationMatch[0]).trim();
  }

  // Deduce system type
  let systemType = "Geral";
  if (textToAnalyze.includes("veeam")) systemType = "Veeam";
  else if (textToAnalyze.includes("rsync")) systemType = "rsync";
  else if (textToAnalyze.includes("aws")) systemType = "AWS Backup";
  else if (textToAnalyze.includes("pg_dump") || textToAnalyze.includes("postgres")) systemType = "PostgreSQL Dump";
  else if (textToAnalyze.includes("mysql") || textToAnalyze.includes("mysqldump")) systemType = "MySQL Dump";
  else if (textToAnalyze.includes("duplicati")) systemType = "Duplicati";
  else if (textToAnalyze.includes("rclone")) systemType = "rclone";

  // Error details
  let errorDetails = null;
  if (status === "failure") {
    const errorMatch = body.match(/(?:error|failed|exception|falha|erro):\s*([^\n\r]+)/i) ||
                       body.match(/(pg_dump: error: [^\n\r]+)/i) ||
                       body.match(/(rsync error: [^\n\r]+)/i);
    errorDetails = errorMatch ? errorMatch[1].trim() : "Backup finalizado com código de erro ou aviso no log.";
  }

  return {
    backups: [{
      clientName: serverName,
      policyName: "Backup Geral",
      startTime: "Não detalhado",
      endTime: "Não detalhado",
      duration: duration || "Não detalhado",
      policyType: "Geral",
      scheduleType: "Geral",
      fileCount: "Não detalhado",
      jobSize: size || "0.00 MB",
      statusCode: status === "success" ? "Successfully" : (status === "pending" ? "Pending" : "Failed"),
      status,
      
      // Compatibility fields
      serverName,
      systemType,
      size,
      errorDetails
    }]
  };
}

// Pre-defined backup email templates for easy simulation
const emailTemplates = [
  {
    id: "veritas-netbackup-multiple",
    title: "Veritas NetBackup - Multi-Jobs (INEMA)",
    subject: "INEMA - Jobs Executados (Últimas 24H)",
    body: `Veritas NetBackup™ OpsCenter Analytics
INEMA - Jobs Executados (Últimas 24H)

Client Name | Policy Name | Start Time | End Time | Duration | Policy Type | Schedule Type | File Count | Job Size (MB) | Status Code
10.90.2.117 | INEMA_MSSQL_MSDP06_DE | Jul 6, 2026 7:15:35 PM | Jul 6, 2026 7:17:04 PM | 00:01:29 | - | - | 0 | 0.00 | Failed
10.90.2.93 | INEMA_FS_IPIRA_MSDP02_PP | Jul 6, 2026 8:20:00 PM | Jul 7, 2026 12:18:14 AM | 03:58:14 | MS-Windows | Differential Incremental | 223500 | 8550.76 | Failed
10.90.2.103 | INEMA_DUMP_ITAMBE_MSDP03_DE | Jul 7, 2026 1:00:00 AM | Jul 7, 2026 1:07:36 AM | 00:07:36 | Standard | Differential Incremental | 1705 | 15801.03 | Successfully
10.90.2.104 | INEMA_DUMP_ITAPE_MSDP03_DE | Jul 7, 2026 1:00:00 AM | Jul 7, 2026 1:08:32 AM | 00:08:32 | Standard | Differential Incremental | 2641 | 41249.35 | Successfully
10.90.2.105 | INEMA_DUMP_ITATIM_MSDP03_DE | Jul 7, 2026 1:00:00 AM | Jul 7, 2026 1:00:48 AM | 00:00:48 | Standard | Differential Incremental | 3133 | 1458.06 | Successfully
10.90.2.180 | INEMA_DUMP_MINAS_MSDP03_DE | Jul 7, 2026 1:00:00 AM | Jul 7, 2026 1:00:44 AM | 00:00:44 | Standard | Differential Incremental | 7 | 0.03 | Successfully`
  },
  {
    id: "veeam-success",
    title: "Veeam VM - Sucesso",
    subject: "[SUCCESS] Veeam Backup Job: VM-ERP-DAILY-REPLICATION",
    body: `Veeam Backup & Replication v12
Job Name: VM-ERP-DAILY-REPLICATION
Triggered: Scheduler (02:00:00 UTC)
Result: SUCCESS
Start Time: 2026-07-08 02:00:15
End Time: 2026-07-08 02:45:20
Duration: 45m 5s
Total VM Size: 420.0 GB
Data Read: 14.5 GB
De-duplication ratio: 3.1x
Compression ratio: 1.8x
All replication targets are synchronized.`
  },
  {
    id: "pg-failure",
    title: "PostgreSQL Prod - Falha",
    subject: "CRITICAL ALERT: Backup pg_dump failed for db-prod-01",
    body: `Automated Backups Notification
=========================================
System: Database Replica Server
Host: db-prod-01.internal.cloud
Database: prod_replica_active
Date: 2026-07-08 03:00:10 UTC
Status: FAILED

Error Details:
pg_dump: error: write to output file failed: No space left on device
pg_dump: error: pg_dump failed with exit code 1
System alert: /var/backups mount volume is at 100% capacity (0 bytes remaining).
Job terminated. Error notified to administration team.`
  },
  {
    id: "aws-pending",
    title: "AWS S3 Assets - Pendente",
    subject: "AWS Backup Trigger Notification: s3-production-media-assets",
    body: `This is an automated notification from Amazon Web Services.
Your backup plan has triggered a new job.

Backup Job ID: backup-job-aws-993818
Resource Type: S3 Bucket (production-media-assets)
Host: aws-s3-production
Plan: Daily-Critical-Replication
Status: IN PROGRESS
Lifecycle State: PENDING VERIFICATION
Current progress: 45% of S3 objects matched.
Estimated Backup Size: 185.0 GB
Start timestamp: 2026-07-08 07:00:00 UTC`
  },
  {
    id: "rsync-failure",
    title: "rsync Servidor Arquivos - Falha",
    subject: "rsync-backup: COMPLETED WITH ERRORS for filesystem-nas-02",
    body: `rsync script executor v2.4
============================
Host: filesystem-nas-02
Destination: client-backups@backup-nas-02.internal::shares
Status: COMPLETED WITH ERRORS

Logs:
rsync: write failed on "/mnt/backup_nas_02/client_shares/invoice_2026_07.pdf": No space left on device (28)
rsync error: error in file IO (code 11) at receiver.c(393) [receiver=3.1.2]
rsync error: some files/attrs were not transferred (see previous errors) (code 23) at main.c(1207) [sender=3.1.3]

Bytes Transferred: 1.2 TB
Duration: 12m 04s`
  },
  {
    id: "duplicati-success",
    title: "Duplicati User Files - Sucesso",
    subject: "Duplicati Backup report for Laptop-CEO-Backup",
    body: `Duplicati Backup report:
Server: Laptop-CEO
Job Name: My documents
Export Type: Duplicati Web
Status: Success
Size of backup: 84.5 GB
Duration of backup: 14m 22s
Date: 2026-07-08 06:15:00 UTC
Warnings: 0
Errors: 0`
  }
];

// ================= API ENDPOINTS =================

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// List all backups
app.get("/api/backups", (req, res) => {
  const backups = loadBackups();
  res.json(backups);
});

// Create/simulate backup manually
app.post("/api/backups", (req, res) => {
  const { serverName, status, size, duration, systemType, errorDetails, subject } = req.body;
  if (!serverName || !status) {
    return res.status(400).json({ error: "Nome do servidor e status são obrigatórios." });
  }

  const newBackup = {
    id: Date.now().toString(),
    clientName: serverName,
    policyName: systemType || "Backup Geral",
    startTime: new Date().toISOString(),
    endTime: new Date().toISOString(),
    duration: duration || "00:00:00",
    policyType: "Manual",
    scheduleType: "Manual",
    fileCount: "0",
    jobSize: size || "0.00 MB",
    statusCode: status === "success" ? "Successfully" : (status === "pending" ? "Pending" : "Failed"),
    status,
    
    receivedAt: new Date().toISOString(),
    subject: subject || `Status de Backup manual para ${serverName}`,
    errorDetails: errorDetails || null,
    parsedWithAI: false,

    // Compatibility fields
    serverName,
    systemType: systemType || "Geral",
    size: size || null
  };

  const backups = loadBackups();
  backups.unshift(newBackup);
  saveBackups(backups);

  res.status(201).json(newBackup);
});

// Update backup status manually
app.put("/api/backups/:id", (req, res) => {
  const { id } = req.params;
  const { status, errorDetails } = req.body;

  const backups = loadBackups();
  const index = backups.findIndex((b: any) => b.id === id);

  if (index === -1) {
    return res.status(404).json({ error: "Backup não encontrado." });
  }

  backups[index] = {
    ...backups[index],
    status,
    statusCode: status === "success" ? "Successfully" : (status === "pending" ? "Pending" : "Failed"),
    errorDetails: status === "success" ? null : (errorDetails || backups[index].errorDetails)
  };

  saveBackups(backups);
  res.json(backups[index]);
});

// Delete backup record
app.delete("/api/backups/:id", (req, res) => {
  const { id } = req.params;
  const backups = loadBackups();
  const filtered = backups.filter((b: any) => b.id !== id);
  saveBackups(filtered);
  res.json({ success: true });
});

// Reset database to initial seed data
app.post("/api/backups/reset", (req, res) => {
  saveBackups(defaultBackups);
  res.json(defaultBackups);
});

// Get email templates for frontend dropdown simulation
app.get("/api/emails/templates", (req, res) => {
  res.json(emailTemplates);
});

// Helper function to parse email using Gemini (or local regex fallback) and save to database
async function parseAndSaveEmailContent(subject: string, body: string, uploadFileId: string | null = null, receivedAtParam: string | null = null): Promise<{ newBackups: any[], isAI: boolean }> {
  // Decode subject if QP-encoded
  let decodedSubject = subject;
  if (subject.includes("=?") || subject.includes("=3D")) {
    if (subject.includes("?Q?") || subject.includes("?q?")) {
      const match = subject.match(/=\?[^?]+\?[Qq]\?([\s\S]*?)\?=/);
      if (match) {
        decodedSubject = decodeQuotedPrintable(match[1].replace(/_/g, " "));
      }
    } else {
      decodedSubject = decodeQuotedPrintable(subject);
    }
  }

  let decodedBody = body;
  if (body.includes("=3D") || body.includes("=\r\n") || body.includes("=\n")) {
    decodedBody = decodeQuotedPrintable(body);
  }

  let parsed: any;
  let isAI = false;

  const hasApiKey = !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY";

  if (hasApiKey) {
    try {
      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `Analise as informações do e-mail de backup e extraia os dados estruturados de backup de forma rigorosa.
Se o e-mail contiver múltiplos jobs ou servidores de backup (por exemplo, em uma tabela com várias linhas), extraia TODOS os jobs como registros separados.

ASSUNTO DO EMAIL:
${decodedSubject}

CORPO DO EMAIL:
${decodedBody}

Para cada job ou servidor encontrado, extraia os seguintes campos:
1. clientName: Nome do cliente de backup/servidor.
2. policyName: Nome da política de backup (ex: INEMA_MSSQL_MSDP06_DE).
3. startTime: Data e hora de início (ex: Jul 6, 2026 7:15:35 PM).
4. endTime: Data e hora de fim (ex: Jul 6, 2026 7:17:04 PM).
5. duration: Duração do backup (ex: 00:01:29).
6. policyType: Tipo da política (ex: MS-Windows, Standard, ou '-' se indisponível).
7. scheduleType: Tipo de agendamento (ex: Differential Incremental, ou '-' se indisponível).
8. fileCount: Quantidade de arquivos copiados (ex: '223500' ou '-' se indisponível).
9. jobSize: Tamanho do job com unidade (ex: '8550.76 MB' ou '0.00 MB').
10. statusCode: Código ou status original de retorno (ex: 'Successfully', 'Failed', 'Successfully').
11. status: Mapeamento estrito do status final do backup. Deve ser estritamente 'success' (se sucesso ou successfully), 'failure' (se falhou ou erro ou failed) ou 'pending' (se em andamento ou pending).
12. errorDetails: Detalhes do erro ou logs técnicos se o status for falha (failure). Se for sucesso, coloque null.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              backups: {
                type: Type.ARRAY,
                description: "The list of backup records extracted from the email. If only one backup is present, return a list containing that single backup.",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    clientName: { type: Type.STRING, description: "Client Name of the server." },
                    policyName: { type: Type.STRING, description: "Policy Name of the backup job." },
                    startTime: { type: Type.STRING, description: "Start Time of the backup run (e.g. 'Jul 6, 2026 7:15:35 PM')." },
                    endTime: { type: Type.STRING, description: "End Time of the backup run (e.g. 'Jul 6, 2026 7:17:04 PM')." },
                    duration: { type: Type.STRING, description: "Duration of the backup (e.g. '00:01:29')." },
                    policyType: { type: Type.STRING, description: "Policy Type (e.g. 'MS-Windows', 'Standard', or '-' if not specified)." },
                    scheduleType: { type: Type.STRING, description: "Schedule Type (e.g. 'Differential Incremental', or '-' if not specified)." },
                    fileCount: { type: Type.STRING, description: "File Count as a string (e.g. '223500', or '-' if not specified)." },
                    jobSize: { type: Type.STRING, description: "Job Size including units (e.g. '8550.76 MB' or '0.00 MB')." },
                    statusCode: { type: Type.STRING, description: "Original Status Code/text (e.g. 'Successfully', 'Failed')." },
                    status: { type: Type.STRING, enum: ["success", "failure", "pending"], description: "The outcome mapped strictly to 'success', 'failure' or 'pending'." },
                    errorDetails: { type: Type.STRING, description: "Summarized error log/details if status is failure. Null otherwise." }
                  },
                  required: ["clientName", "policyName", "status", "statusCode"]
                }
              }
            },
            required: ["backups"]
          }
        }
      });

      if (response.text) {
        parsed = JSON.parse(response.text.trim());
        isAI = true;
      } else {
        throw new Error("No response from Gemini");
      }
    } catch (e) {
      console.error("Gemini parser failed, utilizing regex-based engine fallback:", e);
      parsed = parseEmailLocally(decodedSubject, decodedBody);
    }
  } else {
    parsed = parseEmailLocally(decodedSubject, decodedBody);
  }

  let backupsList: any[] = [];
  if (parsed && Array.isArray(parsed.backups)) {
    backupsList = parsed.backups;
  } else if (parsed) {
    backupsList = [parsed];
  }

  if (backupsList.length === 0) {
    backupsList = [{
      clientName: "Servidor Desconhecido",
      policyName: "Backup Geral",
      status: "success",
      statusCode: "Successfully"
    }];
  }

  // Determine final receivedAt date (prioritize passed param, fallback to forwarded date in body, fallback to first valid job date, fallback to current time)
  let finalReceivedAt = receivedAtParam;
  if (!finalReceivedAt) {
    finalReceivedAt = extractForwardedDate(decodedBody);
  }
  if (!finalReceivedAt) {
    const firstValidDateEntry = backupsList.find(b => b.startTime && b.startTime !== "Não detalhado" && b.startTime !== "-") ||
                              backupsList.find(b => b.endTime && b.endTime !== "Não detalhado" && b.endTime !== "-");
    if (firstValidDateEntry) {
      finalReceivedAt = parseDateStringToIso(firstValidDateEntry.startTime || firstValidDateEntry.endTime);
    }
  }
  if (!finalReceivedAt) {
    finalReceivedAt = new Date().toISOString();
  }

  // Map them into our full DB format
  const newBackups = backupsList.map((entry: any, index: number) => {
    const cName = entry.clientName || entry.serverName || "Servidor Desconhecido";
    const pName = entry.policyName || "Backup Geral";
    const jSize = entry.jobSize || entry.size || "0.00 MB";
    const sCode = entry.statusCode || (entry.status === "success" ? "Successfully" : (entry.status === "pending" ? "Pending" : "Failed"));
    const statusVal = entry.status || "success";

    return {
      id: (Date.now() + index + Math.floor(Math.random() * 1000)).toString(),
      clientName: cName,
      policyName: pName,
      startTime: entry.startTime || "Não detalhado",
      endTime: entry.endTime || "Não detalhado",
      duration: entry.duration || "Não detalhado",
      policyType: entry.policyType || "-",
      scheduleType: entry.scheduleType || "-",
      fileCount: entry.fileCount || "-",
      jobSize: jSize,
      statusCode: sCode,
      status: statusVal,
      
      receivedAt: finalReceivedAt,
      subject: subject,
      errorDetails: entry.errorDetails || null,
      parsedWithAI: isAI,
      
      // Compatibility fields
      serverName: cName,
      systemType: "Veritas NetBackup",
      size: jSize,
      uploadFileId: uploadFileId
    };
  });

  const backups = loadBackups();
  backups.unshift(...newBackups);
  saveBackups(backups);

  return { newBackups, isAI };
}

// Forward email endpoint: parsing using Gemini or local regex
app.post("/api/emails/forward", async (req, res) => {
  // Suporta chaves em maiúsculo ou minúsculo geradas por plataformas de integração (Power Automate, Zapier, Make, etc.)
  const subject = req.body.subject || req.body.Subject || req.body.title || req.body.Title || "";
  const body = req.body.body || req.body.Body || req.body.text || req.body.Text || req.body.content || req.body.Content || "";
  const dateParam = req.body.date || req.body.Date || req.body.receivedAt || req.body.ReceivedAt || req.body.dateTimeReceived || req.body.DateTimeReceived || null;
  
  if (!subject || !body) {
    return res.status(400).json({ error: "Assunto (subject) e Corpo (body) do e-mail são obrigatórios no JSON." });
  }

  let receivedAtParam: string | null = null;
  if (dateParam) {
    receivedAtParam = parseDateStringToIso(dateParam);
  }

  try {
    const { newBackups, isAI } = await parseAndSaveEmailContent(subject, body, null, receivedAtParam);

    // Return a summary object so frontend doesn't break, plus the full list
    const summaryBackup = {
      id: newBackups[0].id,
      clientName: newBackups.length > 1 ? `${newBackups.length} Clientes Extraídos` : newBackups[0].clientName,
      policyName: newBackups.length > 1 ? "Múltiplas Políticas" : newBackups[0].policyName,
      startTime: newBackups[0].startTime,
      endTime: newBackups[0].endTime,
      duration: newBackups.length > 1 ? "Variável" : newBackups[0].duration,
      policyType: newBackups.length > 1 ? "Múltiplos" : newBackups[0].policyType,
      scheduleType: newBackups.length > 1 ? "Múltiplos" : newBackups[0].scheduleType,
      fileCount: newBackups.length > 1 ? "Múltiplos" : newBackups[0].fileCount,
      jobSize: newBackups.length > 1 ? `${newBackups.length} Jobs de Backup` : newBackups[0].jobSize,
      statusCode: newBackups.some((b: any) => b.status === "failure") ? "Failed" : "Successfully",
      status: newBackups.some((b: any) => b.status === "failure") ? "failure" : (newBackups.some((b: any) => b.status === "pending") ? "pending" : "success"),
      
      receivedAt: newBackups[0].receivedAt,
      subject: subject,
      errorDetails: newBackups.length > 1 ? `Relatório consolidado com ${newBackups.filter((b:any) => b.status === "failure").length} falhas.` : newBackups[0].errorDetails,
      parsedWithAI: isAI,
      count: newBackups.length,
      list: newBackups.map((b: any) => ({ name: b.clientName, status: b.status, size: b.jobSize })),
      
      // Compatibility fields
      serverName: newBackups.length > 1 ? `${newBackups.length} Servidores Extraídos` : newBackups[0].serverName,
      systemType: newBackups.length > 1 ? "Veritas NetBackup / Relatório" : newBackups[0].systemType,
      size: newBackups.length > 1 ? `${newBackups.length} Jobs de Backup` : newBackups[0].size
    };

    res.status(201).json({ backup: summaryBackup, backups: newBackups, count: newBackups.length, isAI });
  } catch (err: any) {
    res.status(500).json({ error: "Falha ao processar conteúdo do e-mail", details: err.message });
  }
});

// ==================== FILE UPLOAD & MANAGEMENT ENDPOINTS ====================

// List all uploaded files
app.get("/api/uploads", (req, res) => {
  const uploads = loadUploads();
  res.json(uploads);
});

// Download an uploaded file by ID
app.get("/api/uploads/download/:id", (req, res) => {
  try {
    const uploads = loadUploads();
    const file = uploads.find((u: any) => u.id === req.params.id);
    if (!file) {
      return res.status(404).json({ error: "Arquivo não encontrado." });
    }
    
    const files = fs.readdirSync(UPLOADS_DIR_PATH);
    const diskName = files.find(f => f.startsWith(file.id + "_"));
    if (!diskName) {
      return res.status(404).json({ error: "Arquivo físico correspondente não foi encontrado no servidor." });
    }
    
    const filePath = path.join(UPLOADS_DIR_PATH, diskName);
    res.download(filePath, file.fileName);
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao baixar arquivo: " + err.message });
  }
});

// Delete an uploaded file by ID and its associated backups
app.delete("/api/uploads/:id", (req, res) => {
  try {
    const uploads = loadUploads();
    const fileIndex = uploads.findIndex((u: any) => u.id === req.params.id);
    if (fileIndex === -1) {
      return res.status(404).json({ error: "Arquivo não encontrado." });
    }
    
    const file = uploads[fileIndex];
    
    // 1. Delete physical file from disk
    try {
      const files = fs.readdirSync(UPLOADS_DIR_PATH);
      const diskName = files.find(f => f.startsWith(file.id + "_"));
      if (diskName) {
        fs.unlinkSync(path.join(UPLOADS_DIR_PATH, diskName));
      }
    } catch (unlinkErr) {
      console.error("Erro ao remover arquivo físico:", unlinkErr);
    }
    
    // 2. Delete associated backups
    try {
      const backups = loadBackups();
      const filteredBackups = backups.filter((b: any) => b.uploadFileId !== file.id);
      saveBackups(filteredBackups);
    } catch (backupErr) {
      console.error("Erro ao excluir registros de backup associados:", backupErr);
    }
    
    // 3. Remove upload entry from uploads.json
    uploads.splice(fileIndex, 1);
    saveUploads(uploads);
    
    res.json({ success: true, message: "Arquivo e registros de backup associados removidos com sucesso." });
  } catch (err: any) {
    res.status(500).json({ error: "Falha ao remover arquivo: " + err.message });
  }
});

// Clear all uploads and reset back to defaults
app.post("/api/uploads/reset", (req, res) => {
  try {
    if (fs.existsSync(UPLOADS_DIR_PATH)) {
      const files = fs.readdirSync(UPLOADS_DIR_PATH);
      for (const file of files) {
        fs.unlinkSync(path.join(UPLOADS_DIR_PATH, file));
      }
    }
    
    saveUploads([]);
    saveBackups(defaultBackups);
    
    res.json({ success: true, message: "Todos os arquivos de uploads e registros associados foram redefinidos para os padrões de fábrica." });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao redefinir uploads: " + err.message });
  }
});

// Post/Upload endpoint: Accepts base64 encoded msg, pdf, eml, txt files
app.post("/api/uploads", async (req, res) => {
  const { fileName, base64Data, fileType } = req.body;
  
  if (!fileName || !base64Data) {
    return res.status(400).json({ error: "O nome do arquivo (fileName) e dados em Base64 (base64Data) são obrigatórios." });
  }
  
  const fileId = Date.now().toString();
  const diskName = `${fileId}_${fileName}`;
  const filePath = path.join(UPLOADS_DIR_PATH, diskName);
  
  try {
    // 1. Decode base64 and write physical file
    const fileBuffer = Buffer.from(base64Data, "base64");
    fs.writeFileSync(filePath, fileBuffer);
    
    let backupsExtracted = 0;
    let backupIds: string[] = [];
    let fileExt = fileType || path.extname(fileName).toLowerCase().replace(".", "");
    
    // 2. Parse depending on format
    if (fileExt === "pdf" || fileName.endsWith(".pdf")) {
      const hasApiKey = !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY";
      
      if (hasApiKey) {
        try {
          const ai = new GoogleGenAI({
            apiKey: process.env.GEMINI_API_KEY,
            httpOptions: {
              headers: {
                'User-Agent': 'aistudio-build',
              }
            }
          });
          
          const response = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: [
              {
                inlineData: {
                  data: fileBuffer.toString("base64"),
                  mimeType: "application/pdf"
                }
              },
              `Você é um assistente especializado em Veritas NetBackup. Analise o documento PDF anexado, que é um relatório de jobs de backup do Veritas NetBackup (geralmente gerado pelo OpsCenter).
Extraia todos os registros de backup encontrados no PDF.
Retorne um objeto JSON contendo um array de backups com as seguintes propriedades para cada job:
1. clientName: Nome do cliente de backup/servidor (ex: 10.90.2.117).
2. policyName: Nome da política de backup (ex: INEMA_MSSQL_MSDP06_DE).
3. startTime: Data e hora de início (ex: Jul 6, 2026 7:15:35 PM).
4. endTime: Data e hora de fim (ex: Jul 6, 2026 7:17:04 PM).
5. duration: Duração do backup (ex: 00:01:29).
6. policyType: Tipo da política (ex: MS-Windows, Standard, ou '-' se indisponível).
7. scheduleType: Tipo de agendamento (ex: Differential Incremental, ou '-' se indisponível).
8. fileCount: Quantidade de arquivos copiados (ex: '223500' ou '-' se indisponível).
9. jobSize: Tamanho do job com unidade (ex: '8550.76 MB' ou '0.00 MB').
10. statusCode: Código ou status original de retorno (ex: 'Successfully', 'Failed').
11. status: Mapeamento estrito do status final do backup. Deve ser estritamente 'success', 'failure' ou 'pending'.
12. errorDetails: Detalhes do erro ou logs técnicos se o status for falha (failure). Se for sucesso, coloque null.`
            ],
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  backups: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        clientName: { type: Type.STRING },
                        policyName: { type: Type.STRING },
                        startTime: { type: Type.STRING },
                        endTime: { type: Type.STRING },
                        duration: { type: Type.STRING },
                        policyType: { type: Type.STRING },
                        scheduleType: { type: Type.STRING },
                        fileCount: { type: Type.STRING },
                        jobSize: { type: Type.STRING },
                        statusCode: { type: Type.STRING },
                        status: { type: Type.STRING, enum: ["success", "failure", "pending"] },
                        errorDetails: { type: Type.STRING }
                      },
                      required: ["clientName", "policyName", "status", "statusCode"]
                    }
                  }
                },
                required: ["backups"]
              }
            }
          });
          
          let parsedGemini: any = { backups: [] };
          if (response.text) {
            parsedGemini = JSON.parse(response.text.trim());
          }
          
          let commonReceivedAt = new Date().toISOString();
          const firstValidJob = (parsedGemini.backups || []).find((b: any) => b.startTime && b.startTime !== "Não detalhado" && b.startTime !== "-");
          if (firstValidJob) {
            commonReceivedAt = parseDateStringToIso(firstValidJob.startTime);
          }

          const backupsToInsert = (parsedGemini.backups || []).map((entry: any, index: number) => {
            const cName = entry.clientName || "Servidor Desconhecido";
            const pName = entry.policyName || "Backup Geral";
            const jSize = entry.jobSize || "0.00 MB";
            const sCode = entry.statusCode || (entry.status === "success" ? "Successfully" : "Failed");
            const statusVal = entry.status || "success";
            
            return {
              id: (Date.now() + index + Math.floor(Math.random() * 1000)).toString(),
              clientName: cName,
              policyName: pName,
              startTime: entry.startTime || "Não detalhado",
              endTime: entry.endTime || "Não detalhado",
              duration: entry.duration || "Não detalhado",
              policyType: entry.policyType || "-",
              scheduleType: entry.scheduleType || "-",
              fileCount: entry.fileCount || "-",
              jobSize: jSize,
              statusCode: sCode,
              status: statusVal,
              receivedAt: commonReceivedAt,
              subject: `Relatório PDF: ${fileName}`,
              errorDetails: entry.errorDetails || null,
              parsedWithAI: true,
              serverName: cName,
              systemType: "Veritas NetBackup",
              size: jSize,
              uploadFileId: fileId
            };
          });
          
          if (backupsToInsert.length > 0) {
            const backups = loadBackups();
            backups.unshift(...backupsToInsert);
            saveBackups(backups);
            backupsExtracted = backupsToInsert.length;
            backupIds = backupsToInsert.map((b: any) => b.id);
          }
        } catch (geminiPdfErr) {
          console.error("Gemini PDF parsing failed, utilizing local fallback engine:", geminiPdfErr);
          const pdfData = await pdf(fileBuffer);
          const result = await parseAndSaveEmailContent(`Relatório PDF: ${fileName}`, pdfData.text || "", fileId);
          backupsExtracted = result.newBackups.length;
          backupIds = result.newBackups.map((b: any) => b.id);
        }
      } else {
        const pdfData = await pdf(fileBuffer);
        const result = await parseAndSaveEmailContent(`Relatório PDF: ${fileName}`, pdfData.text || "", fileId);
        backupsExtracted = result.newBackups.length;
        backupIds = result.newBackups.map((b: any) => b.id);
      }
    } else if (fileExt === "msg" || fileName.endsWith(".msg")) {
      // Check if this is a real binary Outlook MSG file (OLE container starts with D0 CF 11 E0)
      const isBinaryMsg = fileBuffer.length >= 4 && 
                          fileBuffer[0] === 0xD0 && 
                          fileBuffer[1] === 0xCF && 
                          fileBuffer[2] === 0x11 && 
                          fileBuffer[3] === 0xE0;
      
      if (isBinaryMsg) {
        const msgReader = new MsgReader(fileBuffer);
        const fileData = msgReader.getFileData();
        const sub = fileData.subject || `Relatório MSG: ${fileName}`;
        const bod = fileData.body || fileData.html || "";
        
        let receivedAt: string | null = null;
        if (fileData.headers) {
          const dateMatch = fileData.headers.match(/^Date:\s*([^\r\n]+)/im);
          if (dateMatch && dateMatch[1]) {
            try { receivedAt = new Date(dateMatch[1]).toISOString(); } catch (e) {}
          }
        }
        if (!receivedAt) {
          const rawDate = fileData.clientSubmitTime || fileData.messageDeliveryTime || fileData.creationTime;
          if (rawDate) {
            try { receivedAt = new Date(rawDate).toISOString(); } catch (e) {}
          }
        }
        
        const result = await parseAndSaveEmailContent(sub, bod, fileId, receivedAt);
        backupsExtracted = result.newBackups.length;
        backupIds = result.newBackups.map((b: any) => b.id);
      } else {
        // It's probably a text-based email format (MIME/EML or TXT) renamed to .msg!
        // Let's try parsing it as EML first.
        try {
          const parsedEml = await simpleParser(fileBuffer);
          const sub = parsedEml.subject || `Relatório EML/MSG: ${fileName}`;
          const bod = parsedEml.text || parsedEml.textAsHtml || parsedEml.html || "";
          let receivedAt = parsedEml.date ? new Date(parsedEml.date).toISOString() : null;
          if (!receivedAt) {
            receivedAt = extractForwardedDate(fileBuffer.toString("utf-8"));
          }
          
          const result = await parseAndSaveEmailContent(sub, bod as string, fileId, receivedAt);
          backupsExtracted = result.newBackups.length;
          backupIds = result.newBackups.map((b: any) => b.id);
        } catch (emlErr) {
          // If EML parsing fails, parse as plain text
          console.error("Failed to parse non-binary MSG as EML, falling back to TXT:", emlErr);
          const text = fileBuffer.toString("utf-8");
          const receivedAt = extractForwardedDate(text);
          const result = await parseAndSaveEmailContent(`Relatório MSG TXT: ${fileName}`, text, fileId, receivedAt);
          backupsExtracted = result.newBackups.length;
          backupIds = result.newBackups.map((b: any) => b.id);
        }
      }
    } else if (fileExt === "eml" || fileName.endsWith(".eml")) {
      const parsedEml = await simpleParser(fileBuffer);
      const sub = parsedEml.subject || `Relatório EML: ${fileName}`;
      const bod = parsedEml.text || parsedEml.textAsHtml || parsedEml.html || "";
      let receivedAt = parsedEml.date ? new Date(parsedEml.date).toISOString() : null;
      if (!receivedAt) {
        receivedAt = extractForwardedDate(fileBuffer.toString("utf-8"));
      }
      
      const result = await parseAndSaveEmailContent(sub, bod as string, fileId, receivedAt);
      backupsExtracted = result.newBackups.length;
      backupIds = result.newBackups.map((b: any) => b.id);
    } else {
      // Plain text files
      const text = fileBuffer.toString("utf-8");
      
      let txtSubject = `Relatório TXT: ${fileName}`;
      const receivedAt = extractForwardedDate(text);
      
      // Look for Subject and Date headers in the first 30 lines of the TXT file
      const lines = text.split(/\r?\n/).slice(0, 30);
      for (const line of lines) {
        const subjectMatch = line.match(/^\s*Subject:\s*([^\r\n]+)/i);
        if (subjectMatch && subjectMatch[1]) {
          txtSubject = subjectMatch[1].trim();
        }
      }
      
      const result = await parseAndSaveEmailContent(txtSubject, text, fileId, receivedAt);
      backupsExtracted = result.newBackups.length;
      backupIds = result.newBackups.map((b: any) => b.id);
    }
    
    // Save metadata entry to uploads.json, using the extracted received date of the backup jobs
    let fileReceivedAt = new Date().toISOString();
    if (backupIds.length > 0) {
      const backups = loadBackups();
      const firstJob = backups.find((b: any) => backupIds.includes(b.id));
      if (firstJob && firstJob.receivedAt) {
        fileReceivedAt = firstJob.receivedAt;
      }
    }

    const uploads = loadUploads();
    const uploadEntry = {
      id: fileId,
      fileName: fileName,
      fileSize: fileBuffer.length,
      fileType: fileName.endsWith(".pdf") ? "pdf" : (fileName.endsWith(".msg") ? "msg" : (fileName.endsWith(".eml") ? "eml" : "txt")),
      uploadedAt: fileReceivedAt,
      backupsExtracted: backupsExtracted,
      backupIds: backupIds
    };
    uploads.unshift(uploadEntry);
    saveUploads(uploads);
    
    res.status(201).json({
      success: true,
      file: uploadEntry,
      jobsExtracted: backupsExtracted
    });
  } catch (err: any) {
    console.error("Erro no processamento do arquivo:", err);
    res.status(500).json({ error: "Erro interno ao processar o upload do arquivo: " + err.message });
  }
});

// ================= VITE OR PRODUCTION BUILD MIDDLEWARE =================

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Backup Manager API] Server running on http://localhost:${PORT}`);
  });
}

startServer();
