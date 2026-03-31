export default function MarketCard({
  title,
  probability,
  category,
}: {
  title: string;
  probability: number;
  category: string;
}) {
  return (
    <div
      style={{
        padding: 18,
        border: "1px solid #334155",
        borderRadius: 16,
        background: "#0f172a",
        display: "flex",
        justifyContent: "space-between",
        gap: 16,
      }}
    >
      <div>
        <strong style={{ display: "block", marginBottom: 6 }}>{title}</strong>
        <span style={{ color: "#94a3b8" }}>{category}</span>
      </div>
      <div style={{ fontWeight: 800, color: "#34d399" }}>{probability}%</div>
    </div>
  );
}
