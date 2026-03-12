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

function buildPromptExtracao() {
  return "Extraia todas as entregas desta imagem e retorne SOMENTE JSON valido, sem markdown.\n" +
    'Formato: {"entregas":[{"numero":1,"endereco":"endereco completo","bairro":"nome do bairro","cidade":"BH ou cidade","janela_inicio":"07:00","janela_fim":"10:00","observacao":"qualquer obs importante"}]}';
}

function buildPromptRota(entregasTexto, nMotoristas, memoria) {
  const regrasTexto = memoria.regras.length > 0
    ? memoria.regras.map((r, i) => (i + 1) + ". " + r).join("\n")
    : "Nenhuma regra ainda.";
  const exemploTexto = memoria.rotasAprovadas.length > 0
    ? memoria.rotasAprovadas.slice(-3).map((r, i) => "Exemplo " + (i + 1) + ": " + r.resumo).join("\n")
    : "Nenhuma rota aprovada ainda.";
  const correcoesTexto = memoria.correcoes.length > 0
    ? memoria.correcoes.slice(-5).map((c, i) => (i + 1) + ". " + c).join("\n")
    : "Nenhuma correcao ainda.";

  return "Voce e o DG, o Montador de Rotas. Monte a rota otimizada para as entregas abaixo.\n\n" +
    "PONTO DE PARTIDA: Rua Manoel Lopes Coelho, 174 - Itapoa, Belo Horizonte, MG.\n" +
    "NUMERO DE MOTORISTAS: " + nMotoristas + "\n\n" +
    "ENTREGAS:\n" + entregasTexto + "\n\n" +
    "=== COMO MONTAR A ROTA ===\n\n" +
    "REGRA 1 - ROTA COMO LINHA CONTINUA NO MAPA:\n" +
    "Pense na rota como uma linha desenhada no mapa. O motorista sai de Itapoa (Leste de BH) e percorre os enderecos formando uma linha continua, sem voltar para tras. Nunca faca o motorista ir de um lado da cidade ao outro e voltar.\n\n" +
    "REGRA 2 - GEOGRAFIA PRIMEIRO, HORARIO DENTRO DA REGIAO:\n" +
    "A ordem das entregas e definida pela POSICAO GEOGRAFICA no mapa. O horario define prioridade DENTRO de uma mesma regiao, nao o trajeto global.\n" +
    "Exemplo correto com 10 entregas:\n" +
    "Itapoa -> Sabara -> Santa Ines -> Lourdes -> Gutierrez -> Coracao Eucaristico -> Prado -> Buritis -> Riacho das Pedras -> Sao Joaquim/Contagem -> Ouro Preto\n" +
    "Por que? O motorista sai de Itapoa (Leste), passa por Sabara (Leste extremo), desce pelo Leste/Centro de BH, atravessa para Sul-Oeste, depois Oeste, termina no Sul. E uma linha continua no mapa.\n\n" +
    "REGRA 3 - MAPA DE REGIOES DE BH:\n" +
    "Leste de BH: Itapoa, Santa Ines, Sao Lucas\n" +
    "Leste extremo / Grande BH: Sabara\n" +
    "Centro-Sul: Gutierrez, Funcionarios, Lourdes\n" +
    "Centro-Norte: Floresta, Coracao Eucaristico, Santa Efigenia\n" +
    "Sul-Oeste: Prado, Buritis, Ouro Preto\n" +
    "Oeste / Grande BH: Contagem, Riacho das Pedras\n" +
    "Norte: Boa Vista, Cachoeirinha, Sagrada Familia\n\n" +
    "REGRA 4 - HORARIO DE SAIDA:\n" +
    "Calcule o horario ideal para chegar na primeira entrega no inicio da janela. Se chegar antes, o motorista aguarda no local. Isso e correto.\n\n" +
    "REGRA 5 - MULTIPLOS MOTORISTAS:\n" +
    "Divida por zonas geograficas. Cada motorista fica com uma regiao continua. Nunca mande 2 motoristas para a mesma regiao.\n\n" +
    "REGRAS APRENDIDAS:\n" + regrasTexto + "\n\n" +
    "CORRECOES ANTERIORES:\n" + correcoesTexto + "\n\n" +
    "ROTAS APROVADAS COMO EXEMPLO:\n" + exemploTexto + "\n\n" +
    "Retorne SOMENTE JSON valido, sem markdown:\n" +
    '{"motoristas":[{"id":1,"nome":"Motorista 1","ponto_partida":"Rua Manoel Lopes Coelho, 174 - Itapoa, BH","hora_saida":"05:10","zona":"Leste/Centro/Sul","entregas":[{"ordem":1,"numero":1,"endereco":"Rua Hipnos, 20 - Ana Lucia","bairro":"Ana Lucia","cidade":"Sabara","janela_inicio":"06:00","janela_fim":"08:30","chegada_prevista":"06:00","aguarda":false,"km_anterior":18,"tempo_anterior_min":50,"status":"ok","observacao":""}],"km_total":80,"tempo_total_min":300}],"alertas":[],"raciocinio":"Explique a logica geografica: por que essa ordem forma uma linha continua no mapa"}';
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
  const [loadingMsg, setLoadingMsg] = useState("");
  const [erro, setErro] = useState(null);
  const [step, setStep] = useState("config");
  const [feedback, setFeedback] = useState("");
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [memoria, setMemoria] = useState(carregarMemoria);
  const [showMemoria, setShowMemoria] = useState(false);
  const [feedbackEnviado, setFeedbackEnviado] = useState(null);
  const [tipoEntrada, setTipoEntrada] = useState("imagem"); // "imagem" | "pdf" | "texto"
  const [textoManual, setTextoManual] = useState("");
  const [pdfBase64, setPdfBase64] = useState(null);
  const [pdfNome, setPdfNome] = useState("");
  const fileRef = useRef();
  const pdfRef = useRef();

  useEffect(() => { if (apiKey) localStorage.setItem("dg_apikey", apiKey); }, [apiKey]);

  const addMotorista = () => setMotoristas([...motoristas, { id: Date.now(), nome: "Motorista " + (motoristas.length + 1) }]);
  const removeMotorista = (id) => { if (motoristas.length > 1) setMotoristas(motoristas.filter(m => m.id !== id)); };
  const updateMotorista = (id, value) => setMotoristas(motoristas.map(m => m.id === id ? { ...m, nome: value } : m));

  const handleImagem = (file) => {
    if (!file) return;
    setImagem(URL.createObjectURL(file));
    setImagemType(file.type || "image/png");
    const reader = new FileReader();
    reader.onload = (e) => setImagemBase64(e.target.result.split(",")[1]);
    reader.readAsDataURL(file);
  };

  const handlePDF = (file) => {
    if (!file) return;
    setPdfNome(file.name);
    const reader = new FileReader();
    reader.onload = (e) => setPdfBase64(e.target.result.split(",")[1]);
    reader.readAsDataURL(file);
  };

  const callAPI = async (messages, system, maxTokens = 4000) => {
    const body = { model: "claude-sonnet-4-20250514", max_tokens: maxTokens, messages };
    if (system) body.system = system;
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey.trim(),
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || "Erro na API"); }
    const data = await res.json();
    const raw = (data.content?.map(i => i.text || "").join("") || "");
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) return match[0];
    return raw.replace(/```json|```/g, "").trim();
  };

  const parseJSONSeguro = (texto) => {
    // Tenta parse direto
    try { return JSON.parse(texto); } catch {}
    // Tenta extrair só o bloco JSON
    try {
      const match = texto.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
    } catch {}
    // JSON truncado: tenta fechar as chaves/colchetes abertos
    try {
      let s = texto.trim();
      // Conta abertura e fechamento
      let opens = (s.match(/\{/g) || []).length - (s.match(/\}/g) || []).length;
      let aopens = (s.match(/\[/g) || []).length - (s.match(/\]/g) || []).length;
      // Remove trailing vírgula se houver
      s = s.replace(/,\s*$/, "");
      s = s.replace(/,\s*\]/, "]");
      // Fecha arrays abertos
      for (let i = 0; i < aopens; i++) s += "]";
      // Fecha objetos abertos
      for (let i = 0; i < opens; i++) s += "}";
      return JSON.parse(s);
    } catch {}
    throw new Error("Nao foi possivel interpretar a resposta. Tente com menos entregas ou use a aba Digitar.");
  };

  const gerarRota = async () => {
    if (tipoEntrada === "imagem" && !imagemBase64) { setErro("Adicione o print da lista de entregas."); return; }
    if (tipoEntrada === "pdf" && !pdfBase64) { setErro("Adicione o PDF da lista de entregas."); return; }
    if (tipoEntrada === "texto" && !textoManual.trim()) { setErro("Digite a lista de entregas no campo de texto."); return; }
    if (!apiKey.trim()) { setErro("Insira sua chave API Anthropic."); return; }
    setLoading(true); setErro(null);

    try {
      let entregasTexto = "";

      if (tipoEntrada === "texto") {
        // Texto direto: extrai via API sem imagem
        setLoadingMsg("Interpretando a lista de entregas...");
        const textoExtracao = await callAPI([{
          role: "user",
          content: "Extraia todas as entregas do texto abaixo e retorne SOMENTE JSON valido, sem markdown.\n" +
            'Formato: {"entregas":[{"numero":1,"endereco":"endereco completo","bairro":"nome do bairro","cidade":"BH ou cidade","janela_inicio":"07:00","janela_fim":"10:00","observacao":"qualquer obs importante"}]}\n\n' +
            "TEXTO:\n" + textoManual
        }]);
        const extraido = parseJSONSeguro(textoExtracao);
        entregasTexto = extraido.entregas.map(e =>
          "Entrega #" + e.numero + ": " + e.endereco +
          " | Bairro: " + (e.bairro || "?") +
          " | Cidade: " + (e.cidade || "BH") +
          " | Janela: " + e.janela_inicio + " ate " + e.janela_fim +
          (e.observacao ? " | OBS: " + e.observacao : "")
        ).join("\n");

      } else if (tipoEntrada === "pdf") {
        // PDF: manda como documento
        setLoadingMsg("Lendo o PDF da lista de entregas...");
        const textoExtracao = await callAPI([{
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
            { type: "text", text: "Extraia todas as entregas deste PDF e retorne SOMENTE JSON valido, sem markdown.\n" +
              'Formato: {"entregas":[{"numero":1,"endereco":"endereco completo","bairro":"nome do bairro","cidade":"BH ou cidade","janela_inicio":"07:00","janela_fim":"10:00","observacao":"qualquer obs importante"}]}' }
          ]
        }], null, 8000);
        const extraido = parseJSONSeguro(textoExtracao);
        entregasTexto = extraido.entregas.map(e =>
          "Entrega #" + e.numero + ": " + e.endereco +
          " | Bairro: " + (e.bairro || "?") +
          " | Cidade: " + (e.cidade || "BH") +
          " | Janela: " + e.janela_inicio + " ate " + e.janela_fim +
          (e.observacao ? " | OBS: " + e.observacao : "")
        ).join("\n");

      } else {
        // Imagem: fluxo original
        setLoadingMsg("Lendo a lista de entregas...");
        const textoExtracao = await callAPI([{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: imagemType, data: imagemBase64 } },
            { type: "text", text: buildPromptExtracao() }
          ]
        }]);
        const extraido = parseJSONSeguro(textoExtracao);
        entregasTexto = extraido.entregas.map(e =>
          "Entrega #" + e.numero + ": " + e.endereco +
          " | Bairro: " + (e.bairro || "?") +
          " | Cidade: " + (e.cidade || "BH") +
          " | Janela: " + e.janela_inicio + " ate " + e.janela_fim +
          (e.observacao ? " | OBS: " + e.observacao : "")
        ).join("\n");
      }

      setLoadingMsg("Montando a rota otimizada...");
      const textoRota = await callAPI([{
        role: "user",
        content: buildPromptRota(entregasTexto, motoristas.length, memoria)
      }], null, 8000);

      const rota = parseJSONSeguro(textoRota);
      rota.motoristas = rota.motoristas.map((m, i) => ({ ...m, nome: motoristas[i]?.nome || m.nome }));

      setResultado(rota);
      setStep("resultado");
    } catch (e) {
      setErro("Erro: " + e.message);
    } finally {
      setLoading(false); setLoadingMsg("");
    }
  };

  const aprovarRota = () => {
    const resumo = resultado.motoristas.map(m =>
      m.nome + " (" + m.zona + "): " + m.entregas.map(e => e.bairro || e.endereco.split("-")[0].trim()).join(" -> ")
    ).join(" | ");
    const novaMemoria = { ...memoria, rotasAprovadas: [...memoria.rotasAprovadas, { resumo, data: new Date().toLocaleDateString("pt-BR") }] };
    setMemoria(novaMemoria); salvarMemoria(novaMemoria);
    alert("Rota aprovada e salva na memoria do DG!");
  };

  const enviarFeedback = async () => {
    if (!feedback.trim()) return;
    setLoadingFeedback(true);
    try {
      const prompt = "Voce e o DG, o Montador de Rotas.\n\nFeedback do dono: \"" + feedback + "\"\n\nRota atual:\n" +
        JSON.stringify(resultado, null, 2) + "\n\nCorrija a rota e retorne SOMENTE JSON:\n" +
        '{"rotaCorrigida":{"motoristas":[],"alertas":[],"raciocinio":""},"regraAprendida":"regra em 1 frase"}';
      const text = await callAPI([{ role: "user", content: prompt }], null, 8000);
      const parsed = parseJSONSeguro(text);
      const novaMemoria = {
        ...memoria,
        correcoes: [...memoria.correcoes, "\"" + feedback + "\" -> " + parsed.regraAprendida],
        regras: [...memoria.regras, parsed.regraAprendida]
      };
      setMemoria(novaMemoria); salvarMemoria(novaMemoria);
      setResultado(parsed.rotaCorrigida);
      setFeedbackEnviado("Rota corrigida! Aprendi: \"" + parsed.regraAprendida + "\"");
      setFeedback("");
    } catch (e) { setErro("Erro: " + e.message); }
    finally { setLoadingFeedback(false); }
  };

  const limparMemoria = () => {
    if (confirm("Apagar todo o aprendizado do DG?")) {
      const m = { regras: [], rotasAprovadas: [], correcoes: [] };
      setMemoria(m); salvarMemoria(m);
    }
  };

  const sc = (s) => s === "atrasado" ? "#FF3B30" : "#34C759";

  return (
    <div style={{ minHeight: "100vh", background: "#080810", fontFamily: "'DM Sans', sans-serif", color: "#F0EEE8" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;700;900&family=Bebas+Neue&display=swap" rel="stylesheet" />
      <div style={{ position: "fixed", inset: 0, zIndex: 0, background: "radial-gradient(ellipse at 20% 20%, rgba(255,107,53,0.08) 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, rgba(46,196,182,0.06) 0%, transparent 50%)" }} />
      <div style={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: "linear-gradient(rgba(255,107,53,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,107,53,0.03) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: "960px", margin: "0 auto", padding: "40px 24px" }}>

        <div style={{ marginBottom: "48px", borderBottom: "1px solid #1A1A2E", paddingBottom: "32px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <p style={{ margin: "0 0 4px", fontFamily: "'Bebas Neue'", fontSize: "13px", color: "#FF6B35", letterSpacing: "4px" }}>SISTEMA DE ROTAS INTELIGENTE</p>
              <h1 style={{ margin: 0, fontFamily: "'Bebas Neue'", fontSize: "64px", lineHeight: 0.9, letterSpacing: "2px" }}>
                DG <span style={{ color: "#FF6B35" }}>—</span><br /><span style={{ color: "#FF6B35" }}>O MONTADOR</span><br />DE ROTAS
              </h1>
              <p style={{ margin: "16px 0 0", color: "#666", fontSize: "14px" }}>
                {memoria.regras.length} regras · {memoria.rotasAprovadas.length} rotas aprovadas · {memoria.correcoes.length} correcoes
              </p>
            </div>
            <button onClick={() => setShowMemoria(!showMemoria)} style={{ background: "rgba(255,107,53,0.1)", border: "1px solid rgba(255,107,53,0.3)", borderRadius: "12px", padding: "10px 16px", color: "#FF6B35", cursor: "pointer", fontSize: "12px", fontWeight: "600" }}>MEMORIA</button>
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
                  memoria.regras.map((r, i) => <div key={i} style={{ background: "rgba(255,255,255,0.03)", borderRadius: "8px", padding: "8px 12px", marginBottom: "6px", fontSize: "12px", color: "#aaa", borderLeft: "2px solid #FF6B35" }}>{r}</div>)}
              </div>
              <div>
                <p style={{ margin: "0 0 10px", fontSize: "11px", color: "#2EC4B6", letterSpacing: "2px", textTransform: "uppercase" }}>Rotas aprovadas</p>
                {memoria.rotasAprovadas.length === 0 ? <p style={{ color: "#444", fontSize: "13px" }}>Nenhuma ainda</p> :
                  memoria.rotasAprovadas.map((r, i) => <div key={i} style={{ background: "rgba(255,255,255,0.03)", borderRadius: "8px", padding: "8px 12px", marginBottom: "6px", fontSize: "12px", color: "#aaa", borderLeft: "2px solid #2EC4B6" }}><span style={{ color: "#666", fontSize: "10px" }}>{r.data} · </span>{r.resumo}</div>)}
              </div>
            </div>
          </div>
        )}

        {step === "config" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            <div>
              <label style={{ fontSize: "11px", fontFamily: "'Bebas Neue'", color: "#FF6B35", letterSpacing: "3px", display: "block", marginBottom: "10px" }}>00 — CHAVE API ANTHROPIC</label>
              <div style={{ position: "relative" }}>
                <input type={showKey ? "text" : "password"} placeholder="sk-ant-..." value={apiKey} onChange={e => setApiKey(e.target.value)}
                  style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid #1E1E2E", borderRadius: "10px", padding: "12px 60px 12px 16px", color: "#F0EEE8", fontSize: "14px", outline: "none", fontFamily: "monospace", boxSizing: "border-box" }} />
                <button onClick={() => setShowKey(!showKey)} style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: "12px" }}>{showKey ? "ocultar" : "ver"}</button>
              </div>
            </div>

            <div>
              <label style={{ fontSize: "11px", fontFamily: "'Bebas Neue'", color: "#FF6B35", letterSpacing: "3px", display: "block", marginBottom: "10px" }}>01 — LISTA DE ENTREGAS</label>

              {/* Tabs */}
              <div style={{ display: "flex", gap: "6px", marginBottom: "12px" }}>
                {[["imagem", "📷 Print/Foto"], ["pdf", "📄 PDF"], ["texto", "✏️ Digitar"]].map(([tipo, label]) => (
                  <button key={tipo} onClick={() => setTipoEntrada(tipo)} style={{
                    flex: 1, padding: "8px", borderRadius: "8px", border: "none", cursor: "pointer",
                    fontFamily: "'DM Sans'", fontSize: "12px", fontWeight: "600",
                    background: tipoEntrada === tipo ? "#FF6B35" : "rgba(255,255,255,0.04)",
                    color: tipoEntrada === tipo ? "#fff" : "#666",
                    transition: "all 0.2s"
                  }}>{label}</button>
                ))}
              </div>

              {/* Imagem */}
              {tipoEntrada === "imagem" && (
                <div onClick={() => fileRef.current.click()} onDrop={e => { e.preventDefault(); handleImagem(e.dataTransfer.files[0]); }} onDragOver={e => e.preventDefault()}
                  style={{ border: imagem ? "2px solid #FF6B35" : "2px dashed #222", borderRadius: "16px", padding: imagem ? 0 : "40px 24px", textAlign: "center", cursor: "pointer", overflow: "hidden", minHeight: imagem ? "160px" : "auto", position: "relative" }}>
                  {imagem ? (
                    <>
                      <img src={imagem} alt="Lista" style={{ width: "100%", display: "block", maxHeight: "300px", objectFit: "contain" }} />
                      <div style={{ position: "absolute", bottom: "12px", right: "12px", background: "#FF6B35", color: "#fff", borderRadius: "8px", padding: "6px 12px", fontSize: "12px", fontWeight: "700" }}>Trocar</div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: "28px", marginBottom: "8px" }}>📷</div>
                      <p style={{ margin: 0, color: "#555", fontSize: "14px" }}>Arraste o print ou clique para selecionar</p>
                      <p style={{ margin: "4px 0 0", color: "#444", fontSize: "11px" }}>JPG, PNG, WEBP</p>
                    </>
                  )}
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleImagem(e.target.files[0])} />

              {/* PDF */}
              {tipoEntrada === "pdf" && (
                <div onClick={() => pdfRef.current.click()} onDrop={e => { e.preventDefault(); handlePDF(e.dataTransfer.files[0]); }} onDragOver={e => e.preventDefault()}
                  style={{ border: pdfBase64 ? "2px solid #FF6B35" : "2px dashed #222", borderRadius: "16px", padding: "32px 24px", textAlign: "center", cursor: "pointer" }}>
                  {pdfBase64 ? (
                    <div>
                      <div style={{ fontSize: "32px" }}>📄</div>
                      <p style={{ margin: "8px 0 4px", color: "#FF6B35", fontWeight: "700", fontSize: "14px" }}>{pdfNome}</p>
                      <p style={{ margin: 0, color: "#555", fontSize: "12px" }}>Clique para trocar</p>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: "28px", marginBottom: "8px" }}>📄</div>
                      <p style={{ margin: 0, color: "#555", fontSize: "14px" }}>Arraste o PDF ou clique para selecionar</p>
                      <p style={{ margin: "4px 0 0", color: "#444", fontSize: "11px" }}>Apenas arquivos .PDF</p>
                    </>
                  )}
                </div>
              )}
              <input ref={pdfRef} type="file" accept=".pdf,application/pdf" style={{ display: "none" }} onChange={e => handlePDF(e.target.files[0])} />

              {/* Texto */}
              {tipoEntrada === "texto" && (
                <div>
                  <textarea
                    value={textoManual}
                    onChange={e => setTextoManual(e.target.value)}
                    placeholder={"Digite ou cole a lista de entregas aqui.\nExemplo:\n1. Rua das Flores, 100 - Gutierrez | 07:00 - 10:00\n2. Av. Principal, 500 - Buritis | 08:00 - 12:00\n..."}
                    style={{
                      width: "100%", minHeight: "200px", background: "rgba(255,255,255,0.04)",
                      border: "2px dashed #333", borderRadius: "14px", padding: "14px 16px",
                      color: "#F0EEE8", fontSize: "13px", outline: "none", resize: "vertical",
                      fontFamily: "'DM Sans'", lineHeight: 1.6, boxSizing: "border-box"
                    }}
                  />
                  <p style={{ margin: "6px 0 0", fontSize: "11px", color: "#444" }}>
                    Escreva um endereco por linha. Inclua horarios no formato HH:MM.
                  </p>
                </div>
              )}
            </div>

            <div>
              <label style={{ fontSize: "11px", fontFamily: "'Bebas Neue'", color: "#FF6B35", letterSpacing: "3px", display: "block", marginBottom: "10px" }}>02 — MOTORISTAS</label>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {motoristas.map((m, i) => (
                  <div key={m.id} style={{ display: "grid", gridTemplateColumns: "36px 1fr 36px", gap: "10px", alignItems: "center", background: "rgba(255,255,255,0.02)", border: "1px solid #1A1A2E", borderRadius: "12px", padding: "12px 16px" }}>
                    <div style={{ width: "28px", height: "28px", borderRadius: "8px", background: CORES[i % CORES.length], display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: "900", color: "#fff" }}>{i + 1}</div>
                    <input value={m.nome} onChange={e => updateMotorista(m.id, e.target.value)} style={{ background: "transparent", border: "none", color: "#F0EEE8", fontSize: "14px", outline: "none" }} />
                    <button onClick={() => removeMotorista(m.id)} style={{ width: "28px", height: "28px", borderRadius: "6px", background: "rgba(255,59,48,0.1)", border: "none", color: "#FF3B30", cursor: "pointer", fontSize: "16px" }}>x</button>
                  </div>
                ))}
                <button onClick={addMotorista} style={{ background: "transparent", border: "1px dashed #222", borderRadius: "10px", padding: "10px", color: "#555", cursor: "pointer", fontSize: "13px" }}>+ Adicionar motorista</button>
              </div>
            </div>

            {erro && <div style={{ background: "rgba(255,59,48,0.1)", border: "1px solid rgba(255,59,48,0.3)", borderRadius: "10px", padding: "12px 16px", color: "#FF3B30", fontSize: "13px" }}>{erro}</div>}

            <button onClick={gerarRota} disabled={loading} style={{
              background: loading ? "#1A1A2E" : "linear-gradient(135deg, #FF6B35 0%, #FF3B7A 100%)",
              border: "none", borderRadius: "14px", padding: "20px", color: "#fff", fontSize: "16px",
              fontWeight: "900", cursor: loading ? "not-allowed" : "pointer", fontFamily: "'Bebas Neue'",
              letterSpacing: "3px", display: "flex", alignItems: "center", justifyContent: "center", gap: "12px"
            }}>
              {loading ? (loadingMsg || "PROCESSANDO...") : "MONTAR ROTA"}
            </button>
            {loading && <p style={{ textAlign: "center", color: "#444", fontSize: "11px", margin: 0 }}>Etapa 1: lendo a lista → Etapa 2: montando a rota otimizada</p>}
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
              <div key={mi} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid " + CORES[mi % CORES.length] + "33", borderRadius: "20px", overflow: "hidden" }}>
                <div style={{ background: CORES[mi % CORES.length] + "12", borderBottom: "1px solid " + CORES[mi % CORES.length] + "22", padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: CORES[mi % CORES.length] }} />
                      <span style={{ fontFamily: "'Bebas Neue'", fontSize: "22px", letterSpacing: "1px" }}>{m.nome}</span>
                      <span style={{ fontSize: "11px", color: "#555", background: "rgba(255,255,255,0.05)", padding: "2px 8px", borderRadius: "20px" }}>{m.zona}</span>
                    </div>
                    <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#666" }}>Saida: {m.hora_saida} de Itapoa</p>
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
                        {e.bairro && <span style={{ fontSize: "11px", color: "#666" }}>{e.bairro} {e.cidade && e.cidade !== "BH" ? "- " + e.cidade : ""}</span>}
                      </div>
                      {e.observacao && <p style={{ margin: "3px 0 0", fontSize: "11px", color: "#F7B731" }}>{e.observacao}</p>}
                      {e.aguarda && <p style={{ margin: "3px 0 0", fontSize: "11px", color: "#F7B731" }}>Aguarda abertura da janela</p>}
                      {ei > 0 && <p style={{ margin: "3px 0 0", fontSize: "11px", color: "#444", fontFamily: "monospace" }}>{e.km_anterior}km · {e.tempo_anterior_min}min do anterior</p>}
                    </div>
                    <div style={{ textAlign: "right", minWidth: "100px" }}>
                      <p style={{ margin: 0, fontFamily: "'Bebas Neue'", fontSize: "20px" }}>{e.chegada_prevista}</p>
                      <p style={{ margin: "2px 0", fontSize: "11px", color: "#555" }}>{e.janela_inicio}–{e.janela_fim}</p>
                      <span style={{ fontSize: "10px", fontWeight: "700", padding: "2px 8px", borderRadius: "20px", background: e.status === "atrasado" ? "rgba(255,59,48,0.15)" : "rgba(52,199,89,0.15)", color: sc(e.status) }}>
                        {e.status === "atrasado" ? "ATRASADO" : "OK"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ))}

            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid #1A1A2E", borderRadius: "16px", padding: "24px" }}>
              <p style={{ margin: "0 0 16px", fontFamily: "'Bebas Neue'", fontSize: "18px", color: "#FF6B35", letterSpacing: "2px" }}>TREINAR O DG</p>
              {feedbackEnviado && <div style={{ background: "rgba(52,199,89,0.1)", border: "1px solid rgba(52,199,89,0.3)", borderRadius: "10px", padding: "12px 16px", marginBottom: "16px", fontSize: "13px", color: "#34C759" }}>{feedbackEnviado}</div>}
              <div style={{ display: "flex", gap: "10px" }}>
                <input placeholder="Ex: Riacho das Pedras deveria vir antes de Buritis" value={feedback} onChange={e => setFeedback(e.target.value)} onKeyDown={e => e.key === "Enter" && enviarFeedback()}
                  style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid #1E1E2E", borderRadius: "10px", padding: "12px 16px", color: "#F0EEE8", fontSize: "13px", outline: "none" }} />
                <button onClick={enviarFeedback} disabled={loadingFeedback} style={{ background: "linear-gradient(135deg, #FF6B35, #FF3B7A)", border: "none", borderRadius: "10px", padding: "12px 20px", color: "#fff", fontFamily: "'Bebas Neue'", fontSize: "14px", letterSpacing: "1px", cursor: "pointer", whiteSpace: "nowrap" }}>
                  {loadingFeedback ? "..." : "CORRIGIR"}
                </button>
              </div>
              <p style={{ margin: "8px 0 0", fontSize: "11px", color: "#444" }}>O DG corrige a rota e salva a regra para sempre</p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <button onClick={aprovarRota} style={{ background: "rgba(52,199,89,0.1)", border: "1px solid rgba(52,199,89,0.3)", borderRadius: "12px", padding: "16px", color: "#34C759", fontFamily: "'Bebas Neue'", fontSize: "16px", letterSpacing: "2px", cursor: "pointer" }}>APROVAR ROTA</button>
              <button onClick={() => { setStep("config"); setResultado(null); setFeedbackEnviado(null); }} style={{ background: "transparent", border: "1px solid #222", borderRadius: "12px", padding: "16px", color: "#666", fontFamily: "'Bebas Neue'", fontSize: "16px", letterSpacing: "2px", cursor: "pointer" }}>NOVA ROTA</button>
            </div>
          </div>
        )}
      </div>
      <style>{`input::placeholder{color:#333}*{box-sizing:border-box}`}</style>
    </div>
  );
}
