import { useState, useRef } from "react";

const COLORS = [
  { bg: "#FF6B35", light: "#FFF0EB", text: "#FF6B35" },
  { bg: "#2EC4B6", light: "#E8FAFA", text: "#2EC4B6" },
  { bg: "#9B5DE5", light: "#F3ECFD", text: "#9B5DE5" },
  { bg: "#F7B731", light: "#FEF9E7", text: "#F7B731" },
  { bg: "#E84393", light: "#FDEEF6", text: "#E84393" },
];

const SYSTEM_PROMPT = `Você é um especialista em logística e otimização de rotas de entrega no Brasil.

O usuário vai te enviar uma imagem com uma lista de entregas contendo endereços e janelas de horário.

Sua tarefa é:
1. Extrair todos os endereços, horários de início e fim, e produto de cada entrega
2. Para cada motorista, montar a rota mais eficiente respeitando OBRIGATORIAMENTE as janelas de horário (isso tem prioridade absoluta sobre distância)
3. Retornar SOMENTE um JSON válido, sem markdown, sem texto extra

REGRA CRÍTICA: SEMPRE verifique as janelas de horário ANTES de otimizar por proximidade. Uma entrega com janela mais cedo pode estar mais longe, mas deve ser feita primeiro.

Formato de resposta (JSON puro, sem backticks):
{
  "motoristas": [
    {
      "id": 1,
      "nome": "Motorista 1",
      "ponto_partida": "endereço de partida",
      "hora_saida": "17:00",
      "entregas": [
        {
          "ordem": 1,
          "numero": 19,
          "endereco": "Alameda Dos Judiciários, 151 - Cândida Ferreira",
          "produto": "Maleta Premium",
          "janela_inicio": "17:00",
          "janela_fim": "21:00",
          "chegada_prevista": "17:35",
          "km_anterior": 22,
          "tempo_anterior_min": 35,
          "status": "ok"
        }
      ],
      "km_total": 95,
      "tempo_total_min": 180
    }
  ],
  "alertas": ["Entrega #26 fora da janela de horário - chegada prevista 21:20, janela até 20:30"]
}

O campo status deve ser "ok" se dentro da janela, ou "atrasado" se fora.
Distribua as entregas entre os motoristas de forma inteligente, respeitando os horários.
Se não souber o ponto de partida exato, use o que foi fornecido ou "Belo Horizonte, MG" como padrão.`;

