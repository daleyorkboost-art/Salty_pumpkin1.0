import { useMemo, useState } from "react";
import { ErrorState, Loading } from "../components/Status";
import { useAsync } from "../hooks/useAsync";
import { adminApi } from "../services/api";

export function AdminReviews() {
  const { loading, data, error, reload } = useAsync(() => adminApi.reviews(), []);
  const [status, setStatus] = useState("pending");
  const [busy, setBusy] = useState("");
  const visible = useMemo(
    () => (data?.reviews || []).filter((review) => status === "all" || review.status === status),
    [data?.reviews, status],
  );

  async function moderate(id, nextStatus) {
    setBusy(id);
    try {
      await adminApi.updateReview(id, { status: nextStatus });
      await reload();
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="admin-page">
      <section className="admin-hero-panel compact">
        <div>
          <p className="eyebrow">Customer trust</p>
          <h1>Review Moderation</h1>
          <p>Approve, reject, and audit customer product reviews with image and video uploads.</p>
        </div>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="all">All reviews</option>
        </select>
      </section>
      {loading && <Loading label="Loading reviews..." />}
      {error && <ErrorState message={error} />}
      <div className="review-moderation-grid">
        {visible.map((review) => (
          <article className="admin-card review-moderation-card" key={review.id}>
            <div className="panel-head">
              <div>
                <p className="eyebrow">{review.productName}</p>
                <h2>{review.rating} stars from {review.customerName}</h2>
              </div>
              <span className={`order-badge ${review.status}`}>{review.status}</span>
            </div>
            <p>{review.text}</p>
            {!!review.media?.length && (
              <div className="review-media">
                {review.media.map((item) => item.type === "video"
                  ? <video key={item.url} src={item.url} controls />
                  : <img key={item.url} src={item.url} alt="" />)}
              </div>
            )}
            <p className="muted">Submitted {formatDateTime(review.createdAt)}</p>
            <div className="table-actions">
              <button disabled={busy === review.id} onClick={() => moderate(review.id, "approved")}>Approve</button>
              <button className="secondary-action danger" disabled={busy === review.id} onClick={() => moderate(review.id, "rejected")}>Reject</button>
              {review.status !== "pending" && <button className="secondary-action" disabled={busy === review.id} onClick={() => moderate(review.id, "pending")}>Mark pending</button>}
            </div>
          </article>
        ))}
        {!visible.length && !loading && <p className="empty-state">No {status === "all" ? "" : status} reviews found.</p>}
      </div>
    </div>
  );
}

function formatDateTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("en-IN");
}
