export function Loading({ label = "Loading..." }) {
  return <div className="center-panel">{label}</div>;
}

export function ErrorState({ message, action }) {
  return (
    <div className="center-panel error-panel">
      <strong>{message}</strong>
      {action}
    </div>
  );
}

export function EmptyState({ title, children }) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      {children}
    </div>
  );
}
