export default function Loading() {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5"
      style={{ background: "#fbf6ee" }}
    >
      <span
        style={{
          display: "inline-block",
          width: 56,
          height: 56,
          flexShrink: 0,
          borderRadius: "999px",
          background: [
            "radial-gradient(circle at 35% 35%, #fff, transparent 38%)",
            "conic-gradient(from 30deg, #f4c9a8, #e8b8d1, #d9c9e8, #f4c9a8)",
          ].join(","),
          boxShadow: "0 0 0 1px rgba(60,30,20,0.07), 0 4px 14px -4px rgba(214,117,88,0.38)",
          animation: "softHaloBreathe 5s ease-in-out infinite",
        }}
        aria-hidden="true"
      />
      <p style={{ fontSize: "0.875rem", color: "#8a7e76", margin: 0 }}>Загрузка...</p>
    </div>
  );
}
