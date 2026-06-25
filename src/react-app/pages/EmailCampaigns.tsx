import React, { useEffect, useState } from "react";
import { Plus, Mail, Play, Pause, RefreshCw, Eye, Calendar, User, CheckCircle2, AlertCircle, FileText } from "lucide-react";
import { api } from "../lib/api";
import { BackgroundJob, CampaignDetails } from "../lib/types";
import EmailComposeModal from "../components/EmailComposeModal";

export default function EmailCampaigns() {
  const [campaigns, setCampaigns] = useState<BackgroundJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [details, setDetails] = useState<CampaignDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [isComposeOpen, setIsComposeOpen] = useState(false);

  // States to pass initial content when cloning/resending campaigns
  const [composeInitialSubject, setComposeInitialSubject] = useState("");
  const [composeInitialHtmlContent, setComposeInitialHtmlContent] = useState("");

  const handleNewCampaign = () => {
    setComposeInitialSubject("");
    setComposeInitialHtmlContent("");
    setIsComposeOpen(true);
  };

  const handleCloneCampaign = (job: BackgroundJob) => {
    try {
      const payload = JSON.parse(job.payload);
      setComposeInitialSubject(payload.subject || "");
      setComposeInitialHtmlContent(payload.htmlContent || "");
      setIsComposeOpen(true);
    } catch (err) {
      console.error(err);
    }
  };

  // Poll intervals: backoff strategy [3, 5, 10, 30, 60] seconds
  const backoffSchedule = [3000, 5000, 10000, 30000, 60000];
  const [backoffIndex, setBackoffIndex] = useState(0);

  const fetchCampaigns = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.getEmailCampaigns();
      if (res.success) {
        setCampaigns(res.data);
      }
    } catch (err) {
      console.error("Error fetching campaigns:", err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const fetchDetails = async (id: number, silent = false) => {
    if (!silent) setDetailsLoading(true);
    try {
      const res = await api.getEmailCampaign(id);
      if (res.success) {
        setDetails(res.data);
      }
    } catch (err) {
      console.error("Error fetching campaign details:", err);
    } finally {
      if (!silent) setDetailsLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  // Poll for active campaigns
  useEffect(() => {
    const activeJobs = campaigns.filter(
      (job) => job.status === "PENDING" || job.status === "PROCESSING"
    );

    if (activeJobs.length === 0) {
      setBackoffIndex(0);
      return;
    }

    const intervalTime = backoffSchedule[backoffIndex] || 60000;

    const timer = setTimeout(() => {
      fetchCampaigns(true);
      if (selectedCampaignId) {
        fetchDetails(selectedCampaignId, true);
      }
      setBackoffIndex((prev) => Math.min(prev + 1, backoffSchedule.length - 1));
    }, intervalTime);

    return () => clearTimeout(timer);
  }, [campaigns, backoffIndex, selectedCampaignId]);

  // Reset backoff when new active job is created or selected
  useEffect(() => {
    setBackoffIndex(0);
  }, [selectedCampaignId]);

  const handleSelectCampaign = (id: number) => {
    setSelectedCampaignId(id);
    fetchDetails(id);
  };

  const handleCancelCampaign = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Bạn có chắc chắn muốn hủy chiến dịch gửi email này?")) return;

    setActionLoading(id);
    try {
      const res = await api.cancelEmailCampaign(id);
      if (res.success) {
        fetchCampaigns();
        if (selectedCampaignId === id) {
          fetchDetails(id);
        }
      }
    } catch (err: any) {
      alert(err.message || "Không thể hủy chiến dịch.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleStartCampaign = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Bạn có chắc chắn muốn kích hoạt và bắt đầu gửi chiến dịch email này?")) return;

    setActionLoading(id);
    try {
      const res = await api.startEmailCampaign(id);
      if (res.success) {
        fetchCampaigns();
        if (selectedCampaignId === id) {
          fetchDetails(id);
        }
      }
    } catch (err: any) {
      alert(err.message || "Không thể khởi chạy chiến dịch.");
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (status: BackgroundJob["status"]) => {
    switch (status) {
      case "PENDING":
        return <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1"><RefreshCw size={10} className="animate-spin" /> Đang chờ</span>;
      case "PROCESSING":
        return <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1"><RefreshCw size={10} className="animate-spin" /> Đang gửi</span>;
      case "COMPLETED":
        return <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1"><CheckCircle2 size={10} /> Hoàn thành</span>;
      case "FAILED":
        return <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1"><AlertCircle size={10} /> Lỗi</span>;
      case "CANCELLED":
        return <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium flex items-center gap-1"><Pause size={10} /> Đã hủy</span>;
      case "STALLED":
        return <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1"><AlertCircle size={10} /> Bị nghẽn</span>;
      case "DRAFT":
        return <span className="text-xs bg-gray-150 text-gray-700 px-2 py-0.5 rounded-full font-semibold border border-gray-300/60 flex items-center gap-1"><FileText size={10} /> Bản nháp</span>;
      case "SCHEDULED":
        return <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1"><Calendar size={10} /> Đã lên lịch</span>;
      default:
        return <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">{status}</span>;
    }
  };

  const activeCampaigns = campaigns.filter(c => c.status === "PENDING" || c.status === "PROCESSING").length;
  const totalCampaigns = campaigns.length;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Chiến dịch Email</h2>
          <div className="flex gap-3 mt-1 text-sm text-gray-500">
            <span>{totalCampaigns} chiến dịch đã tạo</span>
            {activeCampaigns > 0 && (
              <span className="text-blue-600 font-medium">· {activeCampaigns} đang hoạt động</span>
            )}
          </div>
        </div>
        <button
          onClick={handleNewCampaign}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus size={17} /> Tạo chiến dịch mới
        </button>
      </div>

      {/* Info Box */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-5 text-xs text-gray-500">
        <span className="font-mono font-medium text-gray-700">Quy trình:</span>
        {" "}Tạo chiến dịch mới gửi cho tập khách hàng. Hệ thống đẩy thư vào hàng đợi ngầm. Để gửi chiến dịch cho tất cả lead, hãy sử dụng bộ lọc trong danh sách Leads để chọn nhiều khách hàng rồi bấm gửi.
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Campaign List */}
        <div className="lg:col-span-1 bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col h-[70vh] shadow-sm">
          <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <span className="font-semibold text-gray-900 text-sm">Danh sách chiến dịch</span>
            <button
              onClick={() => fetchCampaigns(false)}
              className="p-1 hover:bg-gray-200 rounded-full text-gray-500 transition-colors"
              title="Làm mới"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {loading && campaigns.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">Đang tải...</div>
            ) : campaigns.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">Chưa có chiến dịch nào được tạo.</div>
            ) : (
              campaigns.map((job) => {
                let subject = "";
                try {
                  const p = JSON.parse(job.payload);
                  subject = p.subject;
                } catch {
                  subject = "Chiến dịch email";
                }

                const isSelected = selectedCampaignId === job.id;
                const progressPct = job.total > 0 ? Math.round((job.progress / job.total) * 100) : 0;

                return (
                  <div
                    key={job.id}
                    onClick={() => handleSelectCampaign(job.id)}
                    className={`p-4 cursor-pointer transition-all space-y-2 hover:bg-gray-50 ${
                      isSelected ? "bg-blue-50/50 border-l-4 border-blue-600" : ""
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-mono text-gray-400">#{job.id}</span>
                      {getStatusBadge(job.status)}
                    </div>

                    <h4 className="font-semibold text-gray-900 truncate text-sm" title={subject}>
                      {subject}
                    </h4>

                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>Tiến độ: {job.progress}/{job.total} ({progressPct}%)</span>
                      <span>{new Date(job.created_at).toLocaleDateString("vi-VN")}</span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-blue-600 h-full rounded-full transition-all duration-300"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>

                    {/* Action buttons */}
                    {job.status === "DRAFT" && (
                      <div className="pt-1.5 flex justify-end">
                        <button
                          onClick={(e) => handleStartCampaign(job.id, e)}
                          disabled={actionLoading === job.id}
                          className="px-2.5 py-1 text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 rounded font-semibold disabled:opacity-50 transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <Play size={10} /> {actionLoading === job.id ? "Đang gửi..." : "Gửi ngay"}
                        </button>
                      </div>
                    )}
                    {(job.status === "PENDING" || job.status === "PROCESSING" || job.status === "STALLED" || job.status === "SCHEDULED") && (
                      <div className="pt-1.5 flex justify-end">
                        <button
                          onClick={(e) => handleCancelCampaign(job.id, e)}
                          disabled={actionLoading === job.id}
                          className="px-2.5 py-1 text-xs border border-red-200 text-red-600 hover:bg-red-50 rounded font-medium disabled:opacity-50 transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <Pause size={10} /> {actionLoading === job.id ? "Đang hủy..." : "Hủy gửi"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Campaign Detail */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col h-[70vh] shadow-sm">
          {selectedCampaignId === null ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8 text-center">
              <Mail size={36} className="text-gray-300 mb-2" />
              <p className="text-sm font-medium">Chọn một chiến dịch để xem thông tin chi tiết</p>
              <p className="text-xs text-gray-400 mt-1">Thông tin người nhận, tiến trình thực tế và các log lỗi sẽ hiển thị ở đây.</p>
            </div>
          ) : detailsLoading && !details ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
              Đang tải chi tiết chiến dịch...
            </div>
          ) : details ? (
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Header */}
              <div className="flex justify-between items-start border-b border-gray-100 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-gray-900">
                      {(() => {
                        try {
                          return JSON.parse(details.job.payload).subject;
                        } catch {
                          return "Chiến dịch email";
                        }
                      })()}
                    </h3>
                    {getStatusBadge(details.job.status)}
                  </div>
                  <div className="flex gap-4 mt-2 text-xs text-gray-500 flex-wrap">
                    <span className="flex items-center gap-1"><User size={12} /> Sale: <strong className="text-gray-700">{details.job.creator_name || "Hệ thống"}</strong></span>
                    <span className="flex items-center gap-1"><Calendar size={12} /> Bắt đầu: <strong className="text-gray-700">{new Date(details.job.created_at).toLocaleString("vi-VN")}</strong></span>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {details.job.status === "DRAFT" && (
                    <button
                      onClick={(e) => handleStartCampaign(details.job.id, e)}
                      disabled={actionLoading === details.job.id}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Play size={14} /> {actionLoading === details.job.id ? "Đang gửi..." : "Bắt đầu gửi chiến dịch"}
                    </button>
                  )}
                  <button
                    onClick={() => handleCloneCampaign(details.job)}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-semibold border border-gray-300 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus size={14} /> Gửi tiếp / Sao chép
                  </button>
                </div>
              </div>

              {/* Stats Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 text-center">
                  <span className="block text-2xl font-bold font-mono text-gray-900">
                    {details.stats.total}
                  </span>
                  <span className="text-xs text-gray-500">Tổng nhận</span>
                </div>
                <div className="bg-green-50 p-4 rounded-xl border border-green-100 text-center">
                  <span className="block text-2xl font-bold font-mono text-green-700">
                    {details.stats.completed}
                  </span>
                  <span className="text-xs text-green-600">Thành công</span>
                </div>
                <div className="bg-red-50 p-4 rounded-xl border border-red-100 text-center">
                  <span className="block text-2xl font-bold font-mono text-red-700">
                    {details.stats.failed}
                  </span>
                  <span className="text-xs text-red-600">Thất bại</span>
                </div>
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-center">
                  <span className="block text-2xl font-bold font-mono text-blue-700">
                    {details.stats.pending}
                  </span>
                  <span className="text-xs text-blue-600">Đang chờ</span>
                </div>
              </div>

              {/* HTML Content Preview */}
              <div className="space-y-2">
                <h4 className="font-semibold text-gray-800 text-sm flex items-center gap-1"><Eye size={14} /> Xem trước nội dung gửi</h4>
                <div className="p-4 bg-gray-50 text-gray-800 rounded-lg max-h-[220px] overflow-y-auto border border-gray-200 prose prose-sm max-w-none">
                  <div
                    dangerouslySetInnerHTML={{
                      __html: (() => {
                        try {
                          return JSON.parse(details.job.payload).htmlContent;
                        } catch {
                          return "Nội dung trống";
                        }
                      })(),
                    }}
                  />
                </div>
              </div>

              {/* Error Failures Log */}
              {details.failures && details.failures.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-red-600 text-sm">Danh sách email bị lỗi ({details.failures.length})</h4>
                  <div className="bg-red-50/50 rounded-lg border border-red-100 divide-y divide-red-100 max-h-[200px] overflow-y-auto font-mono text-xs">
                    {details.failures.map((f, i) => (
                      <div key={i} className="p-3 flex justify-between items-start gap-4">
                        <span className="text-red-700 font-medium">{f.to_email}</span>
                        <span className="text-gray-500 text-right">{f.error_message}</span>
                        <span className="px-1.5 py-0.5 rounded bg-gray-200/60 text-gray-500 text-[10px]">
                          Lần thử: {f.retry_count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* Compose modal for quick campaign generation (all customers or custom ids) */}
      <EmailComposeModal
        isOpen={isComposeOpen}
        onClose={() => setIsComposeOpen(false)}
        customerIds={[]} // Let it automatically fetch or alert that we need target customer IDs
        recipientCount={0}
        initialSubject={composeInitialSubject}
        initialHtmlContent={composeInitialHtmlContent}
        onSuccess={(jobId) => {
          setIsComposeOpen(false);
          fetchCampaigns();
          handleSelectCampaign(jobId);
        }}
      />
    </div>
  );
}

