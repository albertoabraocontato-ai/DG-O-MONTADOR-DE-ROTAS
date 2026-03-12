import { useState, useRef, useEffect } from "react";

// ─── Storage helpers (localStorage for persistence) ───────────────────────
const STORAGE_KEY = "dg_memoria";

function carregarMemoria() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { regras: [], rotasAprovadas: [], correcoes: [] };
  } catch { return { regras: [], rotasAprovadas: [], correcoes: [] }; }
}

function salvarMemoria(mem) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(mem));
}

// ─── Colors ───────────────────────────────────────────────────────────────
const CORES = [
  "#FF6B35", "#2EC4B6", "#9B5DE5", "#F7B731", "#E84393"
];

// ─── Build system prompt with accumulated memory ──────────────────────────
function buildSystemPrompt(memoria) {
  const regrasTexto = memoria.regras.length > 0
    ? memoria.regras.map((r, i) => `${i + 1}. ${r}`).join("\n")
    : "Nenhuma regra personalizada ainda.";

  const exemploTexto = memoria.rotasAprovadas.length > 0
    ? memoria.rotasAprovadas.slice(-3).map((r, i) =>
        `Exemplo ${i + 1}: ${r.resumo}`
      ).join("\n")
    : "Nenhuma rota aprovada ainda.";

  const correcoesTexto = memoria.correcoes.length > 0
    ? memoria.correcoes.slice(-5).map((c, i) =>
        `Correção ${i + 1}: ${c}`
      ).join("\n")
    : "Nenhuma correção registrada ainda.";

  return `Você é o DG — O Montador de Rotas. Treinado pelo dono da operação para montar rotas EXATAMENTE como ele pensa.

AVISO CRÍTICO: Você NÃO deve listar os endereços na ordem que recebeu. Você DEVE reorganizar completamente a ordem das entregas. Isso é obrigatório.

PONTO DE PARTIDA FIXO: Rua Manoel Lopes Coelho, 174 - Itapoã, Belo Horizonte, MG.

PROCESSO OBRIGATÓRIO — EXECUTE ESSES PASSOS ANTES DE MONTAR A ROTA:

PASSO 1 - IDENTIFIQUE AS REGIÕES:
Para cada endereço, identifique em qual região de BH/Grande BH ele fica.
Sabará = Leste extremo (longe de tudo, priorizar se janela apertada)
Vespasiano = Norte extremo
Contagem = Oeste
Prado/Buritis/Lourdes/Ouro Preto = Sul-Oeste
Gutierrez/Funcionários/Santa Efigênia = Centro-Sul
Floresta/Coração Eucarístico = Centro-Norte
Boa Vista/Cachoeirinha/Sagrada Família = Norte de BH
Riacho das Pedras = Contagem (Oeste)

PASSO 2 - FORME BLOCOS POR HORÁRIO DE INÍCIO:
Bloco 06h = entregas com janela iniciando às 06:00
Bloco 07h = entregas com janela iniciando às 07:00
Bloco 08h = entregas com janela iniciando às 08:00
Bloco 09h = entregas com janela iniciando às 09:00
Bloco 10h = entregas com janela iniciando às 10:00

PASSO 3 - ORDENE OS BLOCOS DO MAIS CEDO AO MAIS TARDE:
NUNCA coloque entrega do bloco 08h antes de entrega do bloco 07h.

PASSO 4 - DENTRO DE CADA BLOCO, ORDENE POR PROXIMIDADE GEOGRÁFICA:
O motorista deve avançar em linha contínua, sem voltar para trás.
Exemplo CORRETO bloco 07h: Gutierrez → Funcionários → Santa Efigênia → Floresta (sul→norte)
Exemplo ERRADO: Gutierrez → Floresta → Funcionários (zigue-zague)

PASSO 5 - TRATE ENDEREÇOS MUITO DISTANTES:
Sabará, Vespasiano e outros municípios distantes devem ser entregues PRIMEIRO se a janela permitir, antes de iniciar a rota em BH. Nunca coloque Sabará no meio de uma rota de BH.

PASSO 6 - CALCULE O HORÁRIO DE SAÍDA IDEAL:
Calcule para chegar na primeira entrega exatamente no início da janela. Se chegar antes, aguarda no local — isso é correto.

EXEMPLO VALIDADO PELO DONO:
Lista recebida (aleatória): Gutierrez 07h, Cachoeirinha 09h, Floresta 07h, Boa Vista 08h, Funcionários 07h, Sagrada Família 09h, Santa Efigênia 07h
Rota CORRETA: Itapoã 06:10 → Gutierrez 07:00 → Funcionários 07:20 → Santa Efigênia 07:35 → Floresta 07:50 → Boa Vista 08:00 → Sagrada Família 09:00 → Cachoeirinha 09:35
Princípio: blocos por horário de início, geografia dentro do bloco, linha contínua.

REGRAS APRENDIDAS COM O DONO:
${regrasTexto}

CORREÇÕES REGISTRADAS:
${correcoesTexto}

EXEMPLOS DE ROTAS APROVADAS:
${exemploTexto}

FORMATO DE RESPOSTA — Retorne SOMENTE JSON válido, sem markdown, sem texto extra.
O campo "ordem" DEVE refletir a nova ordem reorganizada, não a ordem original:
{
  "motoristas": [
    {
      "id": 1,
      "nome": "Motorista 1",
      "ponto_partida": "Rua Manoel Lopes Coelho, 174 - Itapoã, BH",
      "hora_saida": "06:10",
      "zona": "BH Centro/Norte",
      "entregas": [
        {
          "ordem": 1,
          "numero": 2,
          "endereco": "Rua Marechal Bitencourt, 212 - Gutierrez",
          "produto": "Box Luxo",
          "janela_inicio": "07:00",
          "janela_fim": "09:00",
          "chegada_prevista": "07:00",
          "aguarda": false,
          "km_anterior": 15,
          "tempo_anterior_min": 50,
          "status": "ok"
        }
      ],
      "km_total": 60,
      "tempo_total_min": 240
    }
  ],
  "alertas": [],
  "raciocinio": "Descreva os blocos que formou e a ordem geográfica escolhida dentro de cada bloco"
}

Status: ok se dentro da janela, atrasado se fora. aguarda: true se chega antes da janela abrir.`;

// ─── Build feedback prompt ────────────────────────────────────────────────
function buildFeedbackPrompt(rotaAtual, feedback, memoria) {
  return `Você é o DG — O Montador de Rotas. 

O dono da operação deu o seguinte feedback sobre a rota que você montou:
"${feedback}"

Rota atual:
${JSON.stringify(rotaAtual, null, 2)}

Com base no feedback, faça os ajustes necessários e retorne:
1. A rota corrigida no mesmo formato JSON
2. A regra aprendida com essa correção (em 1-2 frases objetivas)

Responda SOMENTE em JSON:
{
  "rotaCorrigida": { ...mesmo formato da rota... },
  "regraAprendida": "Nunca colocar X junto com Y porque..."
}`;
}

// ─── Main Component ───────────────────────────────────────────────────────
export default function DGMontadorRotas() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("dg_apikey") || "");
  const [showKey, setShowKey] = useState(false);
  const [imagem, setImagem] = useState(null);
  const [imagemBase64, setImagemBase64] = useState(null);
  const [imagemType, setImagemType] = useState("image/png");
  const [motoristas, setMotoristas] = useState([{ id: 1, nome: "Motorista 1", partida: "Rua Manoel Lopes Coelho, 174 - Itapoã, BH" }]);
  const [resultado, setResultado] = useState(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState(null);
  const [step, setStep] = useState("config");
  const [feedback, setFeedback] = useState("");
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [memoria, setMemoria] = useState(carregarMemoria);
  const [showMemoria, setShowMemoria] = useState(false);
  const [feedbackEnviado, setFeedbackEnviado] = useState(null);
  const fileRef = useRef();

  useEffect(() => {
    if (apiKey) localStorage.setItem("dg_apikey", apiKey);
  }, [apiKey]);

  const addMotorista = () => {
    setMotoristas([...motoristas, {
      id: Date.now(),
      nome: `Motorista ${motoristas.length + 1}`,
      partida: "Rua Manoel Lopes Coelho, 174 - Itapoã, BH"
    }]);
  };

  const removeMotorista = (id) => {
    if (motoristas.length === 1) return;
    setMotoristas(motoristas.filter(m => m.id !== id));
  };

  const updateMotorista = (id, field, value) => {
    setMotoristas(motoristas.map(m => m.id === id ? { ...m, [field]: value } : m));
  };

  const handleImagem = (file) => {
    if (!file) return;
    setImagem(URL.createObjectURL(file));
    setImagemType(file.type || "image/png");
    const reader = new FileReader();
    reader.onload = (e) => setImagemBase64(e.target.result.split(",")[1]);
    reader.readAsDataURL(file);
  };

  const gerarRota = async () => {
    if (!imagemBase64) { setErro("Adicione o print da lista de entregas."); return; }
    if (!apiKey.trim()) { setErro("Insira sua chave API Anthropic."); return; }
    setLoading(true); setErro(null);

    const motInfo = motoristas.map(m =>
      `${m.nome}: partida de "${m.partida}"`
    ).join("\n");

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
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
          system: buildSystemPrompt(memoria),
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: imagemType, data: imagemBase64 } },
              { type: "text", text: `Temos ${motoristas.length} motorista(s):\n${motInfo}\n\nMonte a rota seguindo rigorosamente os princípios que você aprendeu.` }
            ]
          }]
        })
      });

      if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || "Erro na API"); }
      const data = await res.json();
      const text = data.content?.map(i => i.text || "").join("") || "";
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setResultado(parsed);
      setStep("resultado");
    } catch (e) {
      setErro("Erro: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const aprovarRota = () => {
    const resumo = resultado.motoristas.map(m =>
      `${m.nome} (${m.zona}): ${m.entregas.map(e => e.endereco.split("-")[0].trim()).join(" → ")}`
    ).join(" | ");

    const novaMemoria = {
      ...memoria,
      rotasAprovadas: [...memoria.rotasAprovadas, {
        resumo,
        data: new Date().toLocaleDateString("pt-BR"),
        raciocinio: resultado.raciocinio
      }]
    };
    setMemoria(novaMemoria);
    salvarMemoria(novaMemoria);
    alert("✅ Rota aprovada e salva na memória do DG!");
  };

  const enviarFeedback = async () => {
    if (!feedback.trim()) return;
    setLoadingFeedback(true);

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
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
          messages: [{
            role: "user",
            content: buildFeedbackPrompt(resultado, feedback, memoria)
          }]
        })
      });

      const data = await res.json();
      const text = data.content?.map(i => i.text || "").join("") || "";
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);

      // Salva correção e regra na memória
      const novaMemoria = {
        ...memoria,
        correcoes: [...memoria.correcoes, `Feedback: "${feedback}" → Regra: ${parsed.regraAprendida}`],
        regras: [...memoria.regras, parsed.regraAprendida]
      };
      setMemoria(novaMemoria);
      salvarMemoria(novaMemoria);

      setResultado(parsed.rotaCorrigida);
      setFeedbackEnviado(`✅ Rota corrigida! Aprendi: "${parsed.regraAprendida}"`);
      setFeedback("");
    } catch (e) {
      setErro("Erro ao processar feedback: " + e.message);
    } finally {
      setLoadingFeedback(false);
    }
  };

  const limparMemoria = () => {
    if (confirm("Tem certeza? Isso apaga todo o aprendizado do DG.")) {
      const m = { regras: [], rotasAprovadas: [], correcoes: [] };
      setMemoria(m);
      salvarMemoria(m);
    }
  };

  const statusColor = (s) => s === "atrasado" ? "#FF3B30" : "#34C759";

  return (
    <div style={{ minHeight: "100vh", background: "#080810", fontFamily: "'DM Sans', sans-serif", color: "#F0EEE8" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;0,700;0,900;1,400&family=Bebas+Neue&display=swap" rel="stylesheet" />

      {/* Background */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, background: "radial-gradient(ellipse at 20% 20%, rgba(255,107,53,0.08) 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, rgba(46,196,182,0.06) 0%, transparent 50%)" }} />
      <div style={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: "linear-gradient(rgba(255,107,53,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,107,53,0.03) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: "960px", margin: "0 auto", padding: "40px 24px" }}>

        {/* Header */}
        <div style={{ marginBottom: "48px", borderBottom: "1px solid #1A1A2E", paddingBottom: "32px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <p style={{ margin: "0 0 4px", fontFamily: "'Bebas Neue', sans-serif", fontSize: "13px", color: "#FF6B35", letterSpacing: "4px" }}>SISTEMA DE ROTAS INTELIGENTE</p>
              <h1 style={{ margin: 0, fontFamily: "'Bebas Neue', sans-serif", fontSize: "64px", lineHeight: 0.9, letterSpacing: "2px" }}>
                DG <span style={{ color: "#FF6B35" }}>—</span><br />
                <span style={{ color: "#FF6B35" }}>O MONTADOR</span><br />
                DE ROTAS
              </h1>
              <p style={{ margin: "16px 0 0", color: "#666", fontSize: "14px" }}>
                {memoria.regras.length} regras aprendidas · {memoria.rotasAprovadas.length} rotas aprovadas · {memoria.correcoes.length} correções
              </p>
            </div>
            <button onClick={() => setShowMemoria(!showMemoria)} style={{
              background: "rgba(255,107,53,0.1)", border: "1px solid rgba(255,107,53,0.3)",
              borderRadius: "12px", padding: "10px 16px", color: "#FF6B35",
              cursor: "pointer", fontSize: "12px", fontFamily: "'DM Sans', sans-serif",
              fontWeight: "600", letterSpacing: "1px"
            }}>🧠 MEMÓRIA</button>
          </div>
        </div>

        {/* Memória Panel */}
        {showMemoria && (
          <div style={{ background: "rgba(255,107,53,0.05)", border: "1px solid rgba(255,107,53,0.2)", borderRadius: "16px", padding: "24px", marginBottom: "32px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ margin: 0, fontFamily: "'Bebas Neue'", fontSize: "20px", color: "#FF6B35", letterSpacing: "2px" }}>🧠 MEMÓRIA DO DG</h3>
              <button onClick={limparMemoria} style={{ background: "rgba(255,59,48,0.1)", border: "1px solid rgba(255,59,48,0.3)", borderRadius: "8px", padding: "6px 12px", color: "#FF3B30", cursor: "pointer", fontSize: "11px" }}>Limpar tudo</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
              <div>
                <p style={{ margin: "0 0 10px", fontSize: "11px", color: "#FF6B35", letterSpacing: "2px", textTransform: "uppercase" }}>Regras aprendidas</p>
                {memoria.regras.length === 0 ? <p style={{ color: "#444", fontSize: "13px" }}>Nenhuma ainda</p> :
                  memoria.regras.map((r, i) => (
                    <div key={i} style={{ background: "rgba(255,255,255,0.03)", borderRadius: "8px", padding: "8px 12px", marginBottom: "6px", fontSize: "12px", color: "#aaa", borderLeft: "2px solid #FF6B35" }}>{r}</div>
                  ))}
              </div>
              <div>
                <p style={{ margin: "0 0 10px", fontSize: "11px", color: "#2EC4B6", letterSpacing: "2px", textTransform: "uppercase" }}>Rotas aprovadas</p>
                {memoria.rotasAprovadas.length === 0 ? <p style={{ color: "#444", fontSize: "13px" }}>Nenhuma ainda</p> :
                  memoria.rotasAprovadas.map((r, i) => (
                    <div key={i} style={{ background: "rgba(255,255,255,0.03)", borderRadius: "8px", padding: "8px 12px", marginBottom: "6px", fontSize: "12px", color: "#aaa", borderLeft: "2px solid #2EC4B6" }}>
                      <span style={{ color: "#666", fontSize: "10px" }}>{r.data} · </span>{r.resumo}
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {step === "config" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

            {/* API Key */}
            <div>
              <label style={{ fontSize: "11px", fontFamily: "'Bebas Neue'", color: "#FF6B35", letterSpacing: "3px", display: "block", marginBottom: "10px" }}>00 — CHAVE API ANTHROPIC</label>
              <div style={{ position: "relative" }}>
                <input type={showKey ? "text" : "password"} placeholder="sk-ant-..." value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid #1E1E2E", borderRadius: "10px", padding: "12px 48px 12px 16px", color: "#F0EEE8", fontSize: "14px", outline: "none", fontFamily: "monospace", boxSizing: "border-box" }} />
                <button onClick={() => setShowKey(!showKey)} style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#555", cursor: "pointer" }}>{showKey ? "🙈" : "👁️"}</button>
              </div>
              <p style={{ margin: "6px 0 0", fontSize: "11px", color: "#444" }}>Salva automaticamente no seu navegador</p>
            </div>

            {/* Upload */}
            <div>
              <label style={{ fontSize: "11px", fontFamily: "'Bebas Neue'", color: "#FF6B35", letterSpacing: "3px", display: "block", marginBottom: "10px" }}>01 — PRINT DA LISTA DE ENTREGAS</label>
              <div onClick={() => fileRef.current.click()} onDrop={e => { e.preventDefault(); handleImagem(e.dataTransfer.files[0]); }} onDragOver={e => e.preventDefault()}
                style={{ border: imagem ? "2px solid #FF6B35" : "2px dashed #222", borderRadius: "16px", padding: imagem ? 0 : "40px 24px", textAlign: "center", cursor: "pointer", background: "rgba(255,107,53,0.02)", overflow: "hidden", minHeight: imagem ? "200px" : "auto", position: "relative" }}>
                {imagem ? (
                  <>
                    <img src={imagem} alt="Lista" style={{ width: "100%", borderRadius: "14px", display: "block" }} />
                    <div style={{ position: "absolute", bottom: "12px", right: "12px", background: "#FF6B35", color: "#fff", borderRadius: "8px", padding: "6px 12px", fontSize: "12px", fontWeight: "700" }}>Trocar</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: "28px", marginBottom: "8px" }}>📋</div>
                    <p style={{ margin: 0, color: "#555", fontSize: "14px" }}>Arraste o print ou clique para selecionar</p>
                  </>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleImagem(e.target.files[0])} />
            </div>

            {/* Motoristas */}
            <div>
              <label style={{ fontSize: "11px", fontFamily: "'Bebas Neue'", color: "#FF6B35", letterSpacing: "3px", display: "block", marginBottom: "10px" }}>02 — MOTORISTAS</label>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {motoristas.map((m, i) => (
                  <div key={m.id} style={{ display: "grid", gridTemplateColumns: "36px 1fr 36px", gap: "10px", alignItems: "center", background: "rgba(255,255,255,0.02)", border: "1px solid #1A1A2E", borderRadius: "12px", padding: "12px 16px" }}>
                    <div style={{ width: "28px", height: "28px", borderRadius: "8px", background: CORES[i % CORES.length], display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: "900", color: "#fff" }}>{i + 1}</div>
                    <input placeholder="Nome do motorista" value={m.nome} onChange={e => updateMotorista(m.id, "nome", e.target.value)}
                      style={{ background: "transparent", border: "none", color: "#F0EEE8", fontSize: "14px", outline: "none", fontFamily: "'DM Sans'" }} />
                    <button onClick={() => removeMotorista(m.id)} style={{ width: "28px", height: "28px", borderRadius: "6px", background: "rgba(255,59,48,0.1)", border: "none", color: "#FF3B30", cursor: "pointer", fontSize: "16px" }}>×</button>
                  </div>
                ))}
                <button onClick={addMotorista} style={{ background: "transparent", border: "1px dashed #222", borderRadius: "10px", padding: "10px", color: "#555", cursor: "pointer", fontSize: "13px" }}>+ Adicionar motorista</button>
              </div>
            </div>

            {erro && <div style={{ background: "rgba(255,59,48,0.1)", border: "1px solid rgba(255,59,48,0.3)", borderRadius: "10px", padding: "12px 16px", color: "#FF3B30", fontSize: "13px" }}>{erro}</div>}

            <button onClick={gerarRota} disabled={loading} style={{
              background: loading ? "#1A1A2E" : "linear-gradient(135deg, #FF6B35 0%, #FF3B7A 100%)",
              border: "none", borderRadius: "14px", padding: "20px",
              color: "#fff", fontSize: "16px", fontWeight: "900",
              cursor: loading ? "not-allowed" : "pointer",
              fontFamily: "'Bebas Neue'", letterSpacing: "3px",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "12px"
            }}>
              {loading ? <><span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span> MONTANDO ROTA...</> : "🚀 MONTAR ROTA"}
            </button>
          </div>
        )}

        {step === "resultado" && resultado && (
          <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>

            {/* Raciocínio do DG */}
            {resultado.raciocinio && (
              <div style={{ background: "rgba(46,196,182,0.06)", border: "1px solid rgba(46,196,182,0.2)", borderRadius: "14px", padding: "18px 20px" }}>
                <p style={{ margin: "0 0 6px", fontSize: "11px", color: "#2EC4B6", letterSpacing: "2px", fontFamily: "'Bebas Neue'" }}>🧠 RACIOCÍNIO DO DG</p>
                <p style={{ margin: 0, fontSize: "13px", color: "#aaa", lineHeight: 1.6 }}>{resultado.raciocinio}</p>
              </div>
            )}

            {/* Alertas */}
            {resultado.alertas?.length > 0 && (
              <div style={{ background: "rgba(247,183,49,0.08)", border: "1px solid rgba(247,183,49,0.3)", borderRadius: "14px", padding: "16px 20px" }}>
                <p style={{ margin: "0 0 8px", fontSize: "11px", color: "#F7B731", letterSpacing: "2px", fontFamily: "'Bebas Neue'" }}>⚠️ ALERTAS</p>
                {resultado.alertas.map((a, i) => <p key={i} style={{ margin: "4px 0", fontSize: "13px", color: "#FFD060" }}>{a}</p>)}
              </div>
            )}

            {/* Rotas */}
            {resultado.motoristas?.map((m, mi) => (
              <div key={m.id} style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${CORES[mi % CORES.length]}33`, borderRadius: "20px", overflow: "hidden" }}>
                <div style={{ background: `${CORES[mi % CORES.length]}12`, borderBottom: `1px solid ${CORES[mi % CORES.length]}22`, padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: CORES[mi % CORES.length] }} />
                      <span style={{ fontFamily: "'Bebas Neue'", fontSize: "22px", letterSpacing: "1px" }}>{m.nome}</span>
                      <span style={{ fontSize: "11px", color: "#555", background: "rgba(255,255,255,0.05)", padding: "2px 8px", borderRadius: "20px" }}>{m.zona}</span>
                    </div>
                    <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#666" }}>📍 {m.ponto_partida} · Saída {m.hora_saida}</p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ margin: 0, fontFamily: "'Bebas Neue'", fontSize: "28px", color: CORES[mi % CORES.length] }}>{m.km_total} km</p>
                    <p style={{ margin: 0, fontSize: "12px", color: "#555" }}>{Math.floor(m.tempo_total_min / 60)}h{m.tempo_total_min % 60}min</p>
                  </div>
                </div>

                {m.entregas?.map((e, ei) => (
                  <div key={ei} style={{ padding: "14px 24px", borderBottom: ei < m.entregas.length - 1 ? "1px solid #111" : "none", display: "grid", gridTemplateColumns: "36px 1fr auto", gap: "14px", alignItems: "start" }}>
                    <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: `${CORES[mi % CORES.length]}18`, border: `1px solid ${CORES[mi % CORES.length]}33`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Bebas Neue'", fontSize: "14px", color: CORES[mi % CORES.length] }}>{e.ordem}</div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "11px", color: "#555", fontFamily: "monospace" }}>#{e.numero}</span>
                        <span style={{ color: "#F0EEE8", fontWeight: "500", fontSize: "14px" }}>{e.endereco}</span>
                      </div>
                      <p style={{ margin: "3px 0 0", fontSize: "12px", color: "#666" }}>{e.produto}</p>
                      {e.aguarda && <p style={{ margin: "3px 0 0", fontSize: "11px", color: "#F7B731" }}>⏳ Aguarda abertura da janela no local</p>}
                      {ei > 0 && <p style={{ margin: "3px 0 0", fontSize: "11px", color: "#444", fontFamily: "monospace" }}>↑ {e.km_anterior}km · {e.tempo_anterior_min}min</p>}
                    </div>
                    <div style={{ textAlign: "right", minWidth: "100px" }}>
                      <p style={{ margin: 0, fontFamily: "'Bebas Neue'", fontSize: "20px" }}>{e.chegada_prevista}</p>
                      <p style={{ margin: "2px 0", fontSize: "11px", color: "#555" }}>{e.janela_inicio}–{e.janela_fim}</p>
                      <span style={{ fontSize: "10px", fontWeight: "700", padding: "2px 8px", borderRadius: "20px", background: e.status === "atrasado" ? "rgba(255,59,48,0.15)" : "rgba(52,199,89,0.15)", color: statusColor(e.status) }}>
                        {e.status === "atrasado" ? "⚠️ ATRASADO" : "✅ OK"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ))}

            {/* Feedback */}
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid #1A1A2E", borderRadius: "16px", padding: "24px" }}>
              <p style={{ margin: "0 0 16px", fontFamily: "'Bebas Neue'", fontSize: "18px", color: "#FF6B35", letterSpacing: "2px" }}>💬 TREINAR O DG</p>

              {feedbackEnviado && (
                <div style={{ background: "rgba(52,199,89,0.1)", border: "1px solid rgba(52,199,89,0.3)", borderRadius: "10px", padding: "12px 16px", marginBottom: "16px", fontSize: "13px", color: "#34C759" }}>
                  {feedbackEnviado}
                </div>
              )}

              <div style={{ display: "flex", gap: "10px" }}>
                <input
                  placeholder='Ex: "Não coloque Sabará junto com Savassi, são regiões opostas"'
                  value={feedback}
                  onChange={e => setFeedback(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && enviarFeedback()}
                  style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid #1E1E2E", borderRadius: "10px", padding: "12px 16px", color: "#F0EEE8", fontSize: "13px", outline: "none", fontFamily: "'DM Sans'" }}
                />
                <button onClick={enviarFeedback} disabled={loadingFeedback} style={{
                  background: "linear-gradient(135deg, #FF6B35, #FF3B7A)", border: "none", borderRadius: "10px",
                  padding: "12px 20px", color: "#fff", fontFamily: "'Bebas Neue'", fontSize: "14px",
                  letterSpacing: "1px", cursor: "pointer", whiteSpace: "nowrap"
                }}>{loadingFeedback ? "⟳" : "CORRIGIR"}</button>
              </div>
              <p style={{ margin: "8px 0 0", fontSize: "11px", color: "#444" }}>O DG vai corrigir a rota e aprender com sua correção para as próximas vezes</p>
            </div>

            {/* Ações */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <button onClick={aprovarRota} style={{
                background: "rgba(52,199,89,0.1)", border: "1px solid rgba(52,199,89,0.3)",
                borderRadius: "12px", padding: "16px", color: "#34C759",
                fontFamily: "'Bebas Neue'", fontSize: "16px", letterSpacing: "2px", cursor: "pointer"
              }}>✅ APROVAR ROTA</button>
              <button onClick={() => { setStep("config"); setResultado(null); setFeedbackEnviado(null); }} style={{
                background: "transparent", border: "1px solid #222",
                borderRadius: "12px", padding: "16px", color: "#666",
                fontFamily: "'Bebas Neue'", fontSize: "16px", letterSpacing: "2px", cursor: "pointer"
              }}>← NOVA ROTA</button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input::placeholder { color: #333; }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #0A0A14; }
        ::-webkit-scrollbar-thumb { background: #222; border-radius: 3px; }
      `}</style>
    </div>
  );
}
