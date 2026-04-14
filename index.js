const express = require("express");
const app = express();

app.use(express.json());

// ================= CONFIG =================
const required = ["TOKEN", "ADMIN_ID", "SUPABASE_URL", "SUPABASE_KEY", "GRUPO_ID", "WEBHOOK_SECRET"];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`❌ Variável de ambiente obrigatória não definida: ${key}`);
    process.exit(1);
  }
}

const TOKEN = process.env.TOKEN;
const ADMIN_ID = process.env.ADMIN_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const GRUPO_ID = process.env.GRUPO_ID;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const DASHBOARD_URL = process.env.DASHBOARD_URL || "https://v0-startentregras.vercel.app";

// ================= UTIL =================

function textoParaNumero(texto) {
  texto = texto.toLowerCase();
  const mapa = {
    zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3,
    quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9,
    dez: 10, vinte: 20, trinta: 30, quarenta: 40,
    cinquenta: 50, sessenta: 60, setenta: 70,
    oitenta: 80, noventa: 90, cem: 100, cento: 100
  };

  // Tenta extrair número direto antes de usar o mapa de palavras
  const numeroDirecto = parseFloat(texto.replace(",", "."));
  if (!isNaN(numeroDirecto) && numeroDirecto > 0) return numeroDirecto;

  let total = 0;
  texto.split(" ").forEach(p => {
    if (mapa[p] !== undefined) total += mapa[p];
  });
  return total;
}

// Usado como fallback de categoria quando o usuário não seleciona pelo teclado
function categorizarGasto(texto) {
  texto = texto.toLowerCase();
  if (texto.includes("gasolina") || texto.includes("posto") || texto.includes("combustivel")) return "combustivel";
  if (texto.includes("ifood") || texto.includes("comida") || texto.includes("lanche") || texto.includes("almoco") || texto.includes("jantar")) return "alimentacao";
  if (texto.includes("uber") || texto.includes("99") || texto.includes("onibus") || texto.includes("metro")) return "transporte";
  if (texto.includes("aluguel") || texto.includes("luz") || texto.includes("agua") || texto.includes("internet") || texto.includes("telefone")) return "fixo";
  if (texto.includes("oficina") || texto.includes("mecanico") || texto.includes("pneu") || texto.includes("revisao") || texto.includes("manutencao")) return "manutencao";
  if (texto.includes("multa") || texto.includes("ipva") || texto.includes("seguro")) return "documentos";
  if (texto.includes("mochila") || texto.includes("bag") || texto.includes("capacete") || texto.includes("equipamento")) return "equipamentos";
  return "outros";
}

// Retorna data no formato YYYY-MM-DD no fuso de Brasília (UTC-3)
function dataBrasil(date) {
  const d = date || new Date();
  const offset = -3 * 60;
  const local = new Date(d.getTime() + offset * 60 * 1000);
  return local.toISOString().substring(0, 10);
}

// [FIX #3] Constrói YYYY-MM-DD a partir de dia, mês, ano sem passar por new Date()
// evitando o bug de timezone duplo
function montarDataStr(dia, mes, ano) {
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

// Formata YYYY-MM-DD para DD/MM/AAAA sem off-by-one de timezone
function formatarDataBR(dataStr) {
  const [ano, mes, dia] = dataStr.split("-").map(Number);
  return `${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}/${ano}`;
}

// ================= SUPABASE HELPERS =================

async function getUsuario(chatId) {
  try {
    const res = await fetch(
      SUPABASE_URL + "/rest/v1/usuarios?id=eq." + chatId.toString(),
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: "Bearer " + SUPABASE_KEY
        }
      }
    );
    const data = await res.json();
    return data[0] || null;
  } catch (e) {
    console.error(JSON.stringify({ event: "getUsuario_error", chatId, error: e.message }));
    return null;
  }
}

async function patchUsuario(userId, body) {
  try {
    await fetch(
      SUPABASE_URL + "/rest/v1/usuarios?id=eq." + userId,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: "Bearer " + SUPABASE_KEY,
          Prefer: "return=minimal"
        },
        body: JSON.stringify(body)
      }
    );
  } catch (e) {
    console.error(JSON.stringify({ event: "patchUsuario_error", userId, error: e.message }));
  }
}

