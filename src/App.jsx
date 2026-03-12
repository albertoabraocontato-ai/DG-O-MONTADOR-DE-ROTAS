import { useState, useRef, useEffect } from "react";

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

const CORES = ["#FF6B35", "#2EC4B6", "#9B5DE5", "#F7B731", "#E84393"];

function buildSystemPrompt(memoria) {
  const regrasTexto = memoria.regras.length > 0
    ? memoria.regras.map((r, i) => (i + 1) + ". " + r).join("\n")
    : "Nenhuma regra personalizada ainda.";
  const exemploTexto = memoria.rotasAprovadas.length > 0
    ? memoria.rotasAprovadas.slice(-3).map((r, i) => "Exemplo " + (i + 1) + ": " + r.resumo).join("\n")
    : "Nenhuma rota aprovada ainda.";
  const correcoesTexto = memoria.correcoes.length > 0
    ? memoria.correcoes.slice(-5).map((c, i) => "Correcao " + (i + 1) + ": " + c).join("\n")
    : "Nenhuma correcao registrada ainda.";

  return "Voce e o DG, o Montador de Rotas. Treinado pelo dono da operacao para montar rotas EXATAMENTE como ele pensa.\n\n" +
    "AVISO CRITICO: Voce NAO deve listar os enderecos na ordem que recebeu. Voce DEVE reorganizar completamente a ordem das entregas seguindo os passos abaixo. Isso e OBRIGATORIO.\n\n" +
    "PONTO DE PARTIDA FIXO: Rua Manoel Lopes Coelho, 174 - Itapoa, Belo Horizonte, MG.\n\n" +
    "PROCESSO OBRIGATORIO - EXECUTE ESSES PASSOS ANTES DE MONTAR A ROTA:\n\n" +
    "PASSO 1 - IDENTIFIQUE AS REGIOES:\n" +
    "Sabara = Leste extremo (longe de tudo, priorizar se janela apertada)\n" +
    "Vespasiano = Norte extremo\n" +
    "Contagem / Riacho das Pedras = Oeste\n" +
    "Prado / Buritis / Lourdes / Ouro Preto = Sul-Oeste\n" +
    "Gutierrez / Funcionarios / Santa Efigenia = Centro-Sul\n" +
    "Floresta / Coracao Eucaristico = Centro-Norte\n" +
    "Boa Vista / Cachoeirinha / Sagrada Familia = Norte de BH\n" +
    "Santa Ines = Leste de BH\n\n" +
    "PASSO 2 - FORME BLOCOS POR HORARIO DE INICIO DA JANELA:\n" +
    "Bloco 06h = entregas com janela iniciando as 06:00\n" +
    "Bloco 07h = entregas com janela iniciando as 07:00\n" +
    "Bloco 08h = entregas com janela iniciando as 08:00\n" +
    "Bloco 09h = entregas com janela iniciando as 09:00\n" +
    "Bloco 10h = entregas com janela iniciando as 10:00\n\n" +
    "PASSO 3 - ORDENE OS BLOCOS DO MAIS CEDO AO MAIS TARDE:\n" +
    "NUNCA coloque entrega do bloco 08h antes de entrega do bloco 07h.\n" +
    "NUNCA misture blocos diferentes no meio da rota.\n\n" +
    "PASSO 4 - DENTRO DE CADA BLOCO, ORDENE POR PROXIMIDADE GEOGRAFICA:\n" +
    "O motorista deve avancar em linha continua, sem voltar para tras.\n" +
    "Exemplo CORRETO bloco 07h: Gutierrez -> Funcionarios -> Santa Efigenia -> Floresta (sul para norte)\n" +
    "Exemplo ERRADO: Gutierrez -> Floresta -> Funcionarios (zigue-zague, PROIBIDO)\n\n" +
    "PASSO 5 - TRATE ENDERECOS MUITO DISTANTES:\n" +
    "Sabara, Vespasiano e outros municipios distantes devem ser entregues PRIMEIRO se a janela permitir.\n" +
    "Nunca coloque Sabara no meio de uma rota de BH - e o lado oposto da cidade.\n\n" +
    "PASSO 6 - CALCULE O HORARIO DE SAIDA IDEAL:\n" +
    "Nao use horario fixo. Calcule para chegar na primeira entrega exatamente no inicio da janela.\n" +
    "Se chegar antes da janela abrir, o motorista aguarda no local - isso e correto e nao e erro.\n\n" +
    "EXEMPLO VALIDADO PELO DONO (SIGA ESSE PADRAO):\n" +
    "Lista recebida (aleatorio): Gutierrez 07h, Cachoeirinha 09h, Floresta 07h, Boa Vista 08h, Funcionarios 07h, Sagrada Familia 09h, Santa Efigenia 07h\n" +
    "Rota CORRETA: Itapoa 06:10 -> Gutierrez 07:00 -> Funcionarios 07:20 -> Santa Efigenia 07:35 -> Floresta 07:50 -> Boa Vista 08:00 -> Sagrada Familia 09:00 -> Cachoeirinha 09:35\n" +
    "Principio: blocos por horario de inicio, geografia dentro do bloco, linha continua.\n\n" +
    "REGRAS APRENDIDAS COM O DONO:\n" + regrasTexto + "\n\n" +
    "CORRECOES REGISTRADAS:\n" + correcoesTexto + "\n\n" +
    "EXEMPLOS DE ROTAS APROVADAS:\n" + exemploTexto + "\n\n" +
    "FORMATO DE RESPOSTA - Retorne SOMENTE JSON valido, sem markdown, sem texto extra.\n" +
    "O campo ordem DEVE refletir a nova ordem reorganizada, nao a ordem original da lista.\n" +
    '{"motoristas":[{"id":1,"nome":"Motorista 1","ponto_partida":"Rua Manoel Lopes Coelho, 174 - Itapoa, BH","hora_saida":"06:10","zona":"BH Centro/Norte","entregas":[{"ordem":1,"numero":2,"endereco":"Rua Marechal Bitencourt, 212 - Gutierrez","produto":"Box Luxo","janela_inicio":"07:00","janela_fim":"09:00","chegada_prevista":"07:00","aguarda":false,"km_anterior":15,"tempo_anterior_min":50,"status":"ok"}],"km_total":60,"tempo_total_min":240}],"alertas":[],"raciocinio":"Descreva os blocos que formou e a ordem geografica escolhida dentro de cada bloco"}\n\n' +
    "Status: ok se dentro da janela, atrasado se fora. aguarda: true se chega antes da janela abrir.";
}

