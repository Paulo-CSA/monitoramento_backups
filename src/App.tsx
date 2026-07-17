import React, { useEffect, useState } from "react";
import { 
  Server, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Mail, 
  Search, 
  Filter, 
  ArrowRight, 
  Trash2, 
  RefreshCw, 
  AlertTriangle, 
  Activity, 
  FileText, 
  Send, 
  Database, 
  Copy, 
  Plus, 
  ChevronDown, 
  ChevronUp, 
  Sparkles, 
  Cpu, 
  HelpCircle, 
  Check,
  ShieldCheck,
  BarChart3,
  Terminal,
  ExternalLink,
  Upload,
  Download,
  FileUp,
  FileCheck
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { BackupRecord, EmailTemplate, UploadedFile } from "./types";

export default function App() {
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [uploads, setUploads] = useState<UploadedFile[]>([]);
  
  // Filtering and searching
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "success" | "failure" | "pending">("all");
  const [dateFilter, setDateFilter] = useState<string>("all");

  // Email forward simulator form
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [subjectInput, setSubjectInput] = useState("");
  const [bodyInput, setBodyInput] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [parseResult, setParseResult] = useState<BackupRecord | null>(null);

  // File uploading states
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Manual Backup Form state
  const [isAddingManual, setIsAddingManual] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualStatus, setManualStatus] = useState<"success" | "failure" | "pending">("success");
  const [manualSize, setManualSize] = useState("");
  const [manualDuration, setManualDuration] = useState("");
  const [manualSystem, setManualSystem] = useState("Veritas NetBackup");
  const [manualError, setManualError] = useState("");

  // Accordion and UX state
  const [expandedBackupId, setExpandedBackupId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [isDemoReset, setIsDemoReset] = useState(false);
  const [integrationMethod, setIntegrationMethod] = useState<"imap" | "powershell" | "bash" | "python" | "powerautomate">("imap");

  // IMAP Check State
  const [isCheckingImap, setIsCheckingImap] = useState(false);
  const [imapResult, setImapResult] = useState<any | null>(null);
  const [showImapResultModal, setShowImapResultModal] = useState(false);

  // Load initial uploads
  const loadUploads = async () => {
    try {
      const res = await fetch("/api/uploads");
      const data = await res.json();
      setUploads(data);
    } catch (err) {
      console.error("Erro ao carregar uploads:", err);
    }
  };

  // Upload file logic supporting base64 conversion
  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    setUploadError(null);
    
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const rawResult = e.target?.result as string;
          if (!rawResult) {
            setUploadError("Não foi possível ler o arquivo.");
            setIsUploading(false);
            return;
          }
          const base64Data = rawResult.split(",")[1];
          
          const res = await fetch("/api/uploads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileName: file.name,
              base64Data,
              fileType: file.name.split(".").pop()?.toLowerCase()
            })
          });
          
          const data = await res.json();
          if (res.ok && data.success) {
            await loadData(true);
            await loadUploads();
            
            // Show custom visual success feedback
            if (data.file) {
              setParseResult({
                id: data.file.id,
                serverName: file.name,
                status: data.jobsExtracted > 0 ? "success" : "pending",
                size: `${(data.file.fileSize / 1024).toFixed(1)} KB`,
                duration: "-",
                systemType: "Relatório de Upload",
                receivedAt: new Date().toISOString(),
                subject: `Importado: ${file.name}`,
                errorDetails: data.jobsExtracted === 0 ? "Nenhum job de backup extraído do arquivo. Certifique-se de que o arquivo contém o formato esperado de log Veritas." : null,
                parsedWithAI: true,
                count: data.jobsExtracted,
                list: []
              } as any);
            }
          } else {
            setUploadError(data.error || "Erro de processamento do arquivo de backups.");
          }
        } catch (uploadFetchErr: any) {
          setUploadError("Erro de comunicação com o servidor: " + uploadFetchErr.message);
        } finally {
          setIsUploading(false);
        }
      };
      reader.onerror = () => {
        setUploadError("Falha na leitura física do arquivo local.");
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setUploadError("Erro no processamento do upload: " + err.message);
      setIsUploading(false);
    }
  };

  // Delete an upload log and its associated backups
  const handleDeleteUpload = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Atenção! Isso excluirá este arquivo permanentemente do servidor e removerá todos os registros de backup que foram extraídos dele. Deseja prosseguir?")) {
      return;
    }
    
    try {
      const res = await fetch(`/api/uploads/${id}`, {
        method: "DELETE"
      });
      if (res.ok) {
        await loadData(true);
        await loadUploads();
      } else {
        const errData = await res.json();
        alert(errData.error || "Falha ao remover arquivo.");
      }
    } catch (err: any) {
      console.error("Erro ao excluir arquivo:", err);
      alert("Erro ao excluir arquivo: " + err.message);
    }
  };

  // Reset all uploaded files and restore default simulator mock backups
  const handleResetUploads = async () => {
    if (!window.confirm("Deseja realmente limpar todos os uploads do servidor? Isso restaurará o banco de dados para os dados iniciais padrão.")) {
      return;
    }
    try {
      const res = await fetch("/api/uploads/reset", {
        method: "POST"
      });
      if (res.ok) {
        await loadData(true);
        await loadUploads();
        alert("Uploads redefinidos com sucesso!");
      }
    } catch (err: any) {
      console.error("Erro ao redefinir uploads:", err);
      alert("Erro ao redefinir: " + err.message);
    }
  };

  // Load initial data
  const loadData = async (quiet = false) => {
    if (!quiet) setIsRefreshing(true);
    try {
      const bRes = await fetch("/api/backups");
      const bData = await bRes.json();
      setBackups(bData);

      const tRes = await fetch("/api/emails/templates");
      const tData = await tRes.json();
      setTemplates(tData);
    } catch (err) {
      console.error("Erro ao carregar dados da API:", err);
    } finally {
      if (!quiet) setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    loadUploads();
  }, []);

  // Handle template selection
  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (!templateId) {
      setSubjectInput("");
      setBodyInput("");
      return;
    }
    const selected = templates.find((t) => t.id === templateId);
    if (selected) {
      setSubjectInput(selected.subject);
      setBodyInput(selected.body);
    }
  };

  // Submit simulated email for parsing
  const handleForwardEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectInput.trim() || !bodyInput.trim()) return;

    setIsParsing(true);
    setParseResult(null);

    try {
      const res = await fetch("/api/emails/forward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subjectInput,
          body: bodyInput
        })
      });

      if (res.ok) {
        const data = await res.json();
        setParseResult(data.backup);
        // Refresh backups list
        loadData(true);
        // Clean fields
        setSelectedTemplateId("");
        setSubjectInput("");
        setBodyInput("");
        // Highlight first item
        setExpandedBackupId(data.backup.id);
      } else {
        alert("Erro no processamento do e-mail de backup.");
      }
    } catch (error) {
      console.error("Erro de rede:", error);
    } finally {
      setIsParsing(false);
    }
  };

  // Add backup manually
  const handleAddManualBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualName.trim()) return;

    try {
      const res = await fetch("/api/backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serverName: manualName,
          status: manualStatus,
          size: manualSize || null,
          duration: manualDuration || null,
          systemType: manualSystem,
          errorDetails: manualStatus === "failure" ? manualError : null,
          subject: `Backup manual: ${manualName} (${manualSystem})`
        })
      });

      if (res.ok) {
        setIsAddingManual(false);
        // Clear inputs
        setManualName("");
        setManualSize("");
        setManualDuration("");
        setManualError("");
        // Reload list
        loadData(true);
      }
    } catch (error) {
      console.error("Erro ao cadastrar manualmente:", error);
    }
  };

  // Delete a backup
  const handleDeleteBackup = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Deseja realmente excluir este registro de backup do histórico?")) return;

    try {
      const res = await fetch(`/api/backups/${id}`, { method: "DELETE" });
      if (res.ok) {
        setBackups(prev => prev.filter(b => b.id !== id));
        if (expandedBackupId === id) setExpandedBackupId(null);
      }
    } catch (error) {
      console.error("Erro ao deletar:", error);
    }
  };

  // Update backup state (Resolve failure manually or Complete pending)
  const handleUpdateStatus = async (id: string, newStatus: "success" | "failure" | "pending", e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/backups/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          errorDetails: newStatus === "success" ? null : "Resolvido manualmente pelo administrador."
        })
      });

      if (res.ok) {
        loadData(true);
      }
    } catch (error) {
      console.error("Erro ao atualizar status:", error);
    }
  };

  // Reset to default seed data
  const handleResetDemo = async () => {
    if (!confirm("Isso redefinirá o painel para os dados de demonstração originais. Continuar?")) return;
    setIsDemoReset(true);
    try {
      const res = await fetch("/api/backups/reset", { method: "POST" });
      if (res.ok) {
        loadData(false);
      }
    } catch (error) {
      console.error("Erro ao resetar demo:", error);
    } finally {
      setIsDemoReset(false);
    }
  };

  // Copy curl code to clipboard
  const copyCurlToClipboard = () => {
    const curlCommand = `curl -X POST ${window.location.origin}/api/emails/forward \\
  -H "Content-Type: application/json" \\
  -d '{
    "subject": "Veeam: VM-DB-PROD-DAILY - Success",
    "body": "Job finished successfully on server node-01. Total transfer: 18.5 GB. Execution duration: 18m."
  }'`;
    navigator.clipboard.writeText(curlCommand);
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 3000);
  };

  // Filter out any backups that are not Veritas NetBackup to ensure all metrics/views use only Veritas NetBackup logs
  const veritasBackups = backups.filter((b) => (b.systemType || "").toLowerCase().includes("veritas") || (b.policyName || "").toLowerCase().includes("inema"));

  // Calculate stats
  const totalCount = veritasBackups.length;
  const successCount = veritasBackups.filter((b) => b.status === "success").length;
  const failureCount = veritasBackups.filter((b) => b.status === "failure").length;
  const pendingCount = veritasBackups.filter((b) => b.status === "pending").length;
  
  const successRate = totalCount > 0 ? Math.round((successCount / totalCount) * 100) : 100;

  // Extract all unique dates for filters (YYYY-MM-DD)
  const uniqueDates: string[] = Array.from(new Set(veritasBackups.map((b) => b.receivedAt ? b.receivedAt.substring(0, 10) : ""))).filter(Boolean).sort().reverse() as string[];

  // Filtered Backups
  const filteredBackups = veritasBackups.filter((b) => {
    const cName = (b.clientName || b.serverName || "").toLowerCase();
    const pName = (b.policyName || b.systemType || "Backup Geral").toLowerCase();
    const sub = (b.subject || "").toLowerCase();
    const query = searchQuery.toLowerCase();

    const matchesSearch = 
      cName.includes(query) ||
      pName.includes(query) ||
      sub.includes(query);
    
    const matchesStatus = statusFilter === "all" || b.status === statusFilter;
    
    const bDate = b.receivedAt ? b.receivedAt.substring(0, 10) : "";
    const matchesDate = dateFilter === "all" || bDate === dateFilter;

    return matchesSearch && matchesStatus && matchesDate;
  });

  // Calculate volume per technology (in GBs, roughly approximated for visual rendering)
  const systemVolumes = veritasBackups.reduce((acc: Record<string, number>, b) => {
    const sizeStr = b.jobSize || b.size;
    if (!sizeStr || b.status !== "success") return acc;
    // Parse size string (e.g. "45.2 GB" -> 45.2, "1.2 TB" -> 1200, "850 MB" -> 0.85)
    const val = parseFloat(sizeStr);
    if (isNaN(val)) return acc;
    
    let gbVal = val;
    const lowerSize = sizeStr.toLowerCase();
    if (lowerSize.includes("tb") || lowerSize.includes("t")) {
      gbVal = val * 1024;
    } else if (lowerSize.includes("mb") || lowerSize.includes("m")) {
      gbVal = val / 1024;
    } else if (lowerSize.includes("kb") || lowerSize.includes("k")) {
      gbVal = val / (1024 * 1024);
    }
    
    const sysName = b.policyName || b.systemType || "Backup Geral";
    acc[sysName] = (acc[sysName] || 0) + gbVal;
    return acc;
  }, {} as Record<string, number>);

  // Convert size stats for formatted display
  const totalVolumeGB = (Object.values(systemVolumes) as number[]).reduce((a, b) => a + b, 0);
  const formattedTotalVolume = totalVolumeGB >= 1000 
    ? `${(totalVolumeGB / 1024).toFixed(2)} TB` 
    : `${totalVolumeGB.toFixed(1)} GB`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans antialiased pb-16 selection:bg-indigo-500 selection:text-slate-950">
      
      {/* HEADER BAR */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50 px-6 py-4">
        <div className="max-w-[1440px] mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25">
              <Database className="h-5 w-5" id="header-logo-icon" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white">BackupSense <span className="text-slate-500 font-medium text-xs">v2.4</span></h1>
              </div>
              <p className="text-xs text-slate-400">Análise inteligente de relatórios e monitoramento de integridade corporativa</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Engine Status indicator */}
            <div className="flex items-center gap-2 bg-slate-900/60 px-3 py-1.5 rounded-full border border-slate-800 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-slate-500">INGEST:</span>
              <span className="text-indigo-400 font-semibold flex items-center gap-1">
                <Sparkles className="h-3 w-3 animate-pulse" /> Active Parser
              </span>
            </div>

            {/* Actions pill layout */}
            <div className="flex flex-wrap items-center gap-2 bg-slate-900/50 p-1.5 sm:p-1 rounded-2xl sm:rounded-full border border-slate-800">
              <button
                onClick={() => {
                  loadData();
                  loadUploads();
                }}
                disabled={isRefreshing}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-550 disabled:bg-indigo-950/80 text-xs font-semibold text-white rounded-full shadow transition flex items-center justify-center gap-1.5 cursor-pointer"
                title="Sincronizar dados"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                <span>Atualizar</span>
              </button>

              <button
                onClick={handleResetDemo}
                disabled={isDemoReset}
                className="px-4 py-1.5 text-xs font-medium text-slate-400 hover:text-rose-400 rounded-full transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Resetar banco de dados para os registros demo"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Resetar Demo</span>
              </button>
            </div>
          </div>
          
        </div>
      </header>

      <main className="max-w-[1440px] mx-auto px-6 mt-8 flex flex-col gap-6 w-full">
        
        {/* TOP ROW: VISUALIZATIONS, METRICS, INGESTION & ARCHIVE */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-6 items-stretch w-full">
          
          {/* VISUAL CHART: DONUT RADIAL DISTRIB (ENRICHED & ENLARGED) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 lg:col-span-4 flex flex-col justify-between h-full order-1 lg:order-1 min-h-[350px]">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Activity className="h-4 w-4 text-indigo-400" />
                Estado dos Backups
              </h3>
              <span className="text-[10px] text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full font-mono">
                Cluster Veritas
              </span>
            </div>
            
            <div className="flex flex-col items-center justify-center gap-4 py-4 w-full">
              {/* SVG Ring Graph - Enlarged & Enhanced */}
              <div className="relative flex items-center justify-center group">
                <svg className="w-40 h-40 transform -rotate-90">
                  {/* Background Circle */}
                  <circle
                    cx="80"
                    cy="80"
                    r="68"
                    className="stroke-slate-850"
                    strokeWidth="11"
                    fill="transparent"
                  />
                  {/* Success ring segment with drop shadow effect */}
                  {totalCount > 0 && (
                    <circle
                      cx="80"
                      cy="80"
                      r="68"
                      className="stroke-indigo-500 transition-all duration-1000"
                      strokeWidth="11"
                      fill="transparent"
                      strokeDasharray={`${2 * Math.PI * 68}`}
                      strokeDashoffset={`${2 * Math.PI * 68 * (1 - successCount / totalCount)}`}
                      strokeLinecap="round"
                    />
                  )}
                </svg>
                {/* Text in the middle - Beautiful, enlarged & high contrast */}
                <div className="absolute flex flex-col items-center justify-center">
                  <span className="text-4xl font-black text-white font-mono tracking-tighter flex items-baseline">
                    {successRate}<span className="text-xl font-bold text-indigo-400">%</span>
                  </span>
                  <span className="text-[9px] text-emerald-400 font-extrabold uppercase tracking-widest mt-1">Sucesso</span>
                </div>
              </div>

              {/* Legends with detailed colored badges */}
              <div className="flex flex-wrap items-center justify-center gap-2.5 w-full border-t border-slate-800/60 pt-3 text-[10px]">
                <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/15 px-2.5 py-0.5 rounded-full text-emerald-400">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span className="font-mono font-bold">{successCount} OK</span>
                </div>
                <div className="flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/15 px-2.5 py-0.5 rounded-full text-rose-400">
                  <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  <span className="font-mono font-bold">{failureCount} Erros</span>
                </div>
                <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/15 px-2.5 py-0.5 rounded-full text-amber-400">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  <span className="font-mono font-bold">{pendingCount} Pend.</span>
                </div>
              </div>
            </div>

            {/* Enriched Cluster Information Grid - No empty space! */}
            <div className="grid grid-cols-2 gap-2.5 border-t border-slate-800/80 pt-3 text-[10px] font-mono">
              <div className="bg-slate-950/40 border border-slate-850 p-2 rounded-xl flex items-center gap-2">
                <Database className="h-4 w-4 text-indigo-400 shrink-0" />
                <div className="min-w-0">
                  <span className="text-slate-500 block text-[8px] uppercase tracking-wider font-bold">Volume Total</span>
                  <span className="text-white font-bold block truncate">{formattedTotalVolume}</span>
                </div>
              </div>
              <div className="bg-slate-950/40 border border-slate-850 p-2 rounded-xl flex items-center gap-2">
                <Server className="h-4 w-4 text-indigo-400 shrink-0" />
                <div className="min-w-0">
                  <span className="text-slate-500 block text-[8px] uppercase tracking-wider font-bold">Total Jobs</span>
                  <span className="text-white font-bold block truncate">{totalCount} Mapeados</span>
                </div>
              </div>
            </div>
          </div>

          {/* KPI METRIC CARDS GRID (Symmetric & responsive) */}
          <div className="lg:col-span-4 grid grid-cols-2 gap-3.5 order-2 lg:order-2 h-full">
            
            {/* Total Active Backups Card */}
            <div 
              onClick={() => setStatusFilter("all")}
              className={`p-4 rounded-2xl border transition cursor-pointer flex flex-col justify-between ${statusFilter === "all" ? "bg-slate-800 border-indigo-500/50" : "bg-slate-900 border-slate-800 hover:border-slate-700"}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sistemas Ativos</span>
                <div className="w-7 h-7 rounded-full bg-slate-850 flex items-center justify-center">
                  <Server className="h-4 w-4 text-slate-300" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline gap-1.5">
                <span className="text-2xl font-extrabold text-white font-mono">{totalCount}</span>
                <span className="text-[10px] text-slate-500 font-medium">monitorados</span>
              </div>
            </div>

            {/* Success Card with Bento Mini Bar Chart */}
            <div 
              onClick={() => setStatusFilter("success")}
              className={`p-4 rounded-2xl border transition cursor-pointer flex flex-col justify-between ${statusFilter === "success" ? "bg-slate-800 border-emerald-500/50" : "bg-slate-900 border-slate-800 hover:border-slate-700"}`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Sucesso Geral</span>
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-2xl font-extrabold text-white font-mono">{successRate}%</span>
                </div>
              </div>
              
              {/* Mini visual bar-chart representing success rate / progress */}
              <div className="flex items-end gap-1 h-5 mt-2">
                <div className="flex-1 bg-indigo-500/10 h-1.5 rounded-sm"></div>
                <div className="flex-1 bg-indigo-500/15 h-3 rounded-sm"></div>
                <div className="flex-1 bg-indigo-500/20 h-2 rounded-sm"></div>
                <div className="flex-1 bg-indigo-500/30 h-4 rounded-sm"></div>
                <div className={`flex-1 rounded-sm shadow-[0_0_8px_rgba(99,102,241,0.3)] transition-all ${successRate > 90 ? 'bg-indigo-500 h-4.5' : 'bg-indigo-500/60 h-3'}`}></div>
                <div className={`flex-1 rounded-sm shadow-[0_0_8px_rgba(99,102,241,0.3)] transition-all ${successRate > 80 ? 'bg-indigo-500 h-4' : 'bg-indigo-500/60 h-2.5'}`}></div>
              </div>
            </div>

            {/* Failure Card */}
            <div 
              onClick={() => setStatusFilter("failure")}
              className={`p-4 rounded-2xl border transition cursor-pointer hover:bg-rose-500/15 ${statusFilter === "failure" ? "bg-rose-950/40 border-rose-500/50" : "bg-rose-500/10 border-rose-500/20"}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-rose-500 tracking-wider">Falhas Críticas</span>
                <div className="w-7 h-7 rounded-full bg-rose-500/20 flex items-center justify-center">
                  <XCircle className="h-4 w-4 text-rose-500" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-2xl font-extrabold text-white font-mono">{failureCount}</span>
                {failureCount > 0 && (
                  <span className="text-[8px] uppercase font-extrabold tracking-wider text-rose-400 bg-rose-500/15 border border-rose-500/25 px-1.5 py-0.5 rounded animate-pulse">Ação</span>
                )}
              </div>
            </div>

            {/* Pending Card */}
            <div 
              onClick={() => setStatusFilter("pending")}
              className={`p-4 rounded-2xl border transition cursor-pointer hover:bg-amber-500/15 ${statusFilter === "pending" ? "bg-amber-950/40 border-amber-500/50" : "bg-amber-500/10 border-amber-500/20"}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-amber-500 tracking-wider">Pendentes</span>
                <div className="w-7 h-7 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <Clock className="h-4 w-4 text-amber-500 animate-spin-slow" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-2xl font-extrabold text-white font-mono">{pendingCount}</span>
              </div>
            </div>

          </div>

          {/* COMBINED CARD: ARQUIVOS & IMPORTAÇÃO DE LOGS (DRAG & DROP + LIST LOGS) */}
          <div 
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) handleFileUpload(file);
            }}
            className={`bg-slate-900 border rounded-2xl p-4 flex flex-col justify-between h-full order-3 lg:order-3 lg:col-span-4 min-h-[350px] transition duration-200 relative ${
              isDragging ? "border-indigo-500 bg-indigo-500/5 ring-2 ring-indigo-500/20" : "border-slate-800"
            }`}
          >
            {/* Drag and Drop visual overlay state */}
            {isDragging && (
              <div className="absolute inset-0 bg-indigo-950/80 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center gap-3 z-10 p-4 border-2 border-dashed border-indigo-500 m-1">
                <Upload className="h-8 w-8 text-indigo-400 animate-bounce" />
                <p className="text-xs font-bold text-white">Solte o arquivo para carregar!</p>
                <p className="text-[10px] text-slate-400">Formatos aceitos: .msg, .eml, .pdf, .txt</p>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-1.5">
                  <Database className="h-4 w-4 text-indigo-400" />
                  <h3 className="text-sm font-semibold text-white">Arquivos de Logs</h3>
                </div>
                {uploads.length > 0 && (
                  <button
                    onClick={handleResetUploads}
                    className="p-1.5 text-rose-400 hover:text-white hover:bg-rose-950/45 rounded transition cursor-pointer"
                    title="Limpar todos os uploads"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              
              <p className="text-[10px] text-slate-400 leading-normal mb-3">
                Histórico de importações integradas e sincronizadas com IA.
              </p>

              {/* ACTION: Prominent upload button inside the card */}
              <button
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = ".msg,.eml,.pdf,.txt,text/plain,application/pdf";
                  input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) handleFileUpload(file);
                  };
                  input.click();
                }}
                disabled={isUploading}
                className="w-full mb-3 py-2 px-3 bg-indigo-600 hover:bg-indigo-550 disabled:bg-indigo-950/80 text-white font-semibold text-[11px] rounded-xl flex items-center justify-center gap-2 transition shadow-md shadow-indigo-600/15 cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
              >
                {isUploading ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-white" />
                    <span>Lendo com IA Veritas...</span>
                  </>
                ) : (
                  <>
                    <FileUp className="h-3.5 w-3.5 text-indigo-200" />
                    <span>Importar Relatório Veritas</span>
                  </>
                )}
              </button>

              {/* Error Display inside the card */}
              {uploadError && (
                <div className="mb-2.5 p-2 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] rounded-xl flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <p className="leading-tight">{uploadError}</p>
                </div>
              )}

              {/* Parsing success message */}
              <AnimatePresence>
                {parseResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="mb-2.5 p-2.5 rounded-xl border bg-slate-950 border-indigo-500/35 text-[10px] space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-indigo-400 flex items-center gap-0.5">
                        <Sparkles className="h-3 w-3 text-indigo-400 animate-pulse" /> IA: Sucesso!
                      </span>
                      <button 
                        onClick={() => setParseResult(null)} 
                        className="text-slate-400 hover:text-slate-200 text-xs font-bold"
                      >
                        ×
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-1 font-mono border-t border-slate-800/80 pt-1 text-[9px]">
                      <div>
                        <span className="text-slate-500 block text-[8px]">SISTEMA:</span>
                        <span className="text-slate-200 font-semibold block truncate" title={parseResult.serverName}>{parseResult.serverName}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[8px]">STATUS:</span>
                        <span className={`font-bold block ${
                          parseResult.status === "success" ? "text-emerald-400" :
                          parseResult.status === "failure" ? "text-rose-400" : "text-amber-400"
                        }`}>{parseResult.status.toUpperCase()}</span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* List of Files - Elegant, compact & scrollable */}
              <div className="space-y-1.5 max-h-[145px] overflow-y-auto pr-1 custom-scrollbar">
                {uploads.length === 0 ? (
                  <div className="text-center py-7 bg-slate-950/40 rounded-xl border border-dashed border-slate-800/80 p-3">
                    <FileText className="h-6 w-6 text-slate-700 mx-auto stroke-[1.5]" />
                    <p className="text-[10px] text-slate-400 font-medium mt-1">Nenhum log enviado</p>
                    <p className="text-[9px] text-slate-600 mt-0.5">Arraste ou clique em Importar acima</p>
                  </div>
                ) : (
                  uploads.map((file) => {
                    const sizeInKB = (file.fileSize / 1024).toFixed(1);
                    return (
                      <div
                        key={file.id}
                        className="bg-slate-950/60 hover:bg-slate-950 border border-slate-850 hover:border-slate-800 rounded-xl p-2 transition group flex flex-col gap-1"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <FileText className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                          <span className="text-[11px] font-mono font-medium text-slate-200 truncate select-all flex-1" title={file.fileName}>
                            {file.fileName}
                          </span>
                          <span className="text-[9px] text-slate-500 font-mono shrink-0">
                            {sizeInKB} KB
                          </span>
                        </div>
                        <div className="flex items-center justify-between border-t border-slate-900/60 pt-1 mt-0.5">
                          <span className="text-[9px] font-semibold font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.2 rounded-full">
                            {file.backupsExtracted} {file.backupsExtracted === 1 ? "Job" : "Jobs"}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <a
                              href={`/api/uploads/download/${file.id}`}
                              className="w-5.5 h-5.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 flex items-center justify-center transition"
                              title="Baixar arquivo original"
                            >
                              <Download className="h-2.5 w-2.5" />
                            </a>
                            <button
                              onClick={(e) => handleDeleteUpload(file.id, e)}
                              className="w-5.5 h-5.5 rounded bg-slate-900 hover:bg-rose-950/30 text-slate-400 hover:text-rose-400 border border-slate-800 flex items-center justify-center transition cursor-pointer"
                              title="Excluir arquivo"
                            >
                              <Trash2 className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 text-[9px] text-slate-500 border-t border-slate-800/80 pt-1.5 mt-2">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <span className="truncate">Banco encriptado e seguro contra violações.</span>
            </div>
          </div>

        </div>

        {/* BOTTOM SECTION: MAIN LOGS & LIVE LIST */}
        <section className="flex flex-col gap-6 w-full">

          {/* SEARCH, FILTERS & REGISTER ACTION ROW */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 flex flex-col gap-4">
            
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <FileText className="h-4.5 w-4.5 text-indigo-400" />
                Histórico de Logs de Backup
              </h2>

              <button
                onClick={() => setIsAddingManual(!isAddingManual)}
                className="w-full sm:w-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-500 hover:shadow-lg hover:shadow-indigo-500/10 border border-indigo-700 hover:border-indigo-600 transition rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 text-white shadow-sm"
              >
                <Plus className="h-3.5 w-3.5 text-white" />
                <span>Registrar Manualmente</span>
              </button>
            </div>

            {/* Manual Form (Expandable) */}
            <AnimatePresence>
              {isAddingManual && (
                <motion.form
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  onSubmit={handleAddManualBackup}
                  className="overflow-hidden border-b border-slate-800/60 pb-4 space-y-3"
                >
                  <div className="p-5 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
                    <h4 className="text-xs font-semibold text-white uppercase tracking-wider font-mono">Registrar Status de Backup Manual</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-medium text-slate-300 block mb-1">Nome do Servidor / BD:</label>
                        <input
                          type="text"
                          required
                          value={manualName}
                          onChange={(e) => setManualName(e.target.value)}
                          placeholder="Ex: Oracle CRM Principal"
                          className="w-full text-xs bg-slate-950 text-slate-200 border border-slate-800 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-medium text-slate-300 block mb-1">Status:</label>
                        <select
                          value={manualStatus}
                          onChange={(e) => setManualStatus(e.target.value as any)}
                          className="w-full text-xs bg-slate-950 text-slate-200 border border-slate-800 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 cursor-pointer"
                        >
                          <option value="success">Sucesso</option>
                          <option value="failure">Falha / Erro</option>
                          <option value="pending">Pendente / Em Progresso</option>
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] font-medium text-slate-300 block mb-1">Tamanho:</label>
                          <input
                            type="text"
                            placeholder="Ex: 12.5 GB"
                            value={manualSize}
                            onChange={(e) => setManualSize(e.target.value)}
                            className="w-full text-xs bg-slate-950 text-slate-200 border border-slate-800 rounded-lg p-2.5 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-medium text-slate-300 block mb-1">Duração:</label>
                          <input
                            type="text"
                            placeholder="Ex: 45m"
                            value={manualDuration}
                            onChange={(e) => setManualDuration(e.target.value)}
                            className="w-full text-xs bg-slate-950 text-slate-200 border border-slate-800 rounded-lg p-2.5 focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>

                    {manualStatus === "failure" && (
                      <div>
                        <label className="text-[11px] font-medium text-slate-300 block mb-1">Mensagem de Erro / Log:</label>
                        <textarea
                          rows={2}
                          required
                          value={manualError}
                          onChange={(e) => setManualError(e.target.value)}
                          placeholder="Cole aqui o log de erro..."
                          className="w-full text-xs bg-slate-950 text-slate-200 border border-slate-800 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 font-mono"
                        />
                      </div>
                    )}

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setIsAddingManual(false)}
                        className="px-4 py-2 bg-slate-900 hover:bg-slate-850 text-slate-400 rounded-xl text-xs font-medium"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-xs"
                      >
                        Salvar Backup
                      </button>
                    </div>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>

            {/* Live Search and Filter toggles */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2 border-t border-slate-800/65">
              
              {/* Search bar */}
              <div className="md:col-span-5 relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Pesquisar por servidor, tecnologia ou e-mail..."
                  className="w-full text-xs bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-9 pr-4 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/35"
                />
                <Search className="h-4 w-4 text-slate-500 absolute left-3 top-3" />
              </div>

              {/* Status Filter Dropdown */}
              <div className="md:col-span-4 flex items-center gap-2">
                <span className="text-xs text-slate-400 hidden sm:inline whitespace-nowrap">Estado:</span>
                <div className="relative w-full">
                  <select
                    value={statusFilter}
                    onChange={(e) => setSearchQuery("") || setStatusFilter(e.target.value as any)}
                    className="w-full text-xs bg-slate-950 border border-slate-800 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/35 cursor-pointer"
                  >
                    <option value="all">Todos os Estados ({totalCount})</option>
                    <option value="success">Sucesso ({successCount})</option>
                    <option value="failure">Falhas ({failureCount})</option>
                    <option value="pending">Pendentes ({pendingCount})</option>
                  </select>
                </div>
              </div>

              {/* Date selection filter */}
              <div className="md:col-span-3 flex items-center gap-2">
                <span className="text-xs text-slate-400 hidden sm:inline whitespace-nowrap">Data:</span>
                <div className="relative w-full">
                  <select
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="w-full text-xs bg-slate-950 border border-slate-800 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/35 cursor-pointer text-slate-300 font-mono"
                  >
                    <option value="all">Todas as Datas</option>
                    {uniqueDates.map((d) => {
                      const parts = d.split("-");
                      const formatted = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : d;
                      return (
                        <option key={d} value={d}>
                          {formatted}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

            </div>

          </div>

          {/* BACKUPS DATA GRID LIST */}
          <div className="flex flex-col gap-3">
            {filteredBackups.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800/80 rounded-3xl p-12 text-center space-y-2">
                <p className="text-slate-400 text-sm">Nenhum registro de backup corresponde aos filtros ativos.</p>
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setStatusFilter("all");
                    setDateFilter("all");
                  }}
                  className="text-xs text-indigo-400 hover:underline font-semibold"
                >
                  Limpar todos os filtros de busca
                </button>
              </div>
            ) : (
              <>
                {/* 1. DESKTOP ENTERPRISE TABLE VIEW */}
                <div className="hidden md:block overflow-x-auto rounded-3xl border border-slate-800/80 bg-slate-900/40 backdrop-blur-sm shadow-xl">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-950/70 text-slate-400 font-semibold select-none">
                        <th className="p-4 pl-6 font-mono tracking-wider uppercase text-[10px] text-slate-400">Client Name</th>
                        <th className="p-4 font-mono tracking-wider uppercase text-[10px] text-slate-400">Policy Name</th>
                        <th className="p-4 font-mono tracking-wider uppercase text-[10px] text-slate-400">Status Code</th>
                        <th className="p-4 font-mono tracking-wider uppercase text-[10px] text-slate-400">Job Size (MB)</th>
                        <th className="p-4 font-mono tracking-wider uppercase text-[10px] text-slate-400">Duration</th>
                        <th className="p-4 font-mono tracking-wider uppercase text-[10px] text-slate-400">Start Time</th>
                        <th className="p-4 font-mono tracking-wider uppercase text-[10px] text-slate-400">End Time</th>
                        <th className="p-4 font-mono tracking-wider uppercase text-[10px] text-slate-400">Policy Type</th>
                        <th className="p-4 font-mono tracking-wider uppercase text-[10px] text-slate-400">Schedule Type</th>
                        <th className="p-4 pr-6 font-mono tracking-wider uppercase text-[10px] text-slate-400">File Count</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40">
                      {filteredBackups.map((backup) => {
                        const isExpanded = expandedBackupId === backup.id;
                        const clientName = backup.clientName || backup.serverName || "-";
                        const policyName = backup.policyName || backup.systemType || "Backup Geral";
                        const startTime = backup.startTime || "Não detalhado";
                        const endTime = backup.endTime || "Não detalhado";
                        const duration = backup.duration || "-";
                        const policyType = backup.policyType || "-";
                        const scheduleType = backup.scheduleType || "-";
                        const fileCount = backup.fileCount || "0";
                        const jobSize = backup.jobSize || backup.size || "0.00 MB";
                        const statusCode = backup.statusCode || (backup.status === "success" ? "Successfully" : "Failed");

                        return (
                          <React.Fragment key={backup.id}>
                            <tr 
                              onClick={() => setExpandedBackupId(isExpanded ? null : backup.id)}
                              className={`hover:bg-slate-800/30 cursor-pointer transition ${isExpanded ? "bg-slate-950/70" : ""}`}
                            >
                              <td className="p-4 pl-6 font-semibold text-white">
                                <div className="flex items-center gap-2">
                                  <span>{clientName}</span>
                                  {backup.parsedWithAI && (
                                    <span className="text-[8px] font-mono bg-indigo-500/15 text-indigo-400 border border-indigo-500/20 px-1 py-0.2 rounded-full flex items-center">
                                      AI
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="p-4 text-slate-300 font-mono text-[11px] truncate max-w-[140px]" title={policyName}>{policyName}</td>
                              <td className="p-4">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono text-[10px] font-bold ${
                                  backup.status === "success" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                                  backup.status === "pending" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse" :
                                  "bg-rose-500/10 text-rose-400 border border-rose-500/20 animate-pulse"
                                }`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${
                                    backup.status === "success" ? "bg-emerald-500" :
                                    backup.status === "pending" ? "bg-amber-500" : "bg-rose-500"
                                  }`} />
                                  {statusCode}
                                </span>
                              </td>
                              <td className="p-4 text-indigo-300 font-mono font-medium">{jobSize}</td>
                              <td className="p-4 text-slate-300 font-mono text-[11px]">{duration}</td>
                              <td className="p-4 text-slate-400 text-[11px] font-mono whitespace-nowrap">{startTime}</td>
                              <td className="p-4 text-slate-400 text-[11px] font-mono whitespace-nowrap">{endTime}</td>
                              <td className="p-4 text-slate-400 font-mono text-[11px] truncate max-w-[100px]" title={policyType}>{policyType}</td>
                              <td className="p-4 text-slate-400 font-mono text-[11px] truncate max-w-[100px]" title={scheduleType}>{scheduleType}</td>
                              <td className="p-4 pr-6 text-slate-300 font-mono text-[11px]">{fileCount}</td>
                            </tr>
                            {isExpanded && (
                              <tr className="bg-slate-950/40">
                                <td colSpan={10} className="p-6">
                                  <div className="space-y-4">
                                    {backup.status === "failure" && backup.errorDetails && (
                                      <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl space-y-1">
                                        <span className="text-[10px] font-mono font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1">
                                          <AlertTriangle className="h-3.5 w-3.5" /> Detalhes da Falha Técnico-Operacional
                                        </span>
                                        <p className="text-xs text-rose-300 font-mono leading-relaxed select-all whitespace-pre-wrap">
                                          {backup.errorDetails}
                                        </p>
                                      </div>
                                    )}

                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                      <div className="bg-slate-900/60 border border-slate-800 p-3 rounded-xl text-xs">
                                        <span className="text-slate-500 block text-[10px] uppercase font-mono">Assunto do E-mail:</span>
                                        <span className="text-slate-300 font-mono block mt-0.5 select-all text-[11px] truncate" title={backup.subject}>{backup.subject}</span>
                                      </div>
                                      <div className="bg-slate-900/60 border border-slate-800 p-3 rounded-xl text-xs">
                                        <span className="text-slate-500 block text-[10px] uppercase font-mono">Recebido no Webhook:</span>
                                        <span className="text-slate-300 font-mono block mt-0.5 text-[11px]">{new Date(backup.receivedAt).toLocaleString("pt-BR")}</span>
                                      </div>
                                      <div className="bg-slate-900/60 border border-slate-800 p-3 rounded-xl text-xs">
                                        <span className="text-slate-500 block text-[10px] uppercase font-mono">Classificação:</span>
                                        <span className="text-slate-300 block mt-0.5 text-[11px] font-medium">
                                          {backup.parsedWithAI ? "⚡ IA Gemini 3.5 Flash" : "⚙️ Processador Regex de Tabela"}
                                        </span>
                                      </div>
                                      <div className="bg-slate-900/60 border border-slate-800 p-3 rounded-xl text-xs">
                                        <span className="text-slate-500 block text-[10px] uppercase font-mono">ID de Auditoria:</span>
                                        <span className="text-slate-300 font-mono block mt-0.5 text-[11px] select-all">#{backup.id}</span>
                                      </div>
                                    </div>

                                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 pt-4">
                                      <div className="flex items-center gap-2">
                                        {backup.status === "failure" && (
                                          <button
                                            onClick={(e) => handleUpdateStatus(backup.id, "success", e)}
                                            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-xs flex items-center gap-1.5 transition"
                                          >
                                            <Check className="h-3.5 w-3.5" />
                                            <span>Marcar como Resolvido</span>
                                          </button>
                                        )}
                                        {backup.status === "pending" && (
                                          <button
                                            onClick={(e) => handleUpdateStatus(backup.id, "success", e)}
                                            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-xs flex items-center gap-1.5 transition"
                                          >
                                            <Check className="h-3.5 w-3.5" />
                                            <span>Forçar Conclusão</span>
                                          </button>
                                        )}
                                        {backup.status === "success" && (
                                          <button
                                            onClick={(e) => handleUpdateStatus(backup.id, "failure", e)}
                                            className="px-3.5 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-rose-400 rounded-xl text-xs flex items-center gap-1.5 transition"
                                          >
                                            <AlertTriangle className="h-3.5 w-3.5" />
                                            <span>Marcar como Falha</span>
                                          </button>
                                        )}
                                      </div>

                                      <button
                                        onClick={(e) => handleDeleteBackup(backup.id, e)}
                                        className="px-3.5 py-2 bg-slate-900 hover:bg-red-950/25 text-slate-400 hover:text-rose-400 rounded-xl border border-slate-800 hover:border-rose-900/45 transition text-xs flex items-center gap-1"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                        <span>Remover Registro</span>
                                      </button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* 2. MOBILE CARD VIEW */}
                <div className="block md:hidden space-y-3">
                  <AnimatePresence>
                    {filteredBackups.map((backup) => {
                      const isExpanded = expandedBackupId === backup.id;
                      const clientName = backup.clientName || backup.serverName || "-";
                      const policyName = backup.policyName || backup.systemType || "Backup Geral";
                      const startTime = backup.startTime || "Não detalhado";
                      const endTime = backup.endTime || "Não detalhado";
                      const duration = backup.duration || "-";
                      const policyType = backup.policyType || "-";
                      const scheduleType = backup.scheduleType || "-";
                      const fileCount = backup.fileCount || "0";
                      const jobSize = backup.jobSize || backup.size || "0.00 MB";
                      const statusCode = backup.statusCode || (backup.status === "success" ? "Successfully" : "Failed");

                      return (
                        <motion.div
                          key={backup.id}
                          layout
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.2 }}
                          onClick={() => setExpandedBackupId(isExpanded ? null : backup.id)}
                          className={`bg-slate-900 border rounded-3xl hover:border-indigo-500/40 transition duration-150 overflow-hidden cursor-pointer ${
                            isExpanded ? "ring-2 ring-indigo-500/30 border-indigo-500/50" : "border-slate-800/80"
                          }`}
                        >
                          <div className="p-5 flex flex-col gap-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2">
                                {backup.status === "success" && (
                                  <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0" />
                                )}
                                {backup.status === "failure" && (
                                  <XCircle className="h-5 w-5 text-rose-500 animate-pulse shrink-0" />
                                )}
                                {backup.status === "pending" && (
                                  <Clock className="h-5 w-5 text-amber-500 animate-spin-slow shrink-0" />
                                )}
                                <div className="text-left">
                                  <h3 className="font-semibold text-sm text-white">{clientName}</h3>
                                  <span className="text-[10px] font-mono text-slate-400">{policyName}</span>
                                </div>
                              </div>
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-mono text-[9px] font-bold ${
                                backup.status === "success" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                                backup.status === "pending" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                                "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                              }`}>
                                {statusCode}
                              </span>
                            </div>

                            <div className="flex justify-between items-center text-xs border-t border-slate-800/60 pt-3">
                              <span className="font-mono bg-slate-950 text-slate-300 px-2 py-0.5 rounded border border-slate-800/50">{jobSize}</span>
                              <span className="text-slate-400 font-mono text-[10px]">{duration}</span>
                              <span className="text-[9px] text-slate-500 font-mono">{new Date(backup.receivedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                            </div>
                          </div>

                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                className="bg-slate-950 border-t border-slate-800/80 px-5 py-4 space-y-4 text-left"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {backup.status === "failure" && backup.errorDetails && (
                                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl space-y-1">
                                    <span className="text-[10px] font-mono font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1">
                                      <AlertTriangle className="h-3.5 w-3.5" /> Detalhes da Falha
                                    </span>
                                    <p className="text-xs text-rose-300 font-mono leading-relaxed select-all whitespace-pre-wrap">
                                      {backup.errorDetails}
                                    </p>
                                  </div>
                                )}

                                <div className="grid grid-cols-2 gap-2 text-xs">
                                  <div className="bg-slate-900/80 p-2.5 rounded-xl">
                                    <span className="text-slate-500 block text-[9px] uppercase font-mono">Start Time:</span>
                                    <span className="text-slate-300 font-mono block mt-0.5 text-[10px]">{startTime}</span>
                                  </div>
                                  <div className="bg-slate-900/80 p-2.5 rounded-xl">
                                    <span className="text-slate-500 block text-[9px] uppercase font-mono">End Time:</span>
                                    <span className="text-slate-300 font-mono block mt-0.5 text-[10px]">{endTime}</span>
                                  </div>
                                  <div className="bg-slate-900/80 p-2.5 rounded-xl">
                                    <span className="text-slate-500 block text-[9px] uppercase font-mono">Policy Type:</span>
                                    <span className="text-slate-300 font-mono block mt-0.5 text-[10px]">{policyType}</span>
                                  </div>
                                  <div className="bg-slate-900/80 p-2.5 rounded-xl">
                                    <span className="text-slate-500 block text-[9px] uppercase font-mono">Schedule Type:</span>
                                    <span className="text-slate-300 font-mono block mt-0.5 text-[10px]">{scheduleType}</span>
                                  </div>
                                  <div className="bg-slate-900/80 p-2.5 rounded-xl">
                                    <span className="text-slate-500 block text-[9px] uppercase font-mono">File Count:</span>
                                    <span className="text-slate-300 font-mono block mt-0.5 text-[10px]">{fileCount}</span>
                                  </div>
                                  <div className="bg-slate-900/80 p-2.5 rounded-xl">
                                    <span className="text-slate-500 block text-[9px] uppercase font-mono">Classificação:</span>
                                    <span className="text-slate-300 block mt-0.5 text-[10px] truncate">{backup.parsedWithAI ? "Inteligência Artificial" : "Regex de Tabela"}</span>
                                  </div>
                                </div>

                                <div className="flex flex-col gap-2 pt-3 border-t border-slate-800/80">
                                  <div className="flex gap-2 w-full">
                                    {backup.status === "failure" && (
                                      <button
                                        onClick={(e) => handleUpdateStatus(backup.id, "success", e)}
                                        className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-1"
                                      >
                                        <Check className="h-3 w-3" /> Resolvido
                                      </button>
                                    )}
                                    {backup.status === "pending" && (
                                      <button
                                        onClick={(e) => handleUpdateStatus(backup.id, "success", e)}
                                        className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-1"
                                      >
                                        <Check className="h-3 w-3" /> Concluir
                                      </button>
                                    )}
                                    {backup.status === "success" && (
                                      <button
                                        onClick={(e) => handleUpdateStatus(backup.id, "failure", e)}
                                        className="flex-1 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-rose-400 rounded-xl text-xs flex items-center justify-center gap-1"
                                      >
                                        <AlertTriangle className="h-3 w-3" /> Falhar
                                      </button>
                                    )}
                                    <button
                                      onClick={(e) => handleDeleteBackup(backup.id, e)}
                                      className="py-2 px-3 bg-slate-900 hover:bg-red-950/25 text-slate-400 hover:text-rose-400 rounded-xl border border-slate-800 hover:border-rose-900/45 transition text-xs flex items-center justify-center"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </>
            )}
          </div>



        </section>

      </main>

      {/* IMAP RESULT MODAL (DEPRECATED) */}
      {false && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl shadow-black/80 flex flex-col max-h-[85vh]">
            
            {/* Header */}
            <div className="p-6 border-b border-slate-800/80 bg-slate-950/40 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${imapResult.success ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>
                  {imapResult.success ? <CheckCircle className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {imapResult.success ? "Sincronização IMAP" : "Falha na Conexão IMAP"}
                  </h3>
                  <p className="text-[10px] text-slate-400">Verificação automática de logs de backup</p>
                </div>
              </div>
              <button 
                onClick={() => setShowImapResultModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <span className="text-lg font-semibold">✕</span>
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {imapResult.success ? (
                <>
                  <div className="bg-emerald-500/5 border border-emerald-500/15 p-4 rounded-2xl flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-emerald-400">Sucesso na conexão!</p>
                      <p className="text-[11px] text-slate-300 mt-1">
                        Sua conta de e-mail foi acessada de forma segura e novos logs de backup foram analisados e salvos.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-850 text-center">
                      <span className="text-[10px] font-medium text-slate-500 block uppercase font-mono tracking-wider">E-mails Lidos</span>
                      <span className="text-2xl font-extrabold text-white mt-1 block font-mono">{imapResult.emailsChecked}</span>
                    </div>
                    <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-850 text-center">
                      <span className="text-[10px] font-medium text-slate-500 block uppercase font-mono tracking-wider">Jobs Extraídos</span>
                      <span className="text-2xl font-extrabold text-indigo-400 mt-1 block font-mono">{imapResult.jobsExtracted}</span>
                    </div>
                  </div>

                  {imapResult.details && imapResult.details.length > 0 ? (
                    <div className="space-y-2">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Detalhes dos E-mails Processados:</span>
                      <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                        {imapResult.details.map((detail: any, idx: number) => (
                          <div key={idx} className="bg-slate-950/40 p-3 rounded-xl border border-slate-850/60 flex items-center justify-between gap-4 text-xs">
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-slate-200 truncate">{detail.subject}</p>
                              <p className="text-[10px] text-slate-500 truncate">De: {detail.from}</p>
                            </div>
                            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 font-mono shrink-0">
                              +{detail.jobsCount} jobs
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6 bg-slate-950/30 rounded-2xl border border-dashed border-slate-800">
                      <Mail className="h-8 w-8 text-slate-600 mx-auto stroke-[1.5]" />
                      <p className="text-xs text-slate-400 mt-2 font-semibold">Nenhum novo log de backup encontrado</p>
                      <p className="text-[10px] text-slate-500 mt-1 px-4 leading-relaxed">
                        Sua caixa de entrada foi verificada, mas não há novos e-mails não lidos correspondentes ao Veritas NetBackup.
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="bg-rose-500/5 border border-rose-500/15 p-4 rounded-2xl flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-rose-400">Não foi possível conectar ao IMAP</p>
                      <p className="text-[11px] text-slate-300 mt-1">
                        {imapResult.error || "Erro de Conexão"}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3 bg-slate-950/60 p-4 rounded-2xl border border-slate-850/80">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Mensagem Técnica do Servidor:</span>
                    <p className="text-[11px] text-rose-300 font-mono leading-relaxed whitespace-pre-wrap break-words bg-black/30 p-3 rounded-xl border border-slate-800/55">
                      {imapResult.details}
                    </p>
                  </div>

                  <div className="text-[10px] text-slate-400 leading-relaxed bg-slate-900 p-3 rounded-xl border border-slate-800">
                    <strong className="text-white">💡 Como corrigir?</strong>
                    <ul className="list-disc pl-4 mt-1 space-y-1">
                      <li>Verifique se você configurou <code className="text-indigo-400">IMAP_USER</code> e <code className="text-indigo-400">IMAP_PASS</code> corretamente em seu arquivo <code className="text-indigo-400">.env</code>.</li>
                      {imapResult.details?.toLowerCase().includes("outlook") || imapResult.details?.toLowerCase().includes("microsoft") ? (
                        <>
                          <li className="text-amber-400 font-semibold">Para Outlook/Hotmail, a Microsoft desativou "Senhas de Aplicativo" por IMAP em Setembro de 2024. Use Gmail/Yahoo ou o Power Automate na aba de Integrações!</li>
                          <li>Certifique-se de que o <code className="text-indigo-400">IMAP_HOST</code> está configurado como <code className="text-indigo-400">outlook.office365.com</code> no seu arquivo <code className="text-indigo-400">.env</code>.</li>
                        </>
                      ) : imapResult.details?.toLowerCase().includes("yahoo") ? (
                        <>
                          <li>Para contas Yahoo! Mail, use uma <strong>Senha de Aplicativo de 16 caracteres</strong> gerada nas Opções de Segurança do Yahoo.</li>
                          <li>Certifique-se de que o <code className="text-indigo-400">IMAP_HOST</code> está configurado como <code className="text-indigo-400">imap.mail.yahoo.com</code> no seu arquivo <code className="text-indigo-400">.env</code>.</li>
                        </>
                      ) : (
                        <>
                          <li>Para contas Gmail, certifique-se de usar uma <strong>Senha de Aplicativo (App Password) de 16 dígitos</strong> gerada na página de Segurança do Google, e não sua senha normal.</li>
                          <li>Verifique se a opção de acesso IMAP está habilitada nas configurações do Gmail.</li>
                        </>
                      )}
                    </ul>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-slate-800/80 bg-slate-950/25 flex justify-end">
              <button
                onClick={() => setShowImapResultModal(false)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white rounded-xl transition"
              >
                Fechar
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
