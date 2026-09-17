"use client";

import React, { useState, useEffect } from "react";
import {
  Upload,
  FileText,
  Trash2,
  RefreshCw,
  Eye,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  Plus,
} from "lucide-react";

interface DocumentItem {
  id: string;
  filename: string;
  file_type: string;
  status: "pending" | "chunking" | "embedding" | "ready" | "failed";
  page_count: number | null;
  chunk_count: number | null;
  error_message: string | null;
  created_at: string;
}

interface ChunkItem {
  id: string;
  content: string;
  page_number: number | null;
  chunk_index: number;
}

export default function DocumentCatalogPage() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [customText, setCustomText] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Chunk transparency inspection modal
  const [inspectDoc, setInspectDoc] = useState<DocumentItem | null>(null);
  const [docChunks, setDocChunks] = useState<ChunkItem[]>([]);
  const [loadingChunks, setLoadingChunks] = useState(false);

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/documents");
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
      }
    } catch (err) {
      console.error("Failed to load documents:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleProcessQueue = async () => {
    try {
      await fetch("/api/ingest/process", { method: "POST" });
      loadDocuments();
    } catch (err) {
      console.error("Queue process error:", err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to remove this document and all its indexed chunks?")) return;
    try {
      await fetch(`/api/documents/${id}`, { method: "DELETE" });
      loadDocuments();
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  const handleInspectChunks = async (doc: DocumentItem) => {
    setInspectDoc(doc);
    setLoadingChunks(true);
    try {
      const res = await fetch(`/api/documents/${doc.id}/chunks`);
      if (res.ok) {
        const data = await res.json();
        setDocChunks(data.chunks || []);
      }
    } catch (err) {
      console.error("Failed to fetch chunk inspection:", err);
    } finally {
      setLoadingChunks(false);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUploading(true);

    try {
      const formData = new FormData();
      if (selectedFile) {
        formData.append("file", selectedFile);
      } else if (customText.trim()) {
        formData.append("content", customText);
        formData.append("filename", customTitle.trim() || "untitled_note.md");
      }

      const res = await fetch("/api/documents", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        setSelectedFile(null);
        setCustomText("");
        setCustomTitle("");
        setShowUploadModal(false);
        // Trigger queue processor right away
        await fetch("/api/ingest/process", { method: "POST" });
        loadDocuments();
      }
    } catch (err) {
      console.error("Upload error:", err);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-rule pb-4">
        <div>
          <h1 className="font-serif text-3xl text-ink font-normal">
            Document Catalog
          </h1>
          <p className="text-sm text-ink/70 font-sans mt-0.5">
            Physical index-card layout of indexed enterprise knowledge, chunk counts, and ingestion status.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleProcessQueue}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-mono border border-rule rounded bg-paper-dim hover:bg-paper transition-colors text-ink"
            title="Trigger Queue Worker (FOR UPDATE SKIP LOCKED)"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Process Queue</span>
          </button>

          <button
            onClick={() => setShowUploadModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-mono bg-index-red text-paper rounded hover:bg-index-red/90 transition-colors shadow-sm font-semibold"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Index Document</span>
          </button>
        </div>
      </div>

      {/* Index Card Horizontal Record Rows */}
      {loading ? (
        <div className="py-12 text-center text-xs font-mono text-ink/60">
          Loading catalog records...
        </div>
      ) : documents.length === 0 ? (
        <div className="bg-paper-dim border border-rule border-dashed p-12 text-center rounded-lg space-y-3">
          <FileText className="w-8 h-8 text-ink/40 mx-auto" />
          <h3 className="font-serif text-lg font-bold text-ink">
            No documents indexed yet
          </h3>
          <p className="text-xs font-mono text-ink/60 max-w-sm mx-auto">
            Upload PDFs, DOCX files, or policies to populate the vector search index and knowledge graph.
          </p>
          <button
            onClick={() => setShowUploadModal(true)}
            className="text-xs font-mono text-index-red underline hover:opacity-80"
          >
            + Upload first document
          </button>
        </div>
      ) : (
        <div className="divide-y divide-rule border border-rule rounded-lg bg-paper overflow-hidden shadow-2xs">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="p-4 hover:bg-paper-dim/60 transition-colors flex items-center justify-between gap-4 font-mono text-xs"
            >
              {/* Document Identity */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded bg-paper-dim border border-rule flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-index-red" />
                </div>
                <div className="truncate">
                  <span className="font-bold text-ink text-sm block truncate">
                    {doc.filename}
                  </span>
                  <span className="text-[11px] text-ink/50 uppercase tracking-wider">
                    Format: {doc.file_type} &bull; Added:{" "}
                    {new Date(doc.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {/* Status & Stats */}
              <div className="flex items-center gap-6 shrink-0">
                {/* Status Badge */}
                <div>
                  {doc.status === "ready" ? (
                    <span className="inline-flex items-center gap-1 text-folder-green bg-folder-green/10 border border-folder-green/20 px-2 py-0.5 rounded text-[11px] font-semibold">
                      <CheckCircle2 className="w-3 h-3" />
                      Ready & Indexed
                    </span>
                  ) : doc.status === "failed" ? (
                    <span className="inline-flex items-center gap-1 text-index-red bg-index-red/10 border border-index-red/20 px-2 py-0.5 rounded text-[11px]">
                      <AlertCircle className="w-3 h-3" />
                      Failed
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-ink/70 bg-paper-dim border border-rule px-2 py-0.5 rounded text-[11px] animate-pulse">
                      <Clock className="w-3 h-3" />
                      {doc.status}...
                    </span>
                  )}
                </div>

                {/* Chunk Count */}
                <div className="text-right">
                  <span className="text-ink font-semibold block">
                    {doc.chunk_count ?? 0} Chunks
                  </span>
                  <span className="text-[10px] text-ink/50">
                    {doc.page_count ?? 1} {doc.page_count === 1 ? "page" : "pages"}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleInspectChunks(doc)}
                    className="p-1.5 rounded hover:bg-paper border border-rule text-ink/70 hover:text-ink transition-colors"
                    title="Inspect Chunks Transparency"
                  >
                    <Eye className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleDelete(doc.id)}
                    className="p-1.5 rounded hover:bg-paper border border-rule text-ink/50 hover:text-index-red transition-colors"
                    title="Delete Document"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-paper border border-rule rounded-lg max-w-lg w-full p-6 shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-rule pb-3">
              <h3 className="font-serif text-xl font-bold text-ink">
                Index Document into Archive
              </h3>
              <button
                onClick={() => setShowUploadModal(false)}
                className="text-ink/50 hover:text-ink font-mono text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-4 font-mono text-xs">
              <div>
                <label className="block text-ink/70 mb-1 font-semibold">
                  Option A: Upload File (.pdf, .docx, .md, .txt)
                </label>
                <input
                  type="file"
                  accept=".pdf,.docx,.md,.txt"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="w-full bg-paper-dim border border-rule p-2 rounded text-ink file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-ink file:text-paper"
                />
              </div>

              <div className="text-center text-ink/40 text-[11px]">— OR —</div>

              <div>
                <label className="block text-ink/70 mb-1 font-semibold">
                  Option B: Paste Raw Text / Policy
                </label>
                <input
                  type="text"
                  placeholder="Document Title (e.g. Return_Policy.md)"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  className="w-full bg-paper-dim border border-rule p-2 rounded mb-2 text-ink"
                />
                <textarea
                  rows={5}
                  placeholder="Paste policy or documentation text..."
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  className="w-full bg-paper-dim border border-rule p-2 rounded text-ink font-sans text-xs"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-rule">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 border border-rule rounded hover:bg-paper-dim text-ink"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={(!selectedFile && !customText.trim()) || isUploading}
                  className="px-4 py-2 bg-index-red text-paper rounded font-semibold hover:bg-index-red/90 disabled:opacity-50"
                >
                  {isUploading ? "Uploading..." : "Start Ingestion"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Chunk Transparency Modal (Section 8: "Admin can view a document's chunk count and a preview of how it was split") */}
      {inspectDoc && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-paper border border-rule rounded-lg max-w-3xl w-full max-h-[85vh] flex flex-col p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-rule pb-3">
              <div>
                <h3 className="font-serif text-xl font-bold text-ink">
                  Chunk Segmentation Transparency
                </h3>
                <p className="text-xs font-mono text-ink/60">
                  {inspectDoc.filename} &bull; {docChunks.length} chunks extracted
                </p>
              </div>
              <button
                onClick={() => setInspectDoc(null)}
                className="text-ink/50 hover:text-ink font-mono text-sm"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-2">
              {loadingChunks ? (
                <div className="p-8 text-center font-mono text-xs text-ink/60">
                  Loading chunk splits...
                </div>
              ) : docChunks.length === 0 ? (
                <div className="p-8 text-center font-mono text-xs text-ink/50">
                  No chunks generated for this record.
                </div>
              ) : (
                docChunks.map((c) => (
                  <div
                    key={c.id}
                    className="p-3.5 bg-paper-dim border border-rule rounded text-xs font-mono space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-ink/50 text-[11px]">
                      <span className="font-bold text-index-red">
                        Chunk #{c.chunk_index + 1}
                      </span>
                      <span>Page {c.page_number ?? 1}</span>
                    </div>
                    <p className="text-ink/80 font-sans text-xs leading-relaxed whitespace-pre-wrap">
                      {c.content}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
