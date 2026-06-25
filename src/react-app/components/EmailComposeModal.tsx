import React, { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import QuillEditor from "./QuillEditor";
import { api } from "../lib/api";
import { X, Mail, Send, AlertCircle, CheckCircle2, Eye, FileText, Upload, CalendarClock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface EmailComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerIds: number[];
  recipientCount: number;
  initialSubject?: string;
  initialHtmlContent?: string;
  onSuccess?: (jobId: number) => void;
}

type RecipientType = "selected" | "all" | "single";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function extractEmailsFromText(value: unknown) {
  return String(value ?? "")
    .match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)
    ?.map((email) => email.trim().toLowerCase())
    .filter((email) => EMAIL_RE.test(email)) ?? [];
}

function uniqueEmails(emails: string[]) {
  return Array.from(new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean)));
}

export default function EmailComposeModal({
  isOpen,
  onClose,
  customerIds,
  recipientCount,
  initialSubject,
  initialHtmlContent,
  onSuccess,
}: EmailComposeModalProps) {
  const navigate = useNavigate();
  const [subject, setSubject] = useState("");
  const [htmlContent, setHtmlContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Sync initial subject and htmlContent when modal opens
  useEffect(() => {
    if (isOpen) {
      setSubject(initialSubject || "");
      setHtmlContent(initialHtmlContent || "");
      setScheduledAt("");
    }
  }, [isOpen, initialSubject, initialHtmlContent]);

  // Recipient selection: selected (from leads page), all (system wide), single (custom target)
  const [recipientType, setRecipientType] = useState<RecipientType>(
    customerIds.length > 0 ? "selected" : "all"
  );
  const [singleEmailInput, setSingleEmailInput] = useState("");
  const [finalRecipientCount, setFinalRecipientCount] = useState(recipientCount);
  const [finalCustomerIds, setFinalCustomerIds] = useState<number[]>(customerIds);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [showDropdown, setShowDropdown] = useState(false);

  // Fetch recipients list once for client-side search autocomplete
  const { data: autocompleteData } = useQuery({
    queryKey: ["recipients-autocomplete"],
    queryFn: () => api.getEmailRecipientsAutocomplete(),
    enabled: isOpen && recipientType === "single",
    staleTime: 5 * 60 * 1000, // cache for 5 minutes
  });

  // Client-side search suggestion algorithm (in-memory, no continuous requests)
  const suggestions = React.useMemo(() => {
    const tokens = singleEmailInput.split(/[,;\s]+/);
    const lastToken = tokens[tokens.length - 1]?.trim().toLowerCase();
    if (recipientType !== "single" || !lastToken || lastToken.includes("@") || !autocompleteData?.data) {
      return [];
    }
    return autocompleteData.data.filter(
      (c) =>
        c.name.toLowerCase().includes(lastToken) ||
        c.email.toLowerCase().includes(lastToken)
    ).slice(0, 10); // limit to top 10 matches
  }, [singleEmailInput, recipientType, autocompleteData]);

  const handleSelectSuggestion = (cust: any) => {
    const tokens = singleEmailInput.split(/[,;\s]+/);
    tokens.pop(); // remove the typing token
    tokens.push(cust.email);
    setSingleEmailInput(tokens.filter(Boolean).join(", ") + ", ");
    setShowDropdown(false);
  };

  const handleImportEmailFile = async (file: File) => {
    setError(null);
    setMessage(null);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const rows = workbook.SheetNames.flatMap((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
          defval: "",
          raw: false,
        });
      });

      const importedEmails = rows.flatMap((row) => {
        const entries = Object.entries(row);
        const emailColumn = entries.find(([key]) => {
          const normalized = key.trim().toLowerCase();
          return ["email", "mail", "e-mail", "email nhận", "email nhan", "địa chỉ email", "dia chi email"].includes(normalized);
        });

        if (emailColumn) {
          return extractEmailsFromText(emailColumn[1]);
        }

        return entries.flatMap(([, value]) => extractEmailsFromText(value));
      });

      const existingEmails = singleEmailInput
        .split(/[,;\s]+/)
        .flatMap((value) => extractEmailsFromText(value));
      const mergedEmails = uniqueEmails([...existingEmails, ...importedEmails]);

      if (importedEmails.length === 0) {
        setError("Không tìm thấy email hợp lệ trong file Excel.");
        return;
      }

      setRecipientType("single");
      setSingleEmailInput(mergedEmails.join(", "));
      setMessage(`Đã import ${uniqueEmails(importedEmails).length} email từ file. Tổng danh sách hiện có ${mergedEmails.length} email.`);
    } catch (err) {
      console.error(err);
      setError("Không thể đọc file. Vui lòng dùng file .xlsx, .xls hoặc .csv có cột email.");
    }
  };

  const { data: recipientsCountData } = useQuery({
    queryKey: ["recipients-count"],
    queryFn: () => api.getEmailRecipientsCount(),
    enabled: isOpen && recipientType === "all",
  });

  // Calculate final targets based on options
  useEffect(() => {
    if (!isOpen) return;

    if (recipientType === "selected" && customerIds.length > 0) {
      setFinalRecipientCount(customerIds.length);
      setFinalCustomerIds(customerIds);
    } else if (recipientType === "all") {
      setFinalRecipientCount(recipientsCountData?.count ?? 0);
      setFinalCustomerIds([]); // Empty array means "All System Leads" on the backend
    } else if (recipientType === "single") {
      const emailList = singleEmailInput
        .split(/[,;\s]+/)
        .map((e) => e.trim())
        .filter((e) => e.includes("@"));
      setFinalRecipientCount(emailList.length);
      setFinalCustomerIds([]); // Will bypass D1 background queue and send directly
    }
  }, [recipientType, customerIds, recipientsCountData, singleEmailInput, isOpen]);

  if (!isOpen) return null;

  const handleSendCampaign = async (isDraftMode: boolean = false) => {
    if (!subject.trim() || !htmlContent.trim()) {
      setError("Vui lòng nhập đầy đủ tiêu đề và nội dung.");
      return;
    }

    let scheduledAtIso: string | undefined;
    const shouldSchedule = !isDraftMode && Boolean(scheduledAt);
    if (shouldSchedule) {
      const scheduledDate = new Date(scheduledAt);
      if (Number.isNaN(scheduledDate.getTime()) || scheduledDate.getTime() <= Date.now()) {
        setError("Thời gian gửi phải lớn hơn thời điểm hiện tại.");
        return;
      }
      scheduledAtIso = scheduledDate.toISOString();
    }

    const emailList = recipientType === "single"
      ? singleEmailInput
          .split(/[,;\s]+/)
          .map((e) => e.trim())
          .filter((e) => e.includes("@"))
      : [];

    if (recipientType === "single" && emailList.length === 0) {
      setError("Vui lòng nhập ít nhất một địa chỉ email hợp lệ.");
      return;
    }

    if (recipientType !== "single" && recipientType !== "all" && finalCustomerIds.length === 0) {
      setError("Không có khách hàng nào nhận email.");
      return;
    }
    if (recipientType === "all" && finalRecipientCount === 0) {
      setError("Không có khách hàng nào trong hệ thống có email hợp lệ.");
      return;
    }

    if (isDraftMode) {
      setDraftLoading(true);
    } else {
      setLoading(true);
    }
    setError(null);
    setMessage(null);

    try {
      const res = await api.createEmailCampaign({
        subject,
        htmlContent,
        customerIds: recipientType === "single" ? [] : finalCustomerIds,
        customEmails: recipientType === "single" ? emailList : undefined,
        status: isDraftMode ? "DRAFT" : shouldSchedule ? "SCHEDULED" : "PENDING",
        scheduledAt: scheduledAtIso,
      });

      if (res.success) {
        setMessage(res.message);
        if (onSuccess) {
          onSuccess(res.data.jobId);
        }
        setTimeout(() => {
          onClose();
          setSubject("");
          setHtmlContent("");
          setSingleEmailInput("");
          setScheduledAt("");
          setMessage(null);
          navigate("/email");
        }, 1500);
      } else {
        setError(res.message || "Không thể tạo chiến dịch gửi email.");
      }
    } catch (err: any) {
      setError(err.message || "Đã xảy ra lỗi.");
    } finally {
      setLoading(false);
      setDraftLoading(false);
    }
  };

  const handleSendTest = async () => {
    if (!subject.trim() || !htmlContent.trim()) {
      setError("Vui lòng nhập đầy đủ tiêu đề và nội dung để gửi thử.");
      return;
    }

    setTestLoading(true);
    setError(null);
    setMessage(null);

    try {
      const res = await api.testEmailCampaign({
        subject,
        htmlContent,
      });
      if (res.success) {
        setMessage(res.message);
      } else {
        setError(res.message || "Không thể gửi email thử.");
      }
    } catch (err: any) {
      setError(err.message || "Đã xảy ra lỗi khi gửi thử.");
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      {/* CSS Override to hide Quill container wrapper scrollbar while preserving inner editor scroll */}
      <style>{`
        .ql-container.ql-snow {
          border: none !important;
          height: 100% !important;
          display: flex !important;
          flex-direction: column !important;
        }
        .ql-editor {
          flex: 1 !important;
          overflow-y: auto !important;
        }
      `}</style>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-7xl h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white z-10 flex-shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Mail className="text-blue-600" size={20} />
              Soạn Thảo Chiến Dịch Email
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Chuẩn bị cho <span className="text-blue-600 font-bold font-mono">{finalRecipientCount}</span> địa chỉ nhận email.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Two column Layout: Left = Editor, Right = Live Preview */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
          {/* Left Column: Form & Editor */}
          <div className="w-full md:w-1/2 p-6 space-y-4 border-r border-gray-200 flex flex-col h-full overflow-hidden">
            {error && (
              <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-center gap-2 flex-shrink-0">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            {message && (
              <div className="p-3.5 bg-green-50 border border-green-200 text-green-700 rounded-xl text-sm flex items-center gap-2 flex-shrink-0">
                <CheckCircle2 size={16} />
                <span>{message}</span>
              </div>
            )}

            {/* Recipient Selection Config */}
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-150 space-y-2 flex-shrink-0">
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider">Đối tượng nhận thư *</label>
              <div className="flex gap-4 text-sm">
                {customerIds.length > 0 && (
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="recipientType"
                      checked={recipientType === "selected"}
                      onChange={() => setRecipientType("selected")}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    <span>Các Lead đã chọn ({customerIds.length})</span>
                  </label>
                )}
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="recipientType"
                    checked={recipientType === "all"}
                    onChange={() => setRecipientType("all")}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span>Toàn bộ hệ thống</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="recipientType"
                    checked={recipientType === "single"}
                    onChange={() => setRecipientType("single")}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span>Gửi đến danh sách email tự nhập</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setRecipientType("single");
                    fileInputRef.current?.click();
                  }}
                  className="ml-auto px-2.5 py-1 text-xs bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1.5"
                >
                  <Upload size={13} />
                  Import Excel
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImportEmailFile(file);
                    e.target.value = "";
                  }}
                />
              </div>

              {/* Custom single email input field */}
              {recipientType === "single" && (
                <div className="mt-2 relative">
                  <input
                    type="text"
                    value={singleEmailInput}
                    onChange={(e) => {
                      setSingleEmailInput(e.target.value);
                      setShowDropdown(true);
                    }}
                    onFocus={() => {
                      if (suggestions.length > 0) setShowDropdown(true);
                    }}
                    onBlur={() => {
                      setTimeout(() => setShowDropdown(false), 200);
                    }}
                    placeholder="Nhập các email nhận thư, cách nhau bằng dấu phẩy (ví dụ: a@test.com, b@test.com)..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                  {showDropdown && suggestions.length > 0 && (
                    <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto z-50">
                      {suggestions.map((cust) => (
                        <button
                          key={cust.id}
                          type="button"
                          onClick={() => handleSelectSuggestion(cust)}
                          className="w-full text-left px-3 py-1.5 hover:bg-gray-50 flex flex-col border-b border-gray-100 last:border-0"
                        >
                          <span className="font-medium text-gray-800 text-xs">{cust.name}</span>
                          <span className="text-gray-500 text-[11px]">{cust.email}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-1.5 flex-shrink-0">
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider">Thời gian gửi email</label>
              <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 bg-white focus-within:ring-2 focus-within:ring-blue-500">
                <CalendarClock size={15} className="text-gray-500" />
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="w-full outline-none bg-transparent text-sm text-gray-700"
                />
              </div>
              <p className="text-[11px] text-gray-400">Để trống nếu muốn gửi ngay.</p>
            </div>

            {/* Subject */}
            <div className="space-y-1.5 flex-shrink-0">
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider">Tiêu đề email *</label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Nhập tiêu đề thư..."
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
              />
            </div>

            {/* Content Editor */}
            <div className="space-y-1.5 flex-1 flex flex-col min-h-0">
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider flex-shrink-0">Nội dung thư (HTML) *</label>
              <div className="flex-1 min-h-0">
                <QuillEditor value={htmlContent} onChange={setHtmlContent} />
              </div>
            </div>
          </div>

          {/* Right Column: Live Preview */}
          <div className="w-full md:w-1/2 p-6 bg-gray-50 flex flex-col h-full min-h-0">
            <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3 flex items-center gap-1.5 flex-shrink-0">
              <Eye size={14} className="text-gray-400" />
              Xem trước thư thực tế (Live Preview)
            </h4>

            {/* Preview Box */}
            <div className="flex-1 bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col overflow-hidden h-full">
              {/* Fake Email client envelope headers */}
              <div className="space-y-2 pb-4 mb-4 border-b border-gray-100 text-sm flex-shrink-0">
                <div>
                  <span className="text-gray-400">Người gửi:</span>{" "}
                  <span className="text-gray-700 font-medium">VNMentors &lt;contact@vnmentors.edu.vn&gt;</span>
                </div>
                <div>
                  <span className="text-gray-400">Người nhận:</span>{" "}
                  <span className="text-gray-900 font-semibold">
                    {recipientType === "single"
                      ? singleEmailInput || "(Chưa nhập email nhận)"
                      : `${finalRecipientCount} người nhận (${recipientType === "all" ? "Toàn bộ" : "Các Lead đã chọn"})`}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">Tiêu đề:</span>{" "}
                  <span className="text-gray-900 font-semibold">{subject || "(Chưa có tiêu đề)"}</span>
                </div>
              </div>

              {/* Email Content Body Frame */}
              <div className="flex-1 text-gray-800 overflow-y-auto max-w-none break-words">
                {htmlContent ? (
                  <div className="ql-editor p-0" dangerouslySetInnerHTML={{ __html: htmlContent }} />
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-400 text-xs italic">
                    Nội dung email sẽ tự động hiển thị trực quan ở đây khi bạn nhập...
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl sticky bottom-0 z-10 flex-shrink-0">
          <button
            type="button"
            onClick={handleSendTest}
            disabled={loading || testLoading || draftLoading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-all flex items-center gap-2 cursor-pointer"
          >
            {testLoading ? (
              <>
                <svg className="animate-spin h-4 w-4 text-gray-700" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Đang gửi thử...</span>
              </>
            ) : (
              <span>Gửi thử (Preview)</span>
            )}
          </button>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Hủy
            </button>

            {recipientType !== "single" && (
              <button
                type="button"
                onClick={() => handleSendCampaign(true)}
                disabled={loading || testLoading || draftLoading || (recipientType !== "all" && finalCustomerIds.length === 0)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-350 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-all flex items-center gap-2 cursor-pointer shadow-sm"
              >
                {draftLoading ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-gray-700" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Đang lưu...</span>
                  </>
                ) : (
                  <>
                    <FileText size={14} />
                    <span>Lưu Nháp (Chưa gửi)</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => handleSendCampaign(false)}
              disabled={loading || testLoading || draftLoading || (recipientType !== "single" && recipientType !== "all" && finalCustomerIds.length === 0)}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center gap-2 cursor-pointer shadow-sm"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Đang xử lý...</span>
                </>
              ) : (
                <>
                  <Send size={14} />
                  <span>{recipientType === "single" ? "Gửi ngay" : "Gửi Chiến Dịch"}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}