// Estado do fluxo salvo na coluna `estado` (jsonb) da tabela usuarios
async function getState(chatId) {
  const user = await getUsuario(chatId);
  return user?.estado || null;
}

async function setState(chatId, state) {
  await patchUsuario(chatId, { estado: state });
}

async function clearState(chatId) {
  await patchUsuario(chatId, { estado: null });
}

// ================= HELPER: envio de comprovante ao admin =================
async function encaminharComprovante(chatId, fileId) {
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendPhoto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: ADMIN_ID,
      photo: fileId,
      caption: `💰 COMPROVANTE RECEBIDO\n\n👤 Usuário: ${chatId}`,
      reply_markup: {
        inline_keyboard: [[
          { text: "✅ Aprovar", callback_data: `aprovar_${chatId}` },
          { text: "❌ Recusar", callback_data: `recusar_${chatId}` }
        ]]
      }
    })
  });
  await clearState(chatId);
  return sendMessage(chatId, "📸 Comprovante enviado para análise! Em breve você receberá a confirmação.");
}

// ================= SERVER =================

app.post("/", async (req, res) => {
  // ===== [FIX #1] AUTENTICAÇÃO DO WEBHOOK =====
  const secret = req.headers["x-telegram-bot-api-secret-token"];
  if (secret !== WEBHOOK_SECRET) {
    console.warn(JSON.stringify({ event: "webhook_auth_failed", ip: req.ip }));
    return res.sendStatus(403);
  }

  res.sendStatus(200);

  const message = req.body.message;
  const callback = req.body.callback_query;

  console.log("BODY:", JSON.stringify(req.body));

  // ================= CALLBACK =================
  if (callback) {
    const data = callback.data;
    const adminChatId = callback.message.chat.id;

    console.log("Callback recebido:", data);

    // ===== [FIX #2] VALIDAR QUE APENAS O ADMIN PODE APROVAR/RECUSAR =====
    if (adminChatId.toString() !== ADMIN_ID.toString()) {
      console.warn(JSON.stringify({ event: "callback_unauthorized", chatId: adminChatId }));
      return;
    }

    const userId = data.split("_")[1];

// 🔍 busca usuário
const user = await getUsuario(userId);

// 🔒 trava duplicação
if (user?.pagamento_aprovado) {
  console.log("Já aprovado:", userId);
  return;
}

// ✅ aprova
await patchUsuario(userId, {
  plano_ate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  pagamento_aprovado: true
});

      await sendMessage(userId, "✅ Pagamento aprovado! Acesso liberado por 30 dias.");

      await fetch(`https://api.telegram.org/bot${TOKEN}/editMessageText`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: adminChatId,
          message_id: callback.message.message_id,
          text: "✅ Pagamento aprovado"
        })
      });
    }

    if (data.startsWith("recusar_")) {
      const userId = data.split("_")[1];

      await sendMessage(userId, "❌ Não identificamos seu pagamento. Envie o comprovante.");

      await fetch(`https://api.telegram.org/bot${TOKEN}/editMessageText`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: adminChatId,
          message_id: callback.message.message_id,
          text: "❌ Pagamento recusado"
        })
      });
    }

    return;
  }

  if (!message) return;

  const chatId = message.chat.id;
  const text = message.text ? message.text.trim() : "";

  // ================= VALIDA ACESSO =================
  const user = await getUsuario(chatId);

  if (user && !text.startsWith("/start")) {
    const agora = new Date();
    const trial = new Date(user.trial_fim);
    const plano = user.plano_ate ? new Date(user.plano_ate) : null;

    if (agora > trial && (!plano || agora > plano)) {
      const textoNorm = text.toLowerCase().replace(/[^a-záéíóúãõâêîôûç\s]/gi, "").trim();

      if (textoNorm === "ja paguei" || text.includes("Já paguei")) {
        await setState(chatId, { step: "comprovante" });
        return sendMessage(chatId, "📸 Envie o comprovante do pagamento (print do PIX).");
      }

      // Comprovante de usuário sem acesso — unificado com bloco abaixo
      if (message.photo) {
        const state = await getState(chatId);
        if (state && state.step === "comprovante") {
          const fileId = message.photo[message.photo.length - 1].file_id;
          return encaminharComprovante(chatId, fileId);
        }
      }

      return sendMessage(chatId,
        `🚫 Seu período grátis acabou.\n\n💰 Assine por R$9,90/mês\n\n📌 PIX:\ncamargoinfomei@gmail.com\n\nApós pagar, clique abaixo 👇`,
        {
          keyboard: [["✅ Já paguei"]],
          resize_keyboard: true
        }
      );
    }
  }

  // ================= COMPROVANTE (usuário com acesso ativo) =================
  // [FIX: bloco unificado — evita duplicação de lógica]
  if (message.photo) {
    const state = await getState(chatId);
    if (state && state.step === "comprovante") {
      const fileId = message.photo[message.photo.length - 1].file_id;
      return encaminharComprovante(chatId, fileId);
    }
  }

  console.log("Mensagem:", text);

  // ================= /start =================
  if (text.startsWith("/start")) {
    try {
      const partes = text.split(" ");
      const ref = partes[1];

      const check = await fetch(
        SUPABASE_URL + "/rest/v1/usuarios?id=eq." + chatId.toString(),
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: "Bearer " + SUPABASE_KEY
          }
        }
      );

      const existe = await check.json();

      if (!existe || existe.length === 0) {
        await fetch(SUPABASE_URL + "/rest/v1/usuarios", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_KEY,
            Authorization: "Bearer " + SUPABASE_KEY
          },
          body: JSON.stringify({
            id: chatId.toString(),
            trial_fim: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
            indicacoes: 0,
            indicados_pagantes: 0,
            estado: null
          })
        });

        if (ref && ref !== chatId.toString()) {
          const refUser = await getUsuario(ref);
          if (refUser) {
            await patchUsuario(ref, {
              indicacoes: (refUser.indicacoes || 0) + 1
            });
          }
        }

        await sendMessage(chatId,
          `👋 Bem-vindo ao *Start Entregas*!\n\n` +
          `📲 Aqui você controla seus ganhos e gastos como entregador de forma simples, pelo Telegram.\n\n` +
          `🎁 Você tem *14 dias grátis* para testar tudo.\n\n` +
          `Vamos começar? 👇`,
          { parse_mode: "Markdown" }
        );
      }
    } catch (e) {
      console.error(JSON.stringify({ event: "start_error", chatId, error: e.message }));
    }

    return sendMenu(chatId);
  }

  // ================= /ajuda =================
  if (text === "/ajuda" || text.toLowerCase() === "ajuda") {
    return sendMessage(chatId,
      `ℹ️ *AJUDA — Start Entregas*\n\n` +
      `➕ *Adicionar ganho* — registra quanto você recebeu\n` +
      `💸 *Registrar gasto* — registra seus gastos\n` +
      `📊 *Ver resumo* — mostra seus ganhos e gastos de hoje, semana e mês\n` +
      `💡 *Sugerir melhoria* — envie uma ideia pro nosso time\n` +
      `🚀 *Indicar e ganhar* — indique amigos e ganhe dias grátis\n\n` +
      `❌ Digite *Cancelar* a qualquer momento para voltar ao menu.`,
      { parse_mode: "Markdown" }
    );
  }

  // ================= CANCELAR =================
  if (text.toLowerCase() === "cancelar" || text === "❌ Cancelar") {
    await clearState(chatId);
    return sendMenu(chatId);
  }

  // Carrega estado atual do usuário uma única vez para todos os handlers abaixo
  const state = await getState(chatId);

  // ================= SUGESTÃO (início) =================
  if (text.includes("Sugerir melhoria")) {
    await setState(chatId, { step: "sugestao" });
    return sendMessage(chatId, "💡 Digite sua sugestão (ou Cancelar para voltar):");
  }

  // ================= INDICAR =================
  if (text.includes("Indicar")) {
    const link = `https://t.me/startentregas_bot?start=${chatId}`;
    const userAtual = await getUsuario(chatId);
    const totalIndicacoes = userAtual ? (userAtual.indicacoes || 0) : 0;

    return sendMessage(chatId,
      `🚀 *Indique e ganhe 1 mês grátis!*\n\n` +
      `Convide amigos que assinarem o plano.\n\n` +
      `📊 Suas indicações: *${totalIndicacoes}*\n\n` +
      `🔗 Seu link:\n${link}`,
      { parse_mode: "Markdown" }
    );
  }

  // ================= VER RESUMO =================
  if (text.includes("Ver resumo")) {
    try {
      const response = await fetch(
        SUPABASE_URL + "/rest/v1/Registros?select=Valor,Data,Tipo,Categoria&user_id=eq." + chatId.toString(),
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: "Bearer " + SUPABASE_KEY
          }
        }
      );

      const dados = await response.json();
      const hoje = new Date();

      const inicioSemana = new Date(hoje);
      inicioSemana.setDate(hoje.getDate() - hoje.getDay());
      inicioSemana.setHours(0, 0, 0, 0);

      const fimSemana = new Date(inicioSemana);
      fimSemana.setDate(inicioSemana.getDate() + 6);
      fimSemana.setHours(23, 59, 59, 999);

      const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);

      let ganhos = 0, gastos = 0;
      let ganhosHoje = 0, gastosHoje = 0;
      let ganhosSemana = 0, gastosSemana = 0;
      let ganhosMes = 0, gastosMes = 0;
      const categoriasMes = {};

      dados.forEach(item => {
        const valor = Number(item.Valor || 0);
        const dataStr = item.Data ? item.Data.substring(0, 10) : null;
        const [ano, mes, dia] = dataStr ? dataStr.split('-').map(Number) : [0, 0, 0];
        const data = new Date(ano, mes - 1, dia);
        const isGasto = item.Tipo === "gasto";

        if (isGasto) gastos += valor;
        else ganhos += valor;

        if (data.toDateString() === hoje.toDateString()) {
          if (isGasto) gastosHoje += valor;
          else ganhosHoje += valor;
        }

        if (data >= inicioSemana && data <= fimSemana) {
          if (isGasto) gastosSemana += valor;
          else ganhosSemana += valor;
        }

        if (data >= inicioMes && data <= fimMes) {
          if (isGasto) {
            gastosMes += valor;
            const cat = item.Categoria || "outros";
            categoriasMes[cat] = (categoriasMes[cat] || 0) + valor;
          } else {
            ganhosMes += valor;
          }
        }
      });

      const categoriasTexto = Object.entries(categoriasMes)
        .sort((a, b) => b[1] - a[1])
        .map(([cat, val]) => `   • ${cat}: R$ ${val.toFixed(2)}`)
        .join("\n");

      const link = `${DASHBOARD_URL}/?user_id=${chatId}`;

      const mensagem =
        "📊 RESUMO FINANCEIRO\n\n" +
        "📅 HOJE\n" +
        "💰 Ganhos: R$ " + ganhosHoje.toFixed(2) + "\n" +
        "💸 Gastos: R$ " + gastosHoje.toFixed(2) + "\n" +
        "📊 Saldo: R$ " + (ganhosHoje - gastosHoje).toFixed(2) + "\n\n" +
        "📆 SEMANA\n" +
        "💰 Ganhos: R$ " + ganhosSemana.toFixed(2) + "\n" +
        "💸 Gastos: R$ " + gastosSemana.toFixed(2) + "\n" +
        "📊 Saldo: R$ " + (ganhosSemana - gastosSemana).toFixed(2) + "\n\n" +
        "🗓 MES\n" +
        "💰 Ganhos: R$ " + ganhosMes.toFixed(2) + "\n" +
        "💸 Gastos: R$ " + gastosMes.toFixed(2) + "\n" +
        "📊 Saldo: R$ " + (ganhosMes - gastosMes).toFixed(2) + "\n" +
        (categoriasTexto ? "\nGastos por categoria:\n" + categoriasTexto + "\n" : "") +
        "\nTOTAL GERAL\n" +
        "💰 Ganhos: R$ " + ganhos.toFixed(2) + "\n" +
        "💸 Gastos: R$ " + gastos.toFixed(2) + "\n" +
        "📊 Saldo: R$ " + (ganhos - gastos).toFixed(2) + "\n\n" +
        "📈 Ver dashboard:\n" + link;

      return sendMessage(chatId, mensagem);

    } catch (error) {
      console.error(JSON.stringify({ event: "resumo_error", chatId, error: error.message }));
      return sendMessage(chatId, "Erro ao buscar dados.");
    }
  }

  // ================= REGISTRAR GASTO =================
  if (text.includes("Registrar gasto")) {
    await setState(chatId, { step: "categoria_gasto", tipo: "gasto" });

    return sendMessage(chatId, "Escolha o tipo de gasto:", {
      keyboard: [
        ["⛽ Combustível", "🔧 Manutenção"],
        ["🍔 Alimentação", "📦 Equipamentos"],
        ["📋 Documentos/Multa", "💼 Pró-labore"],
        ["❓ Outros", "❌ Cancelar"]
      ],
      resize_keyboard: true
    });
  }

  // ================= ADICIONAR GANHO =================
  if (text.includes("Adicionar ganho")) {
    await setState(chatId, { step: "data", tipo: "ganho" });

    return sendMessage(chatId, "Escolha a data:", {
      keyboard: [
        ["📅 Hoje", "📅 Ontem"],
        ["📅 Outra data", "❌ Cancelar"]
      ],
      resize_keyboard: true
    });
  }

  // ================= HANDLERS COM ESTADO =================

  // CATEGORIA
  if (state && state.step === "categoria_gasto") {
    let categoria = "";

    if (text.includes("Combustível")) categoria = "combustivel";
    else if (text.includes("Manutenção")) categoria = "manutencao";
    else if (text.includes("Alimentação")) categoria = "alimentacao";
    else if (text.includes("Equipamentos")) categoria = "equipamentos";
    else if (text.includes("Documentos") || text.includes("Multa")) categoria = "documentos";
    else if (text.includes("Pró-labore")) categoria = "pro_labore";
    else if (text.includes("Outros")) categoria = "outros";
    else if (text.includes("Cancelar")) {
      await clearState(chatId);
      return sendMenu(chatId);
    }

    if (!categoria) return sendMessage(chatId, "Por favor, escolha uma das opções.");

    await setState(chatId, { step: "data", tipo: "gasto", categoria });

    return sendMessage(chatId, "Escolha a data:", {
      keyboard: [
        ["📅 Hoje", "📅 Ontem"],
        ["📅 Outra data", "❌ Cancelar"]
      ],
      resize_keyboard: true
    });
  }

  // DATA
  if (state && state.step === "data") {
    if (text.includes("Hoje")) {
      await setState(chatId, { ...state, step: "valor", data: dataBrasil(new Date()) });
      return sendMessage(chatId, "Digite o valor (ex: 35,90):", {
        keyboard: [["❌ Cancelar"]],
        resize_keyboard: true
      });
    }

    if (text.includes("Ontem")) {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      await setState(chatId, { ...state, step: "valor", data: dataBrasil(d) });
      return sendMessage(chatId, "Digite o valor (ex: 35,90):", {
        keyboard: [["❌ Cancelar"]],
        resize_keyboard: true
      });
    }

    if (text.includes("Outra data")) {
      await setState(chatId, { ...state, step: "digitando_data" });
      return sendMessage(chatId, "Digite o dia (ex: 2) ou DD/MM/AAAA:", {
        keyboard: [["❌ Cancelar"]],
        resize_keyboard: true
      });
    }

    return sendMessage(chatId, "Por favor, escolha uma das opções de data.");
  }

  // DIGITANDO DATA
  if (state && state.step === "digitando_data") {
    const texto = text.trim();

    // [FIX #3] Só dia digitado — monta string sem passar por new Date()
    if (/^\d{1,2}$/.test(texto)) {
      const hoje = new Date();
      const dataStr = montarDataStr(parseInt(texto), hoje.getMonth() + 1, hoje.getFullYear());
      await setState(chatId, { ...state, step: "valor", data: dataStr });
      return sendMessage(chatId, "Digite o valor (ex: 35,90):", {
        keyboard: [["❌ Cancelar"]],
        resize_keyboard: true
      });
    }

    // [FIX #3] DD/MM/AAAA — monta string sem passar por new Date()
    const partes = texto.split("/");
    if (partes.length === 3) {
      const dataStr = montarDataStr(parseInt(partes[0]), parseInt(partes[1]), partes[2]);
      await setState(chatId, { ...state, step: "valor", data: dataStr });
      return sendMessage(chatId, "Digite o valor (ex: 35,90):", {
        keyboard: [["❌ Cancelar"]],
        resize_keyboard: true
      });
    }

    return sendMessage(chatId, "Formato inválido. Digite o dia (ex: 2) ou DD/MM/AAAA:");
  }

  // SUGESTÃO (captura)
  if (state && state.step === "sugestao") {
    // Limita tamanho da sugestão
    const sugestao = text.substring(0, 500);
    await sendMessage(GRUPO_ID, `💡 NOVA SUGESTÃO\n\n👤 User: ${chatId}\n📝 ${sugestao}`);
    await clearState(chatId);
    return sendMessage(chatId, "✅ Sugestão enviada! Obrigado pelo feedback.");
  }

  // VALOR
  if (state && state.step === "valor") {
    let valor = parseFloat(text.replace(",", "."));

    if (isNaN(valor)) {
      valor = textoParaNumero(text);
    }

    if (!valor || valor <= 0) {
      return sendMessage(chatId, "Valor inválido. Digite novamente (ex: 35,90):");
    }

    let categoria = state.categoria;

    if (state.tipo === "gasto" && (!categoria || categoria === "outros")) {
      categoria = categorizarGasto(text);
    }

    try {
      await fetch(SUPABASE_URL + "/rest/v1/Registros", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: "Bearer " + SUPABASE_KEY
        },
        body: JSON.stringify({
          user_id: chatId.toString(),
          Tipo: state.tipo,
          Categoria: categoria,
          Valor: valor,
          Data: state.data
        })
      });

      const tipoTexto = state.tipo === "gasto" ? "💸 Gasto" : "💰 Ganho";

      await sendMessage(chatId,
        `✅ *${tipoTexto} registrado!*\n\n` +
        `💲 Valor: R$ ${valor.toFixed(2)}\n` +
        `📂 Categoria: ${categoria}\n` +
        `📅 Data: ${formatarDataBR(state.data)}`,
        { parse_mode: "Markdown" }
      );

    } catch (e) {
      console.error(JSON.stringify({ event: "salvar_registro_error", chatId, error: e.message }));
      await sendMessage(chatId, "❌ Erro ao salvar. Tente novamente.");
    }

    await clearState(chatId);
    return sendMenu(chatId);
  }
});

// ================= FUNÇÕES =================

function sendMessage(chatId, text, extra) {
  const body = { chat_id: chatId, text };

  if (extra) {
    if (extra.keyboard) {
      body.reply_markup = {
        keyboard: extra.keyboard,
        resize_keyboard: extra.resize_keyboard !== false,
        one_time_keyboard: false
      };
    } else if (extra.remove_keyboard) {
      body.reply_markup = { remove_keyboard: true };
    } else if (extra.inline_keyboard) {
      body.reply_markup = { inline_keyboard: extra.inline_keyboard };
    }
    if (extra.parse_mode) body.parse_mode = extra.parse_mode;
  }

  return fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

function sendMenu(chatId) {
  return sendMessage(chatId, "Escolha uma opção:", {
    keyboard: [
      ["➕ Adicionar ganho", "💸 Registrar gasto"],
      ["📊 Ver resumo", "💡 Sugerir melhoria"],
      ["🚀 Indicar e ganhar"]
    ],
    resize_keyboard: true
  });
}

app.listen(3000, () => {
  console.log("Servidor rodando 🚀");
});
