export default function Header() {
  return (
    <header
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "20px 0",
      }}
    >
      <strong style={{ fontSize: "1.1rem" }}>HF-Arenas</strong>
      <nav style={{ display: "flex", gap: 16, opacity: 0.8 }}>
        <a href="#markets">Markets</a>
        <a href="#topics">Topics</a>
        <a href="#api">API</a>
      </nav>
    </header>
  );
}