export default function AgenteRotas() {
  const [motoristas, setMotoristas] = useState([{ id: 1, nome: "Motorista 1", partida: "", horaSaida: "17:00" }]);
  const [imagem, setImagem] = useState(null);
  const [imagemBase64, setImagemBase64] = useState(null);
  const [imagemType, setImagemType] = useState("image/png");
  const [resultado, setResultado] = useState(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState(null);
  const [step, setStep] = useState("config");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const fileRef = useRef();

  const addMotorista = () => {
    const id = Date.now();
    const num = motoristas.length + 1;
    setMotoristas([...motoristas, { id, nome: `Motorista ${num}`, partida: "", horaSaida: "17:00" }]);
  };

  const removeMotorista = (id) => {
    if (motoristas.length === 1) return;
    setMotoristas(motoristas.filter((m) => m.id !== id));
  };

  const updateMotorista = (id, field, value) => {
    setMotoristas(motoristas.map((m) => (m.id === id ? { ...m, [field]: value } : m)));
  };

  const handleImagem = (file) => {
    if (!file) return;
    setImagem(URL.createObjectURL(file));
    setImagemType(file.type || "image/png");
    const reader = new FileReader();
    reader.onload = (e) => setImagemBase64(e.target.result.split(",")[1]);
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleImagem(file);
  };

  const gerarRotas = async () => {
    if (!imagemBase64) { setErro("Por favor, adicione a imagem da lista de entregas."); return; }
    if (!apiKey.trim()) { setErro("Por favor, insira sua chave da API Anthropic."); return; }
    setLoading(true);
    setErro(null);

    const motoristaInfo = motoristas.map(m =>
      `${m.nome}: partida de "${m.partida || "Belo Horizonte, MG"}" às ${m.horaSaida}`
    ).join("\n");

    const userMessage = `Temos ${motoristas.length} motorista(s):\n${motoristaInfo}\n\nAnalise a imagem com a lista de entregas e monte a rota otimizada para cada motorista, respeitando obrigatoriamente as janelas de horário.`;

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey.trim(),
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4000,
          system: SYSTEM_PROMPT,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: imagemType, data: imagemBase64 } },
              { type: "text", text: userMessage }
            ]
          }]
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error?.message || "Erro na API");
      }

      const data = await response.json();
      const text = data.content?.map(i => i.text || "").join("") || "";
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setResultado(parsed);
      setStep("resultado");
    } catch (err) {
      setErro("Erro: " + err.message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const statusColor = (status) => status === "atrasado" ? "#FF3B30" : "#34C759";
  const statusLabel = (status) => status === "atrasado" ? "⚠️ Fora do prazo" : "✅ No prazo";
  const getMapsUrl = (endereco) =>
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco + ", Belo Horizonte, MG")}`;

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0A0A0F",
      fontFamily: "'DM Sans', sans-serif",
      color: "#F0EEE8",
      position: "relative",
      overflow: "hidden"
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />

      <div style={{
        position: "fixed", inset: 0, zIndex: 0,
        backgroundImage: "linear-gradient(rgba(255,107,53,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,107,53,0.04) 1px, transparent 1px)",
        backgroundSize: "40px 40px"
      }} />
      <div style={{
        position: "fixed", top: "-200px", left: "50%", transform: "translateX(-50%)",
        width: "600px", height: "400px",
        background: "radial-gradient(circle, rgba(255,107,53,0.12) 0%, transparent 70%)",
        zIndex: 0, pointerEvents: "none"
      }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: "900px", margin: "0 auto", padding: "40px 24px" }}>

        {/* Header */}
        <div style={{ marginBottom: "48px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
            <div style={{
              width: "36px", height: "36px", borderRadius: "10px",
              background: "linear-gradient(135deg, #FF6B35, #FF3B7A)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "18px"
            }}>🗺️</div>
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "11px", color: "#FF6B35", letterSpacing: "3px", textTransform: "uppercase" }}>
              Route Agent v1.0
            </span>
          </div>
          <h1 style={{ fontSize: "38px", fontWeight: "700", margin: 0, lineHeight: 1.1, letterSpacing: "-1px" }}>
            DG — O<br /><span style={{ color: "#FF6B35" }}>Montador de Rotas</span>
          </h1>
          <p style={{ marginTop: "12px", color: "#888", fontSize: "15px", fontWeight: "300" }}>
            Envie o print da lista de entregas · A IA monta a rota respeitando os horários
          </p>
        </div>

        {step === "config" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>

            {/* API Key */}
            <div>
              <label style={{ fontSize: "12px", fontFamily: "'Space Mono', monospace", color: "#FF6B35", letterSpacing: "2px", textTransform: "uppercase", display: "block", marginBottom: "12px" }}>
                00 — Chave API Anthropic
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showKey ? "text" : "password"}
                  placeholder="sk-ant-..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  style={{
                    width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid #2A2A3E",
                    borderRadius: "10px", padding: "12px 48px 12px 16px", color: "#F0EEE8",
                    fontSize: "14px", outline: "none", fontFamily: "'Space Mono', monospace",
                    boxSizing: "border-box"
                  }}
                />
                <button onClick={() => setShowKey(!showKey)} style={{
                  position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: "16px"
                }}>{showKey ? "🙈" : "👁️"}</button>
              </div>
              <p style={{ margin: "6px 0 0", fontSize: "11px", color: "#555" }}>
                Obtenha em console.anthropic.com · Nunca é salva, fica só no seu navegador
              </p>
            </div>

            {/* Upload */}
            <div>
              <label style={{ fontSize: "12px", fontFamily: "'Space Mono', monospace", color: "#FF6B35", letterSpacing: "2px", textTransform: "uppercase", display: "block", marginBottom: "12px" }}>
                01 — Lista de Entregas (Print)
              </label>
              <div
                onClick={() => fileRef.current.click()}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                style={{
                  border: imagem ? "2px solid #FF6B35" : "2px dashed #333",
                  borderRadius: "16px",
                  padding: imagem ? "0" : "48px 24px",
                  textAlign: "center",
                  cursor: "pointer",
                  background: imagem ? "transparent" : "rgba(255,107,53,0.03)",
                  overflow: "hidden",
                  minHeight: imagem ? "200px" : "auto",
                  position: "relative"
                }}
              >
                {imagem ? (
                  <>
                    <img src={imagem} alt="Lista" style={{ width: "100%", borderRadius: "14px", display: "block" }} />
                    <div style={{
                      position: "absolute", bottom: "12px", right: "12px",
                      background: "#FF6B35", color: "#fff", borderRadius: "8px",
                      padding: "6px 12px", fontSize: "12px", fontWeight: "600"
                    }}>Trocar imagem</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: "32px", marginBottom: "12px" }}>📋</div>
                    <p style={{ margin: 0, color: "#888", fontSize: "14px" }}>Arraste o print aqui ou clique para selecionar</p>
                    <p style={{ margin: "4px 0 0", color: "#555", fontSize: "12px" }}>PNG, JPG, JPEG</p>
                  </>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleImagem(e.target.files[0])} />
            </div>

            {/* Motoristas */}
            <div>
              <label style={{ fontSize: "12px", fontFamily: "'Space Mono', monospace", color: "#FF6B35", letterSpacing: "2px", textTransform: "uppercase", display: "block", marginBottom: "12px" }}>
                02 — Motoristas
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {motoristas.map((m, i) => (
                  <div key={m.id} style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid #1E1E2E",
                    borderRadius: "14px",
                    padding: "16px 20px",
                    display: "grid",
                    gridTemplateColumns: "40px 1fr auto 120px 36px",
                    gap: "12px",
                    alignItems: "center"
                  }}>
                    <div style={{
                      width: "32px", height: "32px", borderRadius: "8px",
                      background: COLORS[i % COLORS.length].bg,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontFamily: "'Space Mono', monospace", fontSize: "12px", fontWeight: "700", color: "#fff"
                    }}>{i + 1}</div>
                    <input
                      placeholder={`Nome (ex: João)`}
                      value={m.nome}
                      onChange={(e) => updateMotorista(m.id, "nome", e.target.value)}
                      style={{
                        background: "rgba(255,255,255,0.05)", border: "1px solid #2A2A3E",
                        borderRadius: "8px", padding: "8px 12px", color: "#F0EEE8",
                        fontSize: "13px", outline: "none", fontFamily: "'DM Sans', sans-serif"
                      }}
                    />
                    <input
                      placeholder="Endereço de partida"
                      value={m.partida}
                      onChange={(e) => updateMotorista(m.id, "partida", e.target.value)}
                      style={{
                        background: "rgba(255,255,255,0.05)", border: "1px solid #2A2A3E",
                        borderRadius: "8px", padding: "8px 12px", color: "#F0EEE8",
                        fontSize: "13px", outline: "none", fontFamily: "'DM Sans', sans-serif",
                        minWidth: "220px"
                      }}
                    />
                    <input
                      type="time"
                      value={m.horaSaida}
                      onChange={(e) => updateMotorista(m.id, "horaSaida", e.target.value)}
                      style={{
                        background: "rgba(255,255,255,0.05)", border: "1px solid #2A2A3E",
                        borderRadius: "8px", padding: "8px 12px", color: "#F0EEE8",
                        fontSize: "13px", outline: "none", fontFamily: "'Space Mono', monospace"
                      }}
                    />
                    <button
                      onClick={() => removeMotorista(m.id)}
                      style={{
                        width: "36px", height: "36px", borderRadius: "8px",
                        background: "rgba(255,59,48,0.1)", border: "none",
                        color: "#FF3B30", cursor: "pointer", fontSize: "18px",
                        display: "flex", alignItems: "center", justifyContent: "center"
                      }}
                    >×</button>
                  </div>
                ))}
                <button onClick={addMotorista} style={{
                  background: "transparent", border: "1px dashed #333",
                  borderRadius: "12px", padding: "12px", color: "#666",
                  cursor: "pointer", fontSize: "13px", fontFamily: "'DM Sans', sans-serif"
                }}>+ Adicionar motorista</button>
              </div>
            </div>

            {erro && (
              <div style={{ background: "rgba(255,59,48,0.1)", border: "1px solid rgba(255,59,48,0.3)", borderRadius: "10px", padding: "12px 16px", color: "#FF3B30", fontSize: "13px" }}>
                {erro}
              </div>
            )}

            <button
              onClick={gerarRotas}
              disabled={loading}
              style={{
                background: loading ? "#333" : "linear-gradient(135deg, #FF6B35, #FF3B7A)",
                border: "none", borderRadius: "14px", padding: "18px 32px",
                color: "#fff", fontSize: "15px", fontWeight: "700",
                cursor: loading ? "not-allowed" : "pointer",
                fontFamily: "'DM Sans', sans-serif",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
                transition: "all 0.2s", letterSpacing: "-0.3px"
              }}
            >
              {loading ? (
                <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>⟳</span>
                  Processando entregas com IA...
                </span>
              ) : "🚀 Gerar Rotas Otimizadas"}
            </button>
          </div>
        )}

        {step === "resultado" && resultado && (
          <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>

            {resultado.alertas?.length > 0 && (
              <div style={{ background: "rgba(255,183,0,0.08)", border: "1px solid rgba(255,183,0,0.3)", borderRadius: "14px", padding: "16px 20px" }}>
                <p style={{ margin: "0 0 8px", fontFamily: "'Space Mono', monospace", fontSize: "11px", color: "#F7B731", letterSpacing: "2px" }}>⚠️ ALERTAS</p>
                {resultado.alertas.map((a, i) => (
                  <p key={i} style={{ margin: "4px 0", fontSize: "13px", color: "#FFD060" }}>{a}</p>
                ))}
              </div>
            )}

            {resultado.motoristas?.map((m, mi) => {
              const cor = COLORS[mi % COLORS.length];
              return (
                <div key={m.id} style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${cor.bg}33`, borderRadius: "20px", overflow: "hidden" }}>
                  <div style={{ background: `${cor.bg}15`, borderBottom: `1px solid ${cor.bg}33`, padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: cor.bg }} />
                        <span style={{ fontWeight: "700", fontSize: "17px" }}>{m.nome}</span>
                      </div>
                      <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#888" }}>
                        📍 {m.ponto_partida} · Saída {m.hora_saida}
                      </p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ margin: 0, fontFamily: "'Space Mono', monospace", fontSize: "20px", fontWeight: "700", color: cor.bg }}>{m.km_total} km</p>
                      <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#888" }}>{Math.floor(m.tempo_total_min / 60)}h{m.tempo_total_min % 60}min no total</p>
                    </div>
                  </div>

                  <div style={{ padding: "8px 0" }}>
                    {m.entregas?.map((e, ei) => (
                      <div key={ei} style={{
                        padding: "16px 24px",
                        borderBottom: ei < m.entregas.length - 1 ? "1px solid #1A1A28" : "none",
                        display: "grid",
                        gridTemplateColumns: "40px 1fr auto",
                        gap: "16px",
                        alignItems: "start"
                      }}>
                        <div style={{
                          width: "36px", height: "36px", borderRadius: "10px",
                          background: `${cor.bg}20`, border: `1px solid ${cor.bg}40`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontFamily: "'Space Mono', monospace", fontSize: "12px", fontWeight: "700", color: cor.bg
                        }}>{e.ordem}</div>

                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "11px", color: "#666" }}>#{e.numero}</span>
                            <a href={getMapsUrl(e.endereco)} target="_blank" rel="noopener noreferrer"
                              style={{ color: "#F0EEE8", fontWeight: "500", fontSize: "14px", textDecoration: "none", borderBottom: "1px solid #333" }}>
                              {e.endereco}
                            </a>
                          </div>
                          <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#888" }}>{e.produto}</p>
                          {ei > 0 && (
                            <p style={{ margin: "4px 0 0", fontSize: "11px", color: "#555", fontFamily: "'Space Mono', monospace" }}>
                              ↑ {e.km_anterior} km · {e.tempo_anterior_min} min do anterior
                            </p>
                          )}
                        </div>

                        <div style={{ textAlign: "right", minWidth: "110px" }}>
                          <p style={{ margin: 0, fontFamily: "'Space Mono', monospace", fontSize: "15px", fontWeight: "700", color: "#F0EEE8" }}>{e.chegada_prevista}</p>
                          <p style={{ margin: "2px 0", fontSize: "11px", color: "#666" }}>janela {e.janela_inicio}–{e.janela_fim}</p>
                          <span style={{
                            fontSize: "10px", fontWeight: "600", padding: "2px 8px", borderRadius: "20px",
                            background: e.status === "atrasado" ? "rgba(255,59,48,0.15)" : "rgba(52,199,89,0.15)",
                            color: statusColor(e.status)
                          }}>{statusLabel(e.status)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            <button
              onClick={() => { setStep("config"); setResultado(null); }}
              style={{
                background: "transparent", border: "1px solid #333", borderRadius: "12px",
                padding: "14px", color: "#888", cursor: "pointer", fontSize: "13px",
                fontFamily: "'DM Sans', sans-serif"
              }}
            >← Nova rota</button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input::placeholder { color: #444; }
        input[type="time"]::-webkit-calendar-picker-indicator { filter: invert(0.5); }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  );
}