function buildFeedbackPrompt(rotaAtual, feedback) {
  return "Voce e o DG, o Montador de Rotas.\n\n" +
    "O dono deu o seguinte feedback sobre a rota:\n" +
    '"' + feedback + '"\n\n' +
    "Rota atual:\n" + JSON.stringify(rotaAtual, null, 2) + "\n\n" +
    "Faca os ajustes e retorne SOMENTE JSON valido:\n" +
    '{"rotaCorrigida":{"motoristas":[],"alertas":[],"raciocinio":""},"regraAprendida":"Nunca colocar X junto com Y porque..."}';
}

export default function DGMontadorRotas() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("dg_apikey") || "");
  const [showKey, setShowKey] = useState(false);
  const [imagem, setImagem] = useState(null);
  const [imagemBase64, setImagemBase64] = useState(null);
  const [imagemType, setImagemType] = useState("image/png");
  const [motoristas, setMotoristas] = useState([{ id: 1, nome: "Motorista 1" }]);
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
    setMotoristas([...motoristas, { id: Date.now(), nome: "Motorista " + (motoristas.length + 1) }]);
  };

  const removeMotorista = (id) => {
    if (motoristas.length === 1) return;
    setMotoristas(motoristas.filter(m => m.id !== id));
  };

  const updateMotorista = (id, value) => {
    setMotoristas(motoristas.map(m => m.id === id ? { ...m, nome: value } : m));
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

    const motInfo = motoristas.map(m => m.nome + ": partida de Rua Manoel Lopes Coelho, 174 - Itapoa, BH").join("\n");

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
              { type: "text", text: "Temos " + motoristas.length + " motorista(s):\n" + motInfo + "\n\nREORGANIZE completamente a ordem das entregas seguindo os passos obrigatorios. NAO liste na mesma ordem da imagem." }
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
      m.nome + " (" + m.zona + "): " + m.entregas.map(e => e.endereco.split("-")[0].trim()).join(" -> ")
    ).join(" | ");
    const novaMemoria = {
      ...memoria,
      rotasAprovadas: [...memoria.rotasAprovadas, { resumo, data: new Date().toLocaleDateString("pt-BR"), raciocinio: resultado.raciocinio }]
    };
    setMemoria(novaMemoria);
    salvarMemoria(novaMemoria);
    alert("Rota aprovada e salva na memoria do DG!");
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
          messages: [{ role: "user", content: buildFeedbackPrompt(resultado, feedback) }]
        })
      });
      const data = await res.json();
      const text = data.content?.map(i => i.text || "").join("") || "";
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      const novaMemoria = {
        ...memoria,
        correcoes: [...memoria.correcoes, "Feedback: \"" + feedback + "\" -> Regra: " + parsed.regraAprendida],
        regras: [...memoria.regras, parsed.regraAprendida]
      };
      setMemoria(novaMemoria);
      salvarMemoria(novaMemoria);
      setResultado(parsed.rotaCorrigida);
      setFeedbackEnviado("Rota corrigida! Aprendi: \"" + parsed.regraAprendida + "\"");
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
      setMemoria(m); salvarMemoria(m);
    }
  };

  const statusColor = (s) => s === "atrasado" ? "#FF3B30" : "#34C759";

  return (
    <div style={{ minHeight: "100vh", background: "#080810", fontFamily: "'DM Sans', sans-serif", color: "#F0EEE8" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;700;900&family=Bebas+Neue&display=swap" rel="stylesheet" />
      <div style={{ position: "fixed", inset: 0, zIndex: 0, background: "radial-gradient(ellipse at 20% 20%, rgba(255,107,53,0.08) 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, rgba(46,196,182,0.06) 0%, transparent 50%)" }} />
      <div style={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: "linear-gradient(rgba(255,107,53,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,107,53,0.03) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: "960px", margin: "0 auto", padding: "40px 24px" }}>

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
                {memoria.regras.length} regras aprendidas · {memoria.rotasAprovadas.length} rotas aprovadas · {memoria.correcoes.length} correcoes
              </p>
            </div>
            <button onClick={() => setShowMemoria(!showMemoria)} style={{ background: "rgba(255,107,53,0.1)", border: "1px solid rgba(255,107,53,0.3)", borderRadius: "12px", padding: "10px 16px", color: "#FF6B35", cursor: "pointer", fontSize: "12px", fontFamily: "'DM Sans', sans-serif", fontWeight: "600", letterSpacing: "1px" }}>
              MEMORIA
            </button>
          </div>
        </div>

        {showMemoria && (
          <div style={{ background: "rgba(255,107,53,0.05)", border: "1px solid rgba(255,107,53,0.2)", borderRadius: "16px", padding: "24px", marginBottom: "32px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ margin: 0, fontFamily: "'Bebas Neue'", fontSize: "20px", color: "#FF6B35", letterSpacing: "2px" }}>MEMORIA DO DG</h3>
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
            <div>
              <label style={{ fontSize: "11px", fontFamily: "'Bebas Neue'", color: "#FF6B35", letterSpacing: "3px", display: "block", marginBottom: "10px" }}>00 — CHAVE API ANTHROPIC</label>
              <div style={{ position: "relative" }}>
                <input type={showKey ? "text" : "password"} placeholder="sk-ant-..." value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid #1E1E2E", borderRadius: "10px", padding: "12px 48px 12px 16px", color: "#F0EEE8", fontSize: "14px", outline: "none", fontFamily: "monospace", boxSizing: "border-box" }} />
                <button onClick={() => setShowKey(!showKey)} style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#555", cursor: "pointer" }}>{showKey ? "ocultar" : "ver"}</button>
              </div>
              <p style={{ margin: "6px 0 0", fontSize: "11px", color: "#444" }}>Salva automaticamente no seu navegador</p>
            </div>

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

            <div>
              <label style={{ fontSize: "11px", fontFamily: "'Bebas Neue'", color: "#FF6B35", letterSpacing: "3px", display: "block", marginBottom: "10px" }}>02 — MOTORISTAS</label>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {motoristas.map((m, i) => (
                  <div key={m.id} style={{ display: "grid", gridTemplateColumns: "36px 1fr 36px", gap: "10px", alignItems: "center", background: "rgba(255,255,255,0.02)", border: "1px solid #1A1A2E", borderRadius: "12px", padding: "12px 16px" }}>
                    <div style={{ width: "28px", height: "28px", borderRadius: "8px", background: CORES[i % CORES.length], display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: "900", color: "#fff" }}>{i + 1}</div>
                    <input placeholder="Nome do motorista" value={m.nome} onChange={e => updateMotorista(m.id, e.target.value)}
                      style={{ background: "transparent", border: "none", color: "#F0EEE8", fontSize: "14px", outline: "none", fontFamily: "'DM Sans'" }} />
                    <button onClick={() => removeMotorista(m.id)} style={{ width: "28px", height: "28px", borderRadius: "6px", background: "rgba(255,59,48,0.1)", border: "none", color: "#FF3B30", cursor: "pointer", fontSize: "16px" }}>x</button>
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
              {loading ? "MONTANDO ROTA..." : "MONTAR ROTA"}
            </button>
          </div>
        )}

        {step === "resultado" && resultado && (
          <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>

            {resultado.raciocinio && (
              <div style={{ background: "rgba(46,196,182,0.06)", border: "1px solid rgba(46,196,182,0.2)", borderRadius: "14px", padding: "18px 20px" }}>
                <p style={{ margin: "0 0 6px", fontSize: "11px", color: "#2EC4B6", letterSpacing: "2px", fontFamily: "'Bebas Neue'" }}>RACIOCINIO DO DG</p>
                <p style={{ margin: 0, fontSize: "13px", color: "#aaa", lineHeight: 1.6 }}>{resultado.raciocinio}</p>
              </div>
            )}

            {resultado.alertas?.length > 0 && (
              <div style={{ background: "rgba(247,183,49,0.08)", border: "1px solid rgba(247,183,49,0.3)", borderRadius: "14px", padding: "16px 20px" }}>
                <p style={{ margin: "0 0 8px", fontSize: "11px", color: "#F7B731", letterSpacing: "2px", fontFamily: "'Bebas Neue'" }}>ALERTAS</p>
                {resultado.alertas.map((a, i) => <p key={i} style={{ margin: "4px 0", fontSize: "13px", color: "#FFD060" }}>{a}</p>)}
              </div>
            )}

            {resultado.motoristas?.map((m, mi) => (
              <div key={m.id} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid " + CORES[mi % CORES.length] + "33", borderRadius: "20px", overflow: "hidden" }}>
                <div style={{ background: CORES[mi % CORES.length] + "12", borderBottom: "1px solid " + CORES[mi % CORES.length] + "22", padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: CORES[mi % CORES.length] }} />
                      <span style={{ fontFamily: "'Bebas Neue'", fontSize: "22px", letterSpacing: "1px" }}>{m.nome}</span>
                      <span style={{ fontSize: "11px", color: "#555", background: "rgba(255,255,255,0.05)", padding: "2px 8px", borderRadius: "20px" }}>{m.zona}</span>
                    </div>
                    <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#666" }}>Partida: {m.ponto_partida} · Saida {m.hora_saida}</p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ margin: 0, fontFamily: "'Bebas Neue'", fontSize: "28px", color: CORES[mi % CORES.length] }}>{m.km_total} km</p>
                    <p style={{ margin: 0, fontSize: "12px", color: "#555" }}>{Math.floor(m.tempo_total_min / 60)}h{m.tempo_total_min % 60}min</p>
                  </div>
                </div>

                {m.entregas?.map((e, ei) => (
                  <div key={ei} style={{ padding: "14px 24px", borderBottom: ei < m.entregas.length - 1 ? "1px solid #111" : "none", display: "grid", gridTemplateColumns: "36px 1fr auto", gap: "14px", alignItems: "start" }}>
                    <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: CORES[mi % CORES.length] + "18", border: "1px solid " + CORES[mi % CORES.length] + "33", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Bebas Neue'", fontSize: "14px", color: CORES[mi % CORES.length] }}>{e.ordem}</div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "11px", color: "#555", fontFamily: "monospace" }}>#{e.numero}</span>
                        <span style={{ color: "#F0EEE8", fontWeight: "500", fontSize: "14px" }}>{e.endereco}</span>
                      </div>
                      <p style={{ margin: "3px 0 0", fontSize: "12px", color: "#666" }}>{e.produto}</p>
                      {e.aguarda && <p style={{ margin: "3px 0 0", fontSize: "11px", color: "#F7B731" }}>Aguarda abertura da janela no local</p>}
                      {ei > 0 && <p style={{ margin: "3px 0 0", fontSize: "11px", color: "#444", fontFamily: "monospace" }}>{e.km_anterior}km · {e.tempo_anterior_min}min do anterior</p>}
                    </div>
                    <div style={{ textAlign: "right", minWidth: "100px" }}>
                      <p style={{ margin: 0, fontFamily: "'Bebas Neue'", fontSize: "20px" }}>{e.chegada_prevista}</p>
                      <p style={{ margin: "2px 0", fontSize: "11px", color: "#555" }}>{e.janela_inicio}–{e.janela_fim}</p>
                      <span style={{ fontSize: "10px", fontWeight: "700", padding: "2px 8px", borderRadius: "20px", background: e.status === "atrasado" ? "rgba(255,59,48,0.15)" : "rgba(52,199,89,0.15)", color: statusColor(e.status) }}>
                        {e.status === "atrasado" ? "ATRASADO" : "OK"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ))}

            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid #1A1A2E", borderRadius: "16px", padding: "24px" }}>
              <p style={{ margin: "0 0 16px", fontFamily: "'Bebas Neue'", fontSize: "18px", color: "#FF6B35", letterSpacing: "2px" }}>TREINAR O DG</p>
              {feedbackEnviado && (
                <div style={{ background: "rgba(52,199,89,0.1)", border: "1px solid rgba(52,199,89,0.3)", borderRadius: "10px", padding: "12px 16px", marginBottom: "16px", fontSize: "13px", color: "#34C759" }}>
                  {feedbackEnviado}
                </div>
              )}
              <div style={{ display: "flex", gap: "10px" }}>
                <input
                  placeholder="Ex: Nao coloque Sabara junto com Savassi, sao regioes opostas"
                  value={feedback}
                  onChange={e => setFeedback(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && enviarFeedback()}
                  style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid #1E1E2E", borderRadius: "10px", padding: "12px 16px", color: "#F0EEE8", fontSize: "13px", outline: "none", fontFamily: "'DM Sans'" }}
                />
                <button onClick={enviarFeedback} disabled={loadingFeedback} style={{
                  background: "linear-gradient(135deg, #FF6B35, #FF3B7A)", border: "none", borderRadius: "10px",
                  padding: "12px 20px", color: "#fff", fontFamily: "'Bebas Neue'", fontSize: "14px",
                  letterSpacing: "1px", cursor: "pointer", whiteSpace: "nowrap"
                }}>{loadingFeedback ? "..." : "CORRIGIR"}</button>
              </div>
              <p style={{ margin: "8px 0 0", fontSize: "11px", color: "#444" }}>O DG vai corrigir a rota e aprender com sua correcao para as proximas vezes</p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <button onClick={aprovarRota} style={{ background: "rgba(52,199,89,0.1)", border: "1px solid rgba(52,199,89,0.3)", borderRadius: "12px", padding: "16px", color: "#34C759", fontFamily: "'Bebas Neue'", fontSize: "16px", letterSpacing: "2px", cursor: "pointer" }}>
                APROVAR ROTA
              </button>
              <button onClick={() => { setStep("config"); setResultado(null); setFeedbackEnviado(null); }} style={{ background: "transparent", border: "1px solid #222", borderRadius: "12px", padding: "16px", color: "#666", fontFamily: "'Bebas Neue'", fontSize: "16px", letterSpacing: "2px", cursor: "pointer" }}>
                NOVA ROTA
              </button>
            </div>
          </div>
        )}
      </div>
      <style>{`input::placeholder { color: #333; } * { box-sizing: border-box; }`}</style>
    </div>
  );
}
